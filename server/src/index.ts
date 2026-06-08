import { createServer } from 'node:http';
import { createRouter } from './http/router.js';
import { createWSServer } from './wsServer.js';
import { GameLoop } from './gameLoop.js';
import { EconomySystem } from './systems/EconomySystem.js';
import { ServerMissionSystem } from './systems/MissionSystem.js';
import { ChatSystem } from './systems/ChatSystem.js';
import { getPlayerMissions, getPlayerCargo } from './db.js';
import { createTradeHandler } from './handlers/tradeHandler.js';
import { createMovementHandler } from './handlers/movementHandler.js';
import { createCombatHandler } from './handlers/combatHandler.js';
import { createChatHandler } from './handlers/chatHandler.js';
import { createTradeRequestHandler } from './handlers/tradeRequestHandler.js';
import type { ClientMessage, ServerMessage, InputPayload, MissionDef } from './protocol/messages.js';

// ── Environment ─────────────────────────────────────────────────────
function checkEnv(): void {
  const required = ['JWT_SECRET'];
  const missing = required.filter(k =>
    !process.env[k] || process.env[k] === 'change-me-to-a-random-string-at-least-32-chars'
  );
  if (missing.length > 0) {
    console.error(`[KOSM] FATAL: Missing required env: ${missing.join(', ')}`);
    console.error('[KOSM] Copy server/.env.example to server/.env and fill in the values.');
    process.exit(1);
  }
  const oauth = [];
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) oauth.push('GitHub');
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) oauth.push('Google');
  if (oauth.length) console.warn(`[KOSM] WARNING: ${oauth.join(', ')} OAuth not configured.`);
  console.log('[KOSM] Environment check passed.');
}
checkEnv();

const PORT = parseInt(process.env.PORT || '3001', 10);

// ── Systems ─────────────────────────────────────────────────────────
const gameLoop = new GameLoop();
const economy = new EconomySystem();
const missions = new ServerMissionSystem();
const chat = new ChatSystem();

// ── Per-player state ────────────────────────────────────────────────
const playerMissions = new Map<string, MissionDef[]>();
const playerKills = new Map<string, number>();

// ── Handlers ────────────────────────────────────────────────────────
const tradeHandler = createTradeHandler({
  economy,
  getPlayerSystem: (id) => gameLoop.getPlayerSystem(id),
});

const movementHandler = createMovementHandler({
  gameLoop,
  missions,
  playerMissions,
});

const combatHandler = createCombatHandler({
  gameLoop,
  missions,
  playerMissions,
  playerKills,
});

const chatHandler = createChatHandler({ chat });

const tradeReqHandler = createTradeRequestHandler({
  economy,
  missions,
  playerMissions,
  getPlayerSystem: (id) => gameLoop.getPlayerSystem(id),
});

// ── HTTP server ─────────────────────────────────────────────────────
const router = createRouter({ playerCount: () => gameLoop.playerCount() });
const httpServer = createServer(router);

// ── WebSocket server ────────────────────────────────────────────────
const wss = createWSServer(
  httpServer,
  // onConnect
  (session) => {
    gameLoop.addPlayer(session);
    const dbMissions = getPlayerMissions(session.playerId);
    playerMissions.set(session.playerId, dbMissions.map((m) => ({
      id: m.mission_id,
      type: m.type as MissionDef['type'],
      title: m.title,
      description: m.description,
      reward: m.reward,
      progress: m.progress,
      target: m.target,
      completed: !!m.completed,
    })));
    playerKills.set(session.playerId, 0);
  },
  // onDisconnect
  (playerId) => {
    gameLoop.removePlayer(playerId);
    playerMissions.delete(playerId);
    playerKills.delete(playerId);
  },
  // onMessage
  (session, msg: ClientMessage, broadcast) => {
    const reply = (m: ServerMessage) => session.ws.send(JSON.stringify(m));

    switch (msg.type) {
      case 'fire_bolt':
        combatHandler.handleFireBolt(session, msg.payload);
        break;

      case 'input':
        movementHandler.handleInput(session, msg.payload as InputPayload);
        break;

      case 'jump_request':
        movementHandler.handleJump(session, msg.payload.targetSystem, reply);
        break;

      case 'trade_request':
        tradeReqHandler.onTradeRequest(session.playerId, (srvMsg) => {
          session.ws.send(JSON.stringify(srvMsg));
        });
        break;

      case 'trade_buy':
        tradeHandler.handleBuy(session, msg.payload.goodId, msg.payload.quantity, reply);
        break;

      case 'trade_sell':
        tradeHandler.handleSell(session, msg.payload.goodId, msg.payload.quantity, reply);
        break;

      case 'mission_accept': {
        // Accept a specific mission from the player's mission list
        const pms = playerMissions.get(session.playerId) || [];
        const mission = pms.find(m => m.id === msg.payload.missionId);
        if (mission && !mission.completed) {
          console.log(`[KOSM] Player ${session.username} accepted mission ${mission.id}`);
          // Mission progress is tracked automatically via kills/deliveries
        }
        break;
      }

      case 'chat_message':
        chatHandler.handleChatMessage(session, msg.payload.text, broadcast);
        break;
    }
  },
);

// ── Cross-cutting callbacks ─────────────────────────────────────────

// Kill → mission progress + reputation
gameLoop.onKill((playerId, killCount) => {
  combatHandler.onKill(playerId, killCount, (msg) => {
    const data = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === 1) c.send(data); });
  });
});

// Trade request → generate missions + market
gameLoop.onTradeRequest((playerId) => {
  tradeReqHandler.onTradeRequest(playerId, (msg) => {
    const data = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === 1) c.send(data); });
  });
});

// World snapshot broadcast
gameLoop.setBroadcast((msg: ServerMessage) => {
  const data = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(data);
  });
});

// ── Start ───────────────────────────────────────────────────────────
gameLoop.start();

httpServer.listen(PORT, () => {
  console.log(`[KOSM Server] HTTP + WS on port ${PORT}`);
  console.log(`[KOSM Server] Health: http://localhost:${PORT}/api/health`);
  console.log(`[KOSM Server] WS: ws://localhost:${PORT}/ws`);
});

// ── Graceful shutdown ───────────────────────────────────────────────
function shutdown() {
  console.log('[KOSM] Shutting down...');
  gameLoop.stop();
  httpServer.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
