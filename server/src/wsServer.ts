import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import { verifyToken, generateToken } from './auth.js';
import { findOrCreatePlayer } from './db.js';
import { validateClientMessage, type ClientMessage, type ServerMessage, type AuthOkMessage } from './protocol/messages.js';

export interface PlayerSession {
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

// ── Rate limiting ───────────────────────────────────────────────────
const RATE_WINDOW_MS = 1000;
const RATE_MAX_MSG = 60; // messages per second per player

class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  /** Returns true if the message is allowed, false if rate-limited. */
  allow(playerId: string): boolean {
    const now = Date.now();
    const entry = this.buckets.get(playerId);
    if (!entry || now >= entry.resetAt) {
      this.buckets.set(playerId, { count: 1, resetAt: now + RATE_WINDOW_MS });
      return true;
    }
    if (entry.count >= RATE_MAX_MSG) return false;
    entry.count++;
    return true;
  }

  /** Clean up disconnected players */
  remove(playerId: string): void {
    this.buckets.delete(playerId);
  }

  /** Periodic cleanup of stale buckets */
  cleanup(): void {
    const now = Date.now();
    for (const [id, entry] of this.buckets) {
      if (now >= entry.resetAt + 5000) this.buckets.delete(id);
    }
  }
}

const rateLimiter = new RateLimiter();
// Run cleanup every 30 seconds
setInterval(() => rateLimiter.cleanup(), 30000);

export function createWSServer(
  httpServer: Server,
  onConnect: (session: PlayerSession) => void,
  onDisconnect: (playerId: string) => void,
  onMessage: MessageHandler,
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    console.log('[WS] New connection from', req.socket.remoteAddress);
    let session: PlayerSession | null = null;
    let authenticated = false;

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        console.log('[WS] Invalid JSON:', raw.toString().slice(0, 100));
        ws.send(JSON.stringify({ type: 'error', payload: { code: 'PARSE', message: 'Invalid JSON' } }));
        return;
      }

      // Zod validation
      const validation = validateClientMessage(msg);
      if (!validation.ok) {
        console.log('[WS] Validation failed:', validation.error);
        ws.send(JSON.stringify({ type: 'error', payload: { code: 'VALIDATION', message: validation.error } }));
        return;
      }
      msg = validation.msg as ClientMessage;

      // Rate limiting (after auth, per-player)
      if (session && !rateLimiter.allow(session.playerId)) {
        // Drop silently — don't flood the client with error messages
        return;
      }
      console.log('[WS] Message:', msg.type);

      if (!authenticated) {
        if (msg.type !== 'auth') {
          console.log('[WS] Expected auth, got:', msg.type);
          ws.send(JSON.stringify({ type: 'auth_error', payload: { reason: 'Auth required first' } }));
          ws.close();
          return;
        }
        const payload = verifyToken(msg.payload.token);
        console.log('[WS] Auth attempt, verified:', !!payload, payload?.username);
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
        console.log('[WS] Sending auth_ok to', payload.username);
        ws.send(JSON.stringify({
          type: 'auth_ok',
          payload: { playerId: payload.playerId, username: payload.username },
        } satisfies AuthOkMessage));
        onConnect(session);
        return;
      }

      if (session) {
        const broadcast = (srvMsg: ServerMessage, excludePlayerId?: string) => {
          const data = JSON.stringify(srvMsg);
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(data);
            }
          });
        };
        onMessage(session, msg, broadcast);
      }
    });

    ws.on('close', (code, reason) => {
      console.log('[WS] Close, code:', code);
      if (session) {
        session.alive = false;
        rateLimiter.remove(session.playerId);
        onDisconnect(session.playerId);
      }
    });

    ws.on('error', (err) => {
      console.log('[WS] Error:', err.message);
      if (session) {
        session.alive = false;
        rateLimiter.remove(session.playerId);
        onDisconnect(session.playerId);
      }
    });
  });

  return wss;
}
