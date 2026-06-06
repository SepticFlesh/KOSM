# KOSM Server

Node.js game server for AIATOR multiplayer mode.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your GitHub OAuth credentials

# Run in development
npm run dev     # tsx watch — auto-reload

# Build & run production
npm run build
node dist/index.js
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | HTTP + WebSocket port |
| `JWT_SECRET` | Yes | — | Secret for signing JWT tokens |
| `GITHUB_CLIENT_ID` | Yes | — | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | Yes | — | GitHub OAuth App client secret |
| `FRONTEND_URL` | No | `https://aiator.ru` | Frontend URL for CORS/OAuth redirect |
| `DATABASE_PATH` | No | `./data/kosm.db` | SQLite database path |

## Deploy on Beget

Beget shared hosting supports Node.js. To deploy:

```bash
# From your local machine:
./deploy.sh --server
```

Or manually:
```bash
# 1. Build
npm run build

# 2. Upload
scp -r dist/ package.json .env dissemab@aiator.ru:~/aiator/server/

# 3. On Beget (via SSH)
cd ~/aiator/server
npm install --production
pkill -f "node dist/index.js" || true
nohup node dist/index.js > server.log 2>&1 &
```

Check if running: `curl http://localhost:3001/api/health`

## API Endpoints

| Path | Method | Description |
|------|--------|-------------|
| `/api/health` | GET | Health check (status, uptime, players) |
| `/api/auth/github/callback?code=...` | GET | GitHub OAuth callback |
| `/ws` | WebSocket | Game connection (JWT required) |

## Architecture

- **20Hz game loop** — 50ms ticks: input → physics → AI → combat → snapshot
- **ShipEntity** — Server-side FlightModel using THREE.js math
- **4 NPC pirates** — patrol/chase/attack AI with shooting
- **Economy** — 20 goods, price modifiers per economy type, 5-min fluctuations
- **Missions** — destroy/deliver generation, kill tracking, rewards
- **Chat** — In-memory broadcast to all connected players
