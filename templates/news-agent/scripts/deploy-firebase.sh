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

FIREBASE_REGION="${FIREBASE_REGION:-us-central1}"
FIREBASE_PROJECT="$(jq -r '.projects.default' "$FIREBASERC")"

hr
echo "  Deploying Firebase Functions"
echo "  Project:  $FIREBASE_PROJECT"
echo "  Region:   $FIREBASE_REGION"
hr

# ─── Step 1: Sync Slack Secrets ───────────────────────────────────
log "Syncing Slack secrets to Firebase Secret Manager..."

# Load .env if it exists
if [[ -f ".env" ]]; then
  # Use a subshell to avoid polluting current shell but export needed vars
  export SLACK_BOT_TOKEN="$(grep "^SLACK_BOT_TOKEN=" .env | cut -d'=' -f2- || echo "")"
  export SLACK_SIGNING_SECRET="$(grep "^SLACK_SIGNING_SECRET=" .env | cut -d'=' -f2- || echo "")"
  export OPENAI_API_KEY="$(grep "^OPENAI_API_KEY=" .env | cut -d'=' -f2- || echo "")"
  export NEWS_API_KEY="$(grep "^NEWS_API_KEY=" .env | cut -d'=' -f2- || echo "")"
fi

# Ensure secrets exist (sync from env if available, otherwise placeholder)
ensure_secret() {
  local name="$1"
  local env_val="${!name:-}"
  local current_val=""
  local current_exists=0

  if current_val="$(firebase functions:secrets:access "$name" --config "$FIREBASE_CONFIG" 2>/dev/null)"; then
    current_exists=1
  fi

  if [[ -n "$env_val" && "$env_val" != "placeholder" ]]; then
    if [[ "$current_exists" -eq 1 && "$current_val" == "$env_val" ]]; then
      log "$name already matches .env; skipping update."
      return 0
    fi

    log "Syncing $name from .env..."
    printf "%s" "$env_val" | firebase functions:secrets:set "$name" --config "$FIREBASE_CONFIG" --non-interactive
    return 0
  fi

  if [[ "$current_exists" -eq 1 ]]; then
    return 0
  fi

  log "$name has no version and no .env value — setting placeholder..."
  printf "placeholder" | firebase functions:secrets:set "$name" --config "$FIREBASE_CONFIG" --non-interactive
}
ensure_secret SLACK_BOT_TOKEN
ensure_secret SLACK_SIGNING_SECRET
ensure_secret OPENAI_API_KEY
ensure_secret NEWS_API_KEY
success "Secrets synced and verified"

# ─── Step 2: Sync Firebase params from root .env ──────────────────
log "Syncing Firebase params from .env..."

PARAMS_FILE="packages/functions/.env.${FIREBASE_PROJECT}"
: > "$PARAMS_FILE"

sync_param() {
  local name="$1"
  local value=""
  [[ -f ".env" ]] && value="$(grep "^${name}=" .env | cut -d'=' -f2- || echo "")"
  [[ -n "$value" ]] && echo "${name}=${value}" >> "$PARAMS_FILE"
}

sync_param NEWS_SUMMARY_CHANNEL_ID
success "Firebase params synced"

# ─── Step 3: Build workspace ──────────────────────────────────────
log "Building workspace..."
pnpm run build
success "Build complete"

# ─── Step 4: Deploy Firebase Functions ────────────────────────────
log "Deploying Firebase Functions..."
firebase deploy --only functions --config "$FIREBASE_CONFIG"
success "Firebase deployed"

hr
success "Firebase deployment complete!"
