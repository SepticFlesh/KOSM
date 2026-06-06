import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { handleOAuthCallback } from './auth.js';
import { createWSServer } from './wsServer.js';
import { GameLoop } from './gameLoop.js';
import type { ClientMessage, ServerMessage, InputPayload } from './protocol/messages.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

// Game loop
const gameLoop = new GameLoop();

// Broadcast function — sends message to all connected clients
let broadcastAll: ((msg: ServerMessage) => void) | null = null;

// HTTP server
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  // GitHub OAuth callback
  if (url.pathname === '/api/auth/github/callback') {
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing code parameter' }));
      return;
    }

    const result = await handleOAuthCallback(code);
    if (!result) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'OAuth failed' }));
      return;
    }

    // Return HTML page that posts token back to opener (popup flow)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html><body><script>
      if (window.opener) {
        window.opener.postMessage({ type: 'kosm_auth', token: '${result.token}', playerId: '${result.playerId}', username: '${result.username}' }, '*');
        window.close();
      } else {
        document.body.textContent = 'Auth OK — you can close this window.';
      }
    </script></body></html>`);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// WebSocket server
const wss = createWSServer(
  httpServer,
  (session) => {
    gameLoop.addPlayer(session);
  },
  (playerId) => {
    gameLoop.removePlayer(playerId);
  },
  (session, msg: ClientMessage, _broadcast) => {
    switch (msg.type) {
      case 'input':
        gameLoop.handleInput(session, msg.payload as InputPayload);
        break;
      case 'jump_request':
        gameLoop.handleJumpRequest(session, msg.payload.targetSystem);
        break;
      case 'trade_buy':
      case 'trade_sell':
      case 'mission_accept':
      case 'chat_message':
        // TODO: Phase E
        break;
    }
  },
);

// Set up broadcast to all WebSocket clients
gameLoop.setBroadcast((msg: ServerMessage) => {
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(data);
    }
  });
});

// Start
gameLoop.start();

httpServer.listen(PORT, () => {
  console.log(`[KOSM Server] Running on port ${PORT}`);
  console.log(`[KOSM Server] WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`[KOSM Server] Health: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGINT', () => { gameLoop.stop(); process.exit(0); });
process.on('SIGTERM', () => { gameLoop.stop(); process.exit(0); });
