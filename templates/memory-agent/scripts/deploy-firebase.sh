#!/usr/bin/env bash
set -euo pipefail

# ─── Paths ────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FIREBASE_CONFIG="packages/functions/firebase.json"
FIREBASERC="packages/functions/.firebaserc"
STATE_FILE=".deploy-state"

cd "$ROOT_DIR"

# ─── Helpers ──────────────────────────────────────────────────────
log()     { echo "▶  $*"; }
success() { echo "✅ $*"; }
fail()    { echo "❌ $*" >&2; exit 1; }
hr()      { echo "────────────────────────────────────────"; }

# ─── Dependency check ─────────────────────────────────────────────
for cmd in jq firebase; do
  command -v "$cmd" &>/dev/null || fail "Required tool not found: $cmd"
done

# ─── Load persisted state ─────────────────────────────────────────
[[ -f "$STATE_FILE" ]] && source "$STATE_FILE"
SLACK_APP_ID="${SLACK_APP_ID:-}"

# ─── Required env vars ────────────────────────────────────────────
: "${SLACK_CHANNEL_ID:?SLACK_CHANNEL_ID is required}"
: "${GOOGLE_GENERATIVE_AI_API_KEY:?GOOGLE_GENERATIVE_AI_API_KEY is required}"

FIREBASE_REGION="${FIREBASE_REGION:-us-central1}"
FIREBASE_PROJECT="$(jq -r '.projects.default' "$FIREBASERC")"

hr
echo "  Deploying Firebase Functions"
echo "  Project:  $FIREBASE_PROJECT"
echo "  Region:   $FIREBASE_REGION"
hr

# ─── Step 1: Bootstrap secrets ────────────────────────────────────
log "Writing non-secret env vars to packages/functions/.env..."
printf "SLACK_CHANNEL_ID=%s\n" "$SLACK_CHANNEL_ID" > "packages/functions/.env"
success "packages/functions/.env written"

log "Syncing API secrets to Firebase Secret Manager..."
printf "%s" "$GOOGLE_GENERATIVE_AI_API_KEY"  | firebase functions:secrets:set GOOGLE_GENERATIVE_AI_API_KEY --config "$FIREBASE_CONFIG" --non-interactive
success "API secrets synced"

# Slack secrets: placeholder on first run
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

hr
success "Firebase deployment complete!"
