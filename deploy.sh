#!/bin/bash
# ============================================================
# AIATOR Deploy Script
# Deploys frontend to aiator.ru and server (optional)
# ============================================================
set -euo pipefail

SSH_KEY="$HOME/.ssh/id_ed25519"
SSH_USER="dissemab"
SSH_HOST="aiator.ru"
REMOTE_ROOT="~/aiator"
PUBLIC_HTML="$REMOTE_ROOT/public_html"
SERVER_DIR="$REMOTE_ROOT/server"

echo "=== AIATOR Deploy ==="

# --- Frontend ---
echo "[1/3] Building frontend..."
npx vite build

echo "[2/3] Deploying frontend..."
ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" "rm -rf $PUBLIC_HTML/assets/*"
scp -i "$SSH_KEY" -r dist/* "$SSH_USER@$SSH_HOST:$PUBLIC_HTML/"

# --- Server (if --server flag) ---
if [ "${1:-}" = "--server" ]; then
  echo "[3/3] Building & deploying server..."

  # Build server
  cd server
  npx tsc
  cd ..

  # Upload server
  ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" "mkdir -p $SERVER_DIR"
  scp -i "$SSH_KEY" -r server/dist "$SSH_USER@$SSH_HOST:$SERVER_DIR/"
  # Sync dist/ into dist/server/src/ for hosting panel compatibility
  ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" "mkdir -p $SERVER_DIR/dist/server/src && cp -r $SERVER_DIR/dist/* $SERVER_DIR/dist/server/src/ 2>/dev/null || true"
  scp -i "$SSH_KEY" server/package.json "$SSH_USER@$SSH_HOST:$SERVER_DIR/"
  scp -i "$SSH_KEY" server/.env "$SSH_USER@$SSH_HOST:$SERVER_DIR/" 2>/dev/null || echo "(no .env file, skipping)"

  # Install deps and restart on server
  ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" << 'REMOTE_SCRIPT'
    # Load Node.js via nvm (shared hosting)
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

    cd ~/aiator/server
    rm -rf node_modules
    npm install --production

    # Get deploy token from .env
    DEPLOY_TOKEN=$(grep DEPLOY_TOKEN .env 2>/dev/null | cut -d= -f2)
    if [ -n "$DEPLOY_TOKEN" ]; then
      echo "Triggering graceful restart via API..."
      curl -s -X POST -H "x-deploy-token: $DEPLOY_TOKEN" https://ws.aiator.ru/api/restart || true
      echo ""
      echo "Waiting for server to restart..."
      sleep 5
      curl -s https://ws.aiator.ru/api/health && echo "  → Server restarted OK!" || echo "  → Restart pending..."
    else
      echo "WARNING: No DEPLOY_TOKEN found, cannot trigger restart"
      echo "Please restart manually via BeGet panel"
    fi
REMOTE_SCRIPT

  echo "Server deployed!"
fi

echo "=== Deploy complete ==="
echo "Frontend: https://aiator.ru/"
echo "Server API: https://aiator.ru/api/health"
