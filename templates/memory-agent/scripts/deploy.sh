#!/usr/bin/env bash
set -euo pipefail

# This script is now a wrapper around the separated deployment scripts.
# For individual deployments, use:
#   npm run deploy:firebase
#   npm run deploy:slack

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

log() { echo "▶  $*"; }
success() { echo "✅ $*"; }

log "Starting full deployment..."

bash "$ROOT_DIR/scripts/deploy-firebase.sh"
bash "$ROOT_DIR/scripts/deploy-slack.sh"

success "Full deployment complete!"
