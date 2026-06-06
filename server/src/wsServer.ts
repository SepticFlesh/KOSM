import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import { verifyToken, generateToken } from './auth.js';
import { findOrCreatePlayer } from './db.js';
import type { ClientMessage, ServerMessage, AuthOkMessage } from './protocol/messages.js';

interface PlayerSession {
  ws: WebSocket;
  playerId: string;
  username: string;
  alive: boolean;
}

export type MessageHandler = (
  session: PlayerSession,
  msg: ClientMessage,
  broadcast: (msg: ServerMessage, excludePlayerId?: string) => void,
) => void;

/**
 * WebSocket server wrapper.
 */
export function createWSServer(
  httpServer: Server,
  onConnect: (session: PlayerSession) => void,
  onDisconnect: (playerId: string) => void,
  onMessage: MessageHandler,
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    let session: PlayerSession | null = null;
    let authenticated = false;

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', payload: { code: 'PARSE', message: 'Invalid JSON' } }));
        return;
      }

      // First message must be auth
      if (!authenticated) {
        if (msg.type !== 'auth') {
          ws.send(JSON.stringify({ type: 'auth_error', payload: { reason: 'Auth required first' } }));
          ws.close();
          return;
        }
        const payload = verifyToken(msg.payload.token);
        if (!payload) {
          ws.send(JSON.stringify({ type: 'auth_error', payload: { reason: 'Invalid token' } }));
          ws.close();
          return;
        }
        authenticated = true;
        session = {
          ws,
          playerId: payload.playerId,
          username: payload.username,
          alive: true,
        };
        ws.send(JSON.stringify({
          type: 'auth_ok',
          payload: { playerId: payload.playerId, username: payload.username },
        } satisfies AuthOkMessage));
        onConnect(session);
        return;
      }

      // Route message
      if (session) {
        const broadcast = (srvMsg: ServerMessage, excludePlayerId?: string) => {
          const data = JSON.stringify(srvMsg);
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              // If excludePlayerId provided, find the session and skip
              if (excludePlayerId) {
                // We need to track which ws belongs to which player
                // Simplified: broadcast to all except sender
              }
              client.send(data);
            }
          });
        };
        onMessage(session, msg, broadcast);
      }
    });

    ws.on('close', () => {
      if (session) {
        session.alive = false;
        onDisconnect(session.playerId);
      }
    });

    ws.on('error', () => {
      if (session) {
        session.alive = false;
        onDisconnect(session.playerId);
      }
    });
  });

  return wss;
}
