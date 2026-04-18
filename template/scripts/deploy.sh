#!/usr/bin/env bash
set -euo pipefail

# ─── Paths ────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FIREBASE_CONFIG="packages/functions/firebase.json"
FIREBASERC="packages/functions/.firebaserc"
STATE_FILE=".deploy-state"
MANIFEST_FILE="packages/functions/slack-manifest.json"

cd "$ROOT_DIR"

# ─── Helpers ──────────────────────────────────────────────────────
log()     { echo "▶  $*"; }
success() { echo "✅ $*"; }
fail()    { echo "❌ $*" >&2; exit 1; }
hr()      { echo "────────────────────────────────────────"; }

# ─── Dependency check ─────────────────────────────────────────────
for cmd in jq curl firebase; do
  command -v "$cmd" &>/dev/null || fail "Required tool not found: $cmd (install with: brew install $cmd)"
done

# ─── Load persisted state ─────────────────────────────────────────
[[ -f "$STATE_FILE" ]] && source "$STATE_FILE"
SLACK_APP_ID="${SLACK_APP_ID:-}"

# ─── Required env vars ────────────────────────────────────────────
: "${SLACK_CONFIG_TOKEN:?SLACK_CONFIG_TOKEN is required. Get it from: https://api.slack.com/reference/manifests#config-tokens}"
: "${GITHUB_OWNER:?GITHUB_OWNER is required}"
: "${SLACK_CHANNEL_ID:?SLACK_CHANNEL_ID is required}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${GOOGLE_GENERATIVE_AI_API_KEY:?GOOGLE_GENERATIVE_AI_API_KEY is required}"

FIREBASE_REGION="${FIREBASE_REGION:-us-central1}"
FIREBASE_PROJECT="$(jq -r '.projects.default' "$FIREBASERC")"

hr
echo "  Project:  $FIREBASE_PROJECT"
echo "  Region:   $FIREBASE_REGION"
echo "  App ID:   ${SLACK_APP_ID:-"(new — will be created)"}"
hr

# ─── Step 1: Bootstrap secrets ────────────────────────────────────
# Non-secret env vars: write to packages/functions/.env (Firebase picks this up at deploy)
log "Writing non-secret env vars to packages/functions/.env..."
printf "GITHUB_OWNER=%s\nSLACK_CHANNEL_ID=%s\n" "$GITHUB_OWNER" "$SLACK_CHANNEL_ID" > "packages/functions/.env"
success "packages/functions/.env written"

# Always sync API secrets (creates a new version if value changed)
log "Syncing API secrets to Firebase Secret Manager..."
printf "%s" "$GITHUB_TOKEN"                  | firebase functions:secrets:set GITHUB_TOKEN                --config "$FIREBASE_CONFIG" --non-interactive
printf "%s" "$GOOGLE_GENERATIVE_AI_API_KEY"  | firebase functions:secrets:set GOOGLE_GENERATIVE_AI_API_KEY --config "$FIREBASE_CONFIG" --non-interactive
success "API secrets synced"

# Slack secrets: placeholder on first run, real values set after app creation
if [[ -z "$SLACK_APP_ID" ]]; then
  log "First run — setting placeholder Slack secrets..."
  printf "placeholder" | firebase functions:secrets:set SLACK_BOT_TOKEN     --config "$FIREBASE_CONFIG" --non-interactive
  printf "placeholder" | firebase functions:secrets:set SLACK_SIGNING_SECRET --config "$FIREBASE_CONFIG" --non-interactive
  success "Slack placeholders set"
fi

# ─── Step 2: Deploy Firebase Functions ────────────────────────────
log "Deploying Firebase Functions..."
firebase deploy --only functions --config "$FIREBASE_CONFIG"
success "Firebase deployed"

# ─── Step 3: Get function URL ─────────────────────────────────────
log "Fetching slackbot function URL..."

FUNCTION_URL=""

# Try firebase functions:list first
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

# Fallback: gcloud (available if firebase CLI is installed)
if [[ -z "$FUNCTION_URL" ]] && command -v gcloud &>/dev/null; then
  log "Trying gcloud fallback..."
  FUNCTION_URL="$(
    gcloud run services describe slackbot \
      --region="$FIREBASE_REGION" \
      --project="$FIREBASE_PROJECT" \
      --format='value(status.url)' 2>/dev/null || true
  )"
fi

[[ -z "$FUNCTION_URL" ]] && fail "Could not resolve function URL. Run 'firebase functions:list' to inspect output."

EVENTS_URL="${FUNCTION_URL}/events"
success "Function URL: $EVENTS_URL"

# ─── Step 4: Inject URL into manifest ────────────────────────────
MANIFEST="$(
  jq \
    --arg url "$EVENTS_URL" \
    '.settings.event_subscriptions.request_url = $url | .settings.interactivity.request_url = $url' \
    "$MANIFEST_FILE"
)"

# ─── Step 5: Create or update Slack app ──────────────────────────
if [[ -z "$SLACK_APP_ID" ]]; then
  log "Creating Slack app..."
  RESPONSE="$(
    curl -sf -X POST https://slack.com/api/apps.manifest.create \
      -H "Authorization: Bearer $SLACK_CONFIG_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"manifest\": $MANIFEST}"
  )"

  [[ "$(echo "$RESPONSE" | jq -r '.ok')" == "true" ]] || \
    fail "Slack app creation failed: $(echo "$RESPONSE" | jq -r '.error')"

  SLACK_APP_ID="$(echo "$RESPONSE" | jq -r '.app_id')"
  NEW_BOT_TOKEN="$(echo "$RESPONSE" | jq -r '.credentials.bot_token')"
  NEW_SIGNING_SECRET="$(echo "$RESPONSE" | jq -r '.credentials.signing_secret')"

  # Persist app ID for future runs
  echo "SLACK_APP_ID=$SLACK_APP_ID" > "$STATE_FILE"
  success "Slack app created: $SLACK_APP_ID"

  # ─── Step 6: Set real Slack secrets ───────────────────────────
  log "Pushing real Slack credentials to Firebase Secret Manager..."
  printf "%s" "$NEW_BOT_TOKEN"       | firebase functions:secrets:set SLACK_BOT_TOKEN     --config "$FIREBASE_CONFIG" --non-interactive
  printf "%s" "$NEW_SIGNING_SECRET"  | firebase functions:secrets:set SLACK_SIGNING_SECRET --config "$FIREBASE_CONFIG" --non-interactive
  success "Secrets updated in Secret Manager"

  # Update local .env if it exists
  if [[ -f ".env" ]]; then
    sed -i.bak \
      -e "s|SLACK_BOT_TOKEN=.*|SLACK_BOT_TOKEN=$NEW_BOT_TOKEN|" \
      -e "s|SLACK_SIGNING_SECRET=.*|SLACK_SIGNING_SECRET=$NEW_SIGNING_SECRET|" \
      .env
    rm -f .env.bak
    success "Local .env updated"
  fi

else
  log "Updating Slack app manifest ($SLACK_APP_ID)..."
  RESPONSE="$(
    curl -sf -X POST https://slack.com/api/apps.manifest.update \
      -H "Authorization: Bearer $SLACK_CONFIG_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"app_id\": \"$SLACK_APP_ID\", \"manifest\": $MANIFEST}"
  )"

  [[ "$(echo "$RESPONSE" | jq -r '.ok')" == "true" ]] || \
    fail "Slack manifest update failed: $(echo "$RESPONSE" | jq -r '.error')"

  success "Slack app manifest updated"
fi

# ─── Done ─────────────────────────────────────────────────────────
hr
success "Deployment complete!"
echo ""
echo "  Slack App ID:  $SLACK_APP_ID"
echo "  Events URL:    $EVENTS_URL"
echo ""
if [[ -z "${SLACK_APP_ID:-}" || "$(cat "$STATE_FILE" 2>/dev/null)" == *"placeholder"* ]]; then
  echo "  Next: Install the app to your workspace →"
  echo "  https://api.slack.com/apps/$SLACK_APP_ID/install-on-team"
  echo ""
fi
