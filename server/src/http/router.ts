import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleOAuthCallback, handleGoogleCallback } from '../auth.js';

export interface RouterDeps {
  playerCount: () => number;
}

/**
 * Creates an HTTP request handler for all non-WS endpoints.
 */
export function createRouter(deps: RouterDeps) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url || '/', `http://localhost`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── Health check ──
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        players: deps.playerCount(),
        memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
      }));
      return;
    }

    // ── GitHub OAuth callback ──
    if (url.pathname === '/api/auth/github/callback') {
      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing code' }));
        return;
      }
      const result = await handleOAuthCallback(code);
      if (!result) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'OAuth failed' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(oauthResponseHtml(result.token, result.playerId, result.username));
      return;
    }

    // ── Google OAuth callback ──
    if (url.pathname === '/api/auth/google/callback') {
      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing code' }));
        return;
      }
      const result = await handleGoogleCallback(code);
      if (!result) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'OAuth failed' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(oauthResponseHtml(result.token, result.playerId, result.username));
      return;
    }

    // ── 404 ──
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  };
}

function oauthResponseHtml(token: string, playerId: string, username: string): string {
  return `<!DOCTYPE html><html><body><script>
    if (window.opener) {
      window.opener.postMessage({ type: 'kosm_auth', token: '${token}', playerId: '${playerId}', username: '${username}' }, '*');
      window.close();
    } else {
      document.body.textContent = 'Auth OK';
    }
  </script></body></html>`;
}
