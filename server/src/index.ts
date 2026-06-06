import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { handleOAuthCallback } from './auth.js';
import { createWSServer } from './wsServer.js';
import { GameLoop } from './gameLoop.js';
import { EconomySystem } from './systems/EconomySystem.js';
import { ServerMissionSystem } from './systems/MissionSystem.js';
import { ChatSystem } from './systems/ChatSystem.js';
import { getPlayer, updatePlayerCredits, updatePlayerCargo, getPlayerCargo, getPlayerMissions, upsertPlayerCargo, upsertPlayerMission, changeReputation } from './db.js';
import type { ClientMessage, ServerMessage, InputPayload, MissionDef } from './protocol/messages.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

const gameLoop = new GameLoop();
const economy = new EconomySystem();
const missions = new ServerMissionSystem();
const chat = new ChatSystem();

// Per-player mission tracking
const playerMissions = new Map<string, MissionDef[]>();
// Per-player kill tracking
const playerKills = new Map<string, number>();

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), players: gameLoop.playerCount() }));
    return;
  }

  if (url.pathname === '/api/auth/github/callback') {
    const code = url.searchParams.get('code');
    if (!code) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing code' })); return; }
    const result = await handleOAuthCallback(code);
    if (!result) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'OAuth failed' })); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html><body><script>
      if (window.opener) {
        window.opener.postMessage({ type: 'kosm_auth', token: '${result.token}', playerId: '${result.playerId}', username: '${result.username}' }, '*');
        window.close();
      } else {
        document.body.textContent = 'Auth OK';
      }
    </script></body></html>`);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const wss = createWSServer(
  httpServer,
  (session) => {
    gameLoop.addPlayer(session);
    // Init player missions from DB
    const dbMissions = getPlayerMissions(session.playerId) as any[];
    playerMissions.set(session.playerId, dbMissions.map((m: any) => ({
      id: m.mission_id,
      type: m.type,
      title: m.title,
      description: m.description,
      reward: m.reward,
      progress: m.progress,
      target: m.target,
      completed: !!m.completed,
    })));
    playerKills.set(session.playerId, 0);
  },
  (playerId) => {
    gameLoop.removePlayer(playerId);
    playerMissions.delete(playerId);
    playerKills.delete(playerId);
  },
  (session, msg: ClientMessage, broadcast) => {
    // Helper: send message only to this player
    const reply = (m: ServerMessage) => session.ws.send(JSON.stringify(m));

    switch (msg.type) {
      case 'input':
        gameLoop.handleInput(session, msg.payload as InputPayload);
        break;

      case 'jump_request':
        gameLoop.handleJumpRequest(session, msg.payload.targetSystem);
        // Complete deliver missions on jump
        {
          const pms = playerMissions.get(session.playerId) || [];
          for (const m of pms) {
            if (m.type === 'deliver' && !m.completed) {
              const result = missions.completeDelivery(pms, m.id);
              if (result.success) {
                const player = getPlayer(session.playerId) as any;
                const newCredits = player.credits + (result.reward || 0);
                updatePlayerCredits(session.playerId, newCredits);
                upsertPlayerMission(session.playerId, m);
                reply({ type: 'player_state', payload: { playerId: session.playerId, credits: newCredits } as any });
                reply({ type: 'missions', payload: { missions: pms } });
              }
            }
          }
        }
        break;

      case 'trade_buy': {
        const player = getPlayer(session.playerId) as any;
        const cargo = getPlayerCargo(session.playerId) as any[];
        const result = economy.buyFromStation(
          gameLoop.getPlayerSystem(session.playerId),
          msg.payload.goodId, msg.payload.quantity,
          player.credits, player.cargo_used || 0, player.cargo_capacity || 20,
        );
        if (result.success) {
          updatePlayerCredits(session.playerId, result.newCredits!);
          updatePlayerCargo(session.playerId, result.newCargoUsed!);
          upsertPlayerCargo(session.playerId, msg.payload.goodId, (cargo.find((c: any) => c.good_id === msg.payload.goodId)?.quantity || 0) + msg.payload.quantity);
        }
        reply(result.success
          ? { type: 'trade_menu', payload: { goods: economy.getMarket(gameLoop.getPlayerSystem(session.playerId), getPlayerCargo(session.playerId) as any).goods, credits: result.newCredits! } }
          : { type: 'error', payload: { code: 'TRADE', message: result.error || 'Trade failed' } });
        break;
      }

      case 'trade_sell': {
        const player = getPlayer(session.playerId) as any;
        const cargo = getPlayerCargo(session.playerId) as any[];
        const currentQty = cargo.find((c: any) => c.good_id === msg.payload.goodId)?.quantity || 0;
        if (currentQty < msg.payload.quantity) {
          reply({ type: 'error', payload: { code: 'TRADE', message: 'Not enough cargo' } });
          break;
        }
        const result = economy.sellToStation(
          gameLoop.getPlayerSystem(session.playerId),
          msg.payload.goodId, msg.payload.quantity,
          player.credits, player.cargo_used || 0,
        );
        if (result.success) {
          updatePlayerCredits(session.playerId, result.newCredits!);
          updatePlayerCargo(session.playerId, result.newCargoUsed!);
          upsertPlayerCargo(session.playerId, msg.payload.goodId, currentQty - msg.payload.quantity);
        }
        reply(result.success
          ? { type: 'trade_menu', payload: { goods: economy.getMarket(gameLoop.getPlayerSystem(session.playerId), getPlayerCargo(session.playerId) as any).goods, credits: result.newCredits! } }
          : { type: 'error', payload: { code: 'TRADE', message: result.error || 'Sell failed' } });
        break;
      }

      case 'mission_accept':
        // Missions are auto-generated when player requests via trade menu
        break;

      case 'chat_message': {
        const chatMsg = chat.addMessage(session.username, msg.payload.text);
        broadcast({ type: 'chat_broadcast', payload: chatMsg });
        break;
      }
    }
  },
);

// Track kills and update missions
gameLoop.onKill((playerId: string, killCount: number) => {
  const pms = playerMissions.get(playerId) || [];
  const prevKills = playerKills.get(playerId) || 0;
  playerKills.set(playerId, prevKills + killCount);

  const { completed } = missions.updateKillProgress(pms, killCount);
  for (const m of completed) {
    const player = getPlayer(playerId) as any;
    const newCredits = player.credits + m.reward;
    updatePlayerCredits(playerId, newCredits);
    upsertPlayerMission(playerId, m);
    changeReputation(playerId, 'federation', 10);
    // Send update to player (find their session)
    wss.clients.forEach(client => {
      client.send(JSON.stringify({ type: 'missions', payload: { missions: pms } }));
    });
  }
});

// Generate missions when player requests (via trade menu or on connect)
gameLoop.onTradeRequest((playerId: string) => {
  const systemSeed = gameLoop.getPlayerSystem(playerId);
  const newMissions = missions.generateMissions(systemSeed);
  const existing = playerMissions.get(playerId) || [];
  const all = [...existing.filter(m => !m.completed), ...newMissions].slice(0, 6);
  playerMissions.set(playerId, all);

  // Also send market data
  const player = getPlayer(playerId) as any;
  const cargo = getPlayerCargo(playerId) as any[];
  const market = economy.getMarket(systemSeed, cargo);

  // Find player's WebSocket and send
  wss.clients.forEach(client => {
    // We need to map player ID to ws... simplified for now
    client.send(JSON.stringify({
      type: 'trade_menu',
      payload: { goods: market.goods, credits: player.credits },
    }));
    client.send(JSON.stringify({
      type: 'missions',
      payload: { missions: all },
    }));
  });
});

// Broadcast world snapshots
gameLoop.setBroadcast((msg: ServerMessage) => {
  const data = JSON.stringify(msg);

  // For world_snapshot, send individually with player-specific data
  if (msg.type === 'world_snapshot') {
    // Everyone gets the same snapshot for now — OK for global state
  }

  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
});

gameLoop.start();

httpServer.listen(PORT, () => {
  console.log(`[KOSM Server] HTTP + WS on port ${PORT}`);
  console.log(`[KOSM Server] Health: http://localhost:${PORT}/api/health`);
  console.log(`[KOSM Server] WS: ws://localhost:${PORT}/ws`);
});

process.on('SIGINT', () => { gameLoop.stop(); process.exit(0); });
process.on('SIGTERM', () => { gameLoop.stop(); process.exit(0); });
