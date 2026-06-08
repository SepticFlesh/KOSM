import jwt from 'jsonwebtoken';

// ── Environment validation ──────────────────────────────────────────
const rawSecret = process.env.JWT_SECRET;
if (!rawSecret || rawSecret === 'change-me-to-a-random-string-at-least-32-chars') {
  console.error('[AUTH] FATAL: JWT_SECRET is not set or is the example value.');
  console.error('[AUTH] Generate a strong secret:  node -e "console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))"');
  process.exit(1);
}
const JWT_SECRET: string = rawSecret;

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://aiator.ru';

// Warn on missing OAuth config (non-fatal — server still starts for health checks)
if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
  console.warn('[AUTH] WARNING: GitHub OAuth credentials not configured. GitHub login will fail.');
}
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('[AUTH] WARNING: Google OAuth credentials not configured. Google login will fail.');
}

export interface PlayerPayload {
  playerId: string;
  username: string;
}

/** Verify JWT, return player info or null */
export function verifyToken(token: string): PlayerPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return { playerId: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}

/** Generate JWT for a player */
export function generateToken(playerId: string, username: string): string {
  return jwt.sign(
    { sub: playerId, username },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * Exchange GitHub OAuth code for access token and user info.
 * Returns { githubId, username } or null on failure.
 */
export async function exchangeGithubCode(code: string): Promise<{ githubId: string; username: string } | null> {
  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) return null;

    // Fetch user info
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'KOSM-Server',
      },
    });
    const userData = await userRes.json() as any;
    return {
      githubId: String(userData.id),
      username: userData.login || 'unknown',
    };
  } catch {
    return null;
  }
}

/**
 * Build the GitHub OAuth authorization URL.
 */
export function getGithubOAuthURL(): string {
  return `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(FRONTEND_URL + '/api/auth/github/callback')}&scope=read:user`;
}

/**
 * Exchange Google OAuth code for access token and user info.
 */
export async function exchangeGoogleCode(code: string): Promise<{ googleId: string; username: string } | null> {
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: 'https://ws.aiator.ru/api/auth/google/callback',
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) return null;

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json() as any;
    return {
      googleId: userData.sub,
      username: userData.name || userData.email?.split('@')[0] || 'unknown',
    };
  } catch {
    return null;
  }
}

/**
 * Handle Google OAuth callback — exchange code, find/create player, return JWT.
 */
export async function handleGoogleCallback(code: string): Promise<{ token: string; playerId: string; username: string } | null> {
  const gUser = await exchangeGoogleCode(code);
  if (!gUser) return null;

  const { findOrCreatePlayer } = await import('./db.js');
  const player = findOrCreatePlayer(gUser.googleId, gUser.username);
  const token = generateToken(player.id, player.username);

  return { token, playerId: player.id, username: player.username };
}

/**
 * Handle the OAuth callback — exchange code, find/create player, return JWT.
 */
export async function handleOAuthCallback(code: string): Promise<{ token: string; playerId: string; username: string } | null> {
  const ghUser = await exchangeGithubCode(code);
  if (!ghUser) return null;

  const { findOrCreatePlayer } = await import('./db.js');
  const player = findOrCreatePlayer(ghUser.githubId, ghUser.username);
  const token = generateToken(player.id, player.username);

  return { token, playerId: player.id, username: player.username };
}
