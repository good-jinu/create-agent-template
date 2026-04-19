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
log()     { echo "▶  $*"; }
success() { echo "✅ $*"; }
fail()    { echo "❌ $*" >&2; exit 1; }
hr()      { echo "────────────────────────────────────────"; }

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
    log "No refresh token found. Using SLACK_CONFIG_TOKEN from environment."
    return 0
  fi

  log "Rotating Slack configuration tokens..."
  local RESPONSE="$(curl -sf -X POST https://slack.com/api/tooling.tokens.rotate \
    -H "Authorization: Bearer $refresh_token")"

  if [[ "$(echo "$RESPONSE" | jq -r '.ok')" == "true" ]]; then
    SLACK_CONFIG_TOKEN="$(echo "$RESPONSE" | jq -r '.access_token')"
    local NEW_REFRESH="$(echo "$RESPONSE" | jq -r '.refresh_token')"
    
    echo "{\"access_token\": \"$SLACK_CONFIG_TOKEN\", \"refresh_token\": \"$NEW_REFRESH\"}" > "$TOKENS_FILE"
    success "Slack tokens rotated and saved to $TOKENS_FILE"
  else
    local ERR="$(echo "$RESPONSE" | jq -r '.error')"
    log "Token rotation failed ($ERR). Falling back to SLACK_CONFIG_TOKEN from environment."
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

# ─── Load persisted state ─────────────────────────────────────────
[[ -f "$STATE_FILE" ]] && source "$STATE_FILE"
SLACK_APP_ID="${SLACK_APP_ID:-}"

# ─── Slack Config ─────────────────────────────────────────────────
SLACK_CONFIG_REFRESH_TOKEN="${SLACK_CONFIG_REFRESH_TOKEN:-}"
SLACK_CONFIG_TOKEN="${SLACK_CONFIG_TOKEN:-}"

if [[ -f "$TOKENS_FILE" ]]; then
  SLACK_CONFIG_TOKEN="$(jq -r '.access_token // empty' "$TOKENS_FILE")"
fi

rotate_tokens

[[ -z "$SLACK_CONFIG_TOKEN" ]] && fail "SLACK_CONFIG_TOKEN or SLACK_CONFIG_REFRESH_TOKEN is required."

FIREBASE_REGION="${FIREBASE_REGION:-us-central1}"
FIREBASE_PROJECT="$(jq -r '.projects.default' "$FIREBASERC")"

hr
echo "  Deploying Slack App"
echo "  Project:  $FIREBASE_PROJECT"
echo "  App ID:   ${SLACK_APP_ID:-"(new)"}"
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
  
  RESPONSE="$(
    curl -sf -X POST https://slack.com/api/apps.manifest.create \
      -H "Authorization: Bearer $SLACK_CONFIG_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$POST_BODY"
  )"

  [[ "$(echo "$RESPONSE" | jq -r '.ok')" == "true" ]] || {
    log "Error Response: $RESPONSE"
    fail "Slack app creation failed: $(echo "$RESPONSE" | jq -r '.error')"
  }

  SLACK_APP_ID="$(echo "$RESPONSE" | jq -r '.app_id')"
  NEW_BOT_TOKEN="$(echo "$RESPONSE" | jq -r '.credentials.bot_token')"
  NEW_SIGNING_SECRET="$(echo "$RESPONSE" | jq -r '.credentials.signing_secret')"

  echo "SLACK_APP_ID=$SLACK_APP_ID" > "$STATE_FILE"
  success "Slack app created: $SLACK_APP_ID"

  # ─── Sync real secrets ──────────────────────────────────────────
  if [[ "$IS_LOCAL" == "false" ]]; then
    log "Pushing real Slack credentials to Firebase Secret Manager..."
    printf "%s" "$NEW_BOT_TOKEN"       | firebase functions:secrets:set SLACK_BOT_TOKEN     --config "$FIREBASE_CONFIG" --non-interactive
    printf "%s" "$NEW_SIGNING_SECRET"  | firebase functions:secrets:set SLACK_SIGNING_SECRET --config "$FIREBASE_CONFIG" --non-interactive
    success "Secrets updated in Secret Manager"
  else
    log "Local deployment — skipping Firebase Secret Manager update."
  fi

  # Update local .env if it exists
  if [[ -f ".env" ]]; then
    [[ -n "$NEW_BOT_TOKEN" && "$NEW_BOT_TOKEN" != "null" ]] && \
      sed -i.bak "s|SLACK_BOT_TOKEN=.*|SLACK_BOT_TOKEN=$NEW_BOT_TOKEN|" .env
    [[ -n "$NEW_SIGNING_SECRET" && "$NEW_SIGNING_SECRET" != "null" ]] && \
      sed -i.bak "s|SLACK_SIGNING_SECRET=.*|SLACK_SIGNING_SECRET=$NEW_SIGNING_SECRET|" .env
    rm -f .env.bak
    success "Local .env updated (if tokens were provided)"
  fi
else
  log "Updating Slack app manifest ($SLACK_APP_ID)..."
  POST_BODY="$(jq -n --arg app_id "$SLACK_APP_ID" --arg manifest "$MANIFEST" '{"app_id": $app_id, "manifest": $manifest}')"

  RESPONSE="$(
    curl -sf -X POST https://slack.com/api/apps.manifest.update \
      -H "Authorization: Bearer $SLACK_CONFIG_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$POST_BODY"
  )"

  [[ "$(echo "$RESPONSE" | jq -r '.ok')" == "true" ]] || {
    log "Error Response: $RESPONSE"
    fail "Slack manifest update failed: $(echo "$RESPONSE" | jq -r '.error')"
  }

  success "Slack app manifest updated"
fi

hr
success "Slack deployment complete!"

if [[ -n "${SLACK_APP_ID:-}" ]]; then
  echo ""
  echo "  Next steps for your Slack App ($SLACK_APP_ID):"
  echo "  1. Install the app to your workspace:"
  echo "     https://api.slack.com/apps/$SLACK_APP_ID/install-on-team"
  echo "  2. If using Socket Mode (localRun), generate an App-Level Token:"
  echo "     https://api.slack.com/apps/$SLACK_APP_ID/tokens"
  echo "  3. Update your .env file with the NEW tokens (xoxb-... and xapp-...)"
  echo ""
fi
