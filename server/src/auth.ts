import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'kosm-dev-secret-change-in-production';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://aiator.ru';

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
