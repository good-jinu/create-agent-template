#!/usr/bin/env bash
set -euo pipefail

# ─── Paths ────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FIREBASE_CONFIG="packages/functions/firebase.json"
FIREBASERC="packages/functions/.firebaserc"
STATE_FILE=".deploy-state"
TOKENS_FILE=".slack-tokens.json"
MANIFEST_FILE="packages/functions/slack-manifest.json"

cd "$ROOT_DIR"

# ─── Helpers ──────────────────────────────────────────────────────
log()     { echo "▶  $*" >&2; }
success() { echo "✅ $*" >&2; }
fail()    { echo "❌ $*" >&2; exit 1; }
hr()      { echo "────────────────────────────────────────" >&2; }

# ─── Arguments ───────────────────────────────────────────────────
IS_LOCAL=false
TUNNEL_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --local) IS_LOCAL=true; shift ;;
    --url)   TUNNEL_URL="$2"; shift 2 ;;
    *)       shift ;;
  esac
done

if [[ "$IS_LOCAL" == "true" ]] && [[ -f "packages/localRun/slack-manifest.json" ]]; then
  MANIFEST_FILE="packages/localRun/slack-manifest.json"
  log "Using local manifest: $MANIFEST_FILE (Socket Mode)"
fi

# ─── Token Rotation ───────────────────────────────────────────────
rotate_tokens() {
  local refresh_token="${SLACK_CONFIG_REFRESH_TOKEN:-}"
  
  if [[ -f "$TOKENS_FILE" ]]; then
    local stored_refresh="$(jq -r '.refresh_token // empty' "$TOKENS_FILE")"
    [[ -n "$stored_refresh" ]] && refresh_token="$stored_refresh"
  fi

  if [[ -z "$refresh_token" ]]; then
    log "No refresh token available to rotate."
    return 1
  fi

  log "Rotating Slack configuration tokens..."
  local RESPONSE="$(curl -s -X POST https://slack.com/api/tooling.tokens.rotate \
    --data-urlencode "refresh_token=$refresh_token")"

  if [[ "$(echo "$RESPONSE" | jq -r '.ok // false')" == "true" ]]; then
    SLACK_CONFIG_TOKEN="$(echo "$RESPONSE" | jq -r '.token' | tr -d '[:space:]')"
    local NEW_REFRESH="$(echo "$RESPONSE" | jq -r '.refresh_token' | tr -d '[:space:]')"
    
    echo "{\"access_token\": \"$SLACK_CONFIG_TOKEN\", \"refresh_token\": \"$NEW_REFRESH\"}" > "$TOKENS_FILE"
    success "Slack tokens rotated and saved to $TOKENS_FILE"
    log "Waiting for token propagation..."
    sleep 2
    return 0
  else
    local ERR="$(echo "$RESPONSE" | jq -r '.error // "unknown_error"')"
    log "Token rotation failed ($ERR)."
    log "Response: $RESPONSE"
    return 1
  fi
}

# ─── Dependency check ─────────────────────────────────────────────
REQUIRED_CMDS=("jq" "curl")
if [[ "$IS_LOCAL" == "false" ]]; then
  REQUIRED_CMDS+=("firebase")
fi

for cmd in "${REQUIRED_CMDS[@]}"; do
  command -v "$cmd" &>/dev/null || fail "Required tool not found: $cmd"
done

# ─── Slack API Wrapper ──────────────────────────────────────────
slack_api_call() {
  local method="$1"
  local body="$2"
  local retry_on_expiry="${3:-true}"

  local result="$(
    curl -s -X POST "https://slack.com/api/$method" \
      -H "Authorization: Bearer $SLACK_CONFIG_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$body"
  )"

  local ok="$(echo "$result" | jq -r '.ok // false')"
  local error="$(echo "$result" | jq -r '.error // empty')"

  if [[ "$ok" == "false" ]] && [[ "$error" == "token_expired" || "$error" == "invalid_auth" ]] && [[ "$retry_on_expiry" == "true" ]]; then
    log "Token expired or invalid. Attempting rotation..."
    if rotate_tokens; then
      # Retry once with the new token
      slack_api_call "$method" "$body" "false"
    else
      echo "$result"
    fi
  else
    echo "$result"
  fi
}

# ─── Load persisted state ─────────────────────────────────────────
[[ -f "$STATE_FILE" ]] && source "$STATE_FILE"
SLACK_APP_ID="${SLACK_APP_ID:-}"

# ─── Slack Config ─────────────────────────────────────────────────
SLACK_CONFIG_TOKEN="${SLACK_CONFIG_TOKEN:-}"

if [[ -f "$TOKENS_FILE" ]]; then
  SLACK_CONFIG_TOKEN="$(jq -r '.access_token // empty' "$TOKENS_FILE" | tr -d '[:space:]')"
fi

if [[ -z "$SLACK_CONFIG_TOKEN" ]]; then
  rotate_tokens || fail "SLACK_CONFIG_TOKEN is missing and rotation failed."
fi

FIREBASE_REGION="${FIREBASE_REGION:-us-central1}"
FIREBASE_PROJECT="$(jq -r '.projects.default' "$FIREBASERC")"

hr
echo "  Deploying Slack App" >&2
echo "  Project:  $FIREBASE_PROJECT" >&2
echo "  App ID:   ${SLACK_APP_ID:-"(new)"}" >&2
hr

# ─── Step 1: Get function URL ─────────────────────────────────────
FUNCTION_URL=""

if [[ -n "$TUNNEL_URL" ]]; then
  FUNCTION_URL="$TUNNEL_URL"
  log "Using provided Tunnel URL: $FUNCTION_URL"
elif [[ "$IS_LOCAL" == "false" ]]; then
  log "Fetching slackbot function URL..."
  FUNCTIONS_JSON="$(firebase functions:list --config "$FIREBASE_CONFIG" --json 2>/dev/null || echo '[]')"
  FUNCTION_URL="$(
    echo "$FUNCTIONS_JSON" \
    | jq -r '
        if type == "array" then .[]
        elif .functions then .functions[]
        else . end
        | select(
            (.name // "" | test("slackbot"; "i")) or
            (.id   // "" | test("slackbot"; "i"))
          )
        | .httpsTrigger.url // .uri // .url // empty
      ' 2>/dev/null | head -1 || true
  )"

  if [[ -z "$FUNCTION_URL" ]] && command -v gcloud &>/dev/null; then
    log "Trying gcloud fallback..."
    FUNCTION_URL="$(
      gcloud run services describe slackbot \
        --region="$FIREBASE_REGION" \
        --project="$FIREBASE_PROJECT" \
        --format='value(status.url)' 2>/dev/null || true
    )"
  fi
  
  [[ -z "$FUNCTION_URL" ]] && fail "Could not resolve function URL. Deploy Firebase first or provide --url."
fi

if [[ -n "$FUNCTION_URL" ]]; then
  EVENTS_URL="${FUNCTION_URL}/events"
  success "Function URL: $EVENTS_URL"
fi

# ─── Step 2: Inject URL into manifest ────────────────────────────
if [[ -n "$FUNCTION_URL" ]]; then
  MANIFEST="$(
    jq \
      --arg url "$EVENTS_URL" \
      '.settings.event_subscriptions.request_url = $url | .settings.interactivity.request_url = $url' \
      "$MANIFEST_FILE"
  )"
else
  MANIFEST="$(cat "$MANIFEST_FILE")"
fi

# ─── Step 3: Create or update Slack app ──────────────────────────
if [[ -z "$SLACK_APP_ID" ]]; then
  log "Creating Slack app..."
  # Slack API expects 'manifest' as a string
  POST_BODY="$(jq -n --arg manifest "$MANIFEST" '{"manifest": $manifest}')"
  
  RESPONSE="$(slack_api_call "apps.manifest.create" "$POST_BODY")"
  
  if [[ "$(echo "$RESPONSE" | jq -r '.ok')" == "true" ]]; then
    SLACK_APP_ID="$(echo "$RESPONSE" | jq -r '.app_id')"
    NEW_BOT_TOKEN="$(echo "$RESPONSE" | jq -r '.credentials.bot_token')"
    NEW_SIGNING_SECRET="$(echo "$RESPONSE" | jq -r '.credentials.signing_secret')"
  
    echo "SLACK_APP_ID=$SLACK_APP_ID" > "$STATE_FILE"
    success "Slack app created: $SLACK_APP_ID"
  else
    log "Error Response: $RESPONSE"
    fail "Slack app creation failed: $(echo "$RESPONSE" | jq -r '.error')"
  fi

  # ─── Sync real secrets ──────────────────────────────────────────
  if [[ "$IS_LOCAL" == "false" ]]; then
    log "Pushing real Slack credentials to Firebase Secret Manager..."
    [[ -n "${NEW_BOT_TOKEN:-}" && "$NEW_BOT_TOKEN" != "null" ]] && \
      printf "%s" "$NEW_BOT_TOKEN"       | firebase functions:secrets:set SLACK_BOT_TOKEN     --config "$FIREBASE_CONFIG" --non-interactive
    [[ -n "${NEW_SIGNING_SECRET:-}" && "$NEW_SIGNING_SECRET" != "null" ]] && \
      printf "%s" "$NEW_SIGNING_SECRET"  | firebase functions:secrets:set SLACK_SIGNING_SECRET --config "$FIREBASE_CONFIG" --non-interactive
    success "Secrets updated in Secret Manager (from creation)"
  fi

  # Helper to update or append to .env
  update_env() {
    local key="$1"
    local value="$2"
    [[ -z "$value" || "$value" == "null" ]] && return
    if grep -q "^${key}=" .env; then
      sed -i.bak "s|^${key}=.*|${key}=${value}|" .env && rm .env.bak
    else
      echo "${key}=${value}" >> .env
    fi
  }

  if [[ -f ".env" ]]; then
    update_env "SLACK_BOT_TOKEN" "${NEW_BOT_TOKEN:-}"
    update_env "SLACK_SIGNING_SECRET" "${NEW_SIGNING_SECRET:-}"
    success "Local .env updated"
  fi
else
  log "Updating Slack app manifest ($SLACK_APP_ID)..."
  POST_BODY="$(jq -n --arg app_id "$SLACK_APP_ID" --arg manifest "$MANIFEST" '{"app_id": $app_id, "manifest": $manifest}')"

  RESPONSE="$(slack_api_call "apps.manifest.update" "$POST_BODY")"
  
  if [[ "$(echo "$RESPONSE" | jq -r '.ok')" == "true" ]]; then
    success "Slack app manifest updated"
  else
    log "Error Response: $RESPONSE"
    fail "Slack manifest update failed: $(echo "$RESPONSE" | jq -r '.error')"
  fi

  # ─── Sync secrets from .env if they exist ───────────────────────
  if [[ "$IS_LOCAL" == "false" ]] && [[ -f ".env" ]]; then
    log "Ensuring secrets in .env are synced to Firebase..."
    # Load .env values
    ENV_BOT_TOKEN="$(grep "^SLACK_BOT_TOKEN=" .env | cut -d'=' -f2- || true)"
    ENV_SIGNING_SECRET="$(grep "^SLACK_SIGNING_SECRET=" .env | cut -d'=' -f2- || true)"

    if [[ -n "$ENV_BOT_TOKEN" && "$ENV_BOT_TOKEN" != "placeholder" ]]; then
      log "Syncing SLACK_BOT_TOKEN to Firebase..."
      printf "%s" "$ENV_BOT_TOKEN" | firebase functions:secrets:set SLACK_BOT_TOKEN --config "$FIREBASE_CONFIG" --non-interactive
    fi
    if [[ -n "$ENV_SIGNING_SECRET" && "$ENV_SIGNING_SECRET" != "placeholder" ]]; then
      log "Syncing SLACK_SIGNING_SECRET to Firebase..."
      printf "%s" "$ENV_SIGNING_SECRET" | firebase functions:secrets:set SLACK_SIGNING_SECRET --config "$FIREBASE_CONFIG" --non-interactive
    fi
  fi
fi

hr
success "Slack deployment complete!"

if [[ -n "${SLACK_APP_ID:-}" ]]; then
  echo "" >&2
  echo "  Next steps for your Slack App ($SLACK_APP_ID):" >&2
  echo "  1. Get your Signing Secret and add to .env if missing:" >&2
  echo "     https://api.slack.com/apps/$SLACK_APP_ID/settings/basic-info" >&2
  echo "  2. Install the app to your workspace (and get Bot Token):" >&2
  echo "     https://api.slack.com/apps/$SLACK_APP_ID/install-on-team" >&2
  echo "  3. If using Socket Mode (localRun), generate an App-Level Token:" >&2
  echo "     https://api.slack.com/apps/$SLACK_APP_ID/tokens" >&2
  echo "  4. Ensure SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET are in .env" >&2
  echo "  5. Run this script again to sync them to Firebase Secret Manager" >&2
  echo "" >&2
fi
