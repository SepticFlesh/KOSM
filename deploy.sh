#!/bin/bash
# ============================================================
# AIATOR Deploy Script
# Deploys frontend to aiator.ru and server (optional)
# ============================================================
set -euo pipefail

SSH_KEY="$HOME/.ssh/id_ed25519"
SSH_USER="dissemab"
SSH_HOST="aiator.ru"
ROOT_HOST="83.222.16.124"
REMOTE_ROOT="~/aiator"
PUBLIC_HTML="$REMOTE_ROOT/public_html"
SERVER_DIR="/opt/kosm-server"

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

  # Upload to /opt/kosm-server as root
  scp -r server/dist server/package.json server/.env "root@$ROOT_HOST:$SERVER_DIR/"

  # Install deps and restart
  ssh "root@$ROOT_HOST" "bash -s" << 'REMOTE_SCRIPT'
    cd /opt/kosm-server
    rm -rf node_modules
    npm install --production

    # Kill old process
    PID=$(fuser 3001/tcp 2>/dev/null)
    [ -n "$PID" ] && kill -9 $PID 2>/dev/null
    sleep 1

    # Start new process
    nohup node --env-file=.env dist/index.js > server.log 2>&1 &
    sleep 2
    curl -s http://localhost:3001/api/health && echo "  → Server restarted OK!" || echo "  → Check server.log"
REMOTE_SCRIPT

  echo "Server deployed!"
fi

echo "=== Deploy complete ==="
echo "Frontend: https://aiator.ru/"
echo "Server API: https://ws.aiator.ru/api/health"
