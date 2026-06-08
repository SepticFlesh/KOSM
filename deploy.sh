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
  scp -i "$SSH_KEY" server/package.json "$SSH_USER@$SSH_HOST:$SERVER_DIR/"
  scp -i "$SSH_KEY" server/.env "$SSH_USER@$SSH_HOST:$SERVER_DIR/" 2>/dev/null || echo "(no .env file, skipping)"

  # Install deps and restart on server
  ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" << 'REMOTE_SCRIPT'
    cd ~/aiator/server
    rm -rf node_modules && npm install --production
    # Kill old process if running
    pkill -f "node dist" 2>/dev/null || true
    # Start new process with nohup
    export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    nohup node dist/server/src/index.js > server.log 2>&1 &
    echo "Server restarted, PID: $!"
    sleep 1
    cat server.log | tail -3
REMOTE_SCRIPT

  echo "Server deployed!"
fi

echo "=== Deploy complete ==="
echo "Frontend: https://aiator.ru/"
echo "Server API: https://aiator.ru/api/health"
