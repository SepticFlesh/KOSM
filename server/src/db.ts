import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'kosm.db');

let db: Database.Database;

export function getDB(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate();
  }
  return db;
}

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      github_id TEXT UNIQUE,
      username TEXT NOT NULL,
      credits INTEGER DEFAULT 1000,
      cargo_capacity INTEGER DEFAULT 20,
      cargo_used INTEGER DEFAULT 0,
      hull INTEGER DEFAULT 100,
      shield INTEGER DEFAULT 100,
      current_system INTEGER DEFAULT 0,
      position_x REAL DEFAULT 600,
      position_y REAL DEFAULT 250,
      position_z REAL DEFAULT -800,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS player_upgrades (
      player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
      upgrade_id TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      PRIMARY KEY (player_id, upgrade_id)
    );

    CREATE TABLE IF NOT EXISTS player_reputation (
      player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
      faction_id TEXT NOT NULL,
      value INTEGER DEFAULT 0,
      PRIMARY KEY (player_id, faction_id)
    );

    CREATE TABLE IF NOT EXISTS player_cargo (
      player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
      good_id TEXT NOT NULL,
      quantity INTEGER DEFAULT 0,
      PRIMARY KEY (player_id, good_id)
    );

    CREATE TABLE IF NOT EXISTS player_missions (
      player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
      mission_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      reward INTEGER DEFAULT 0,
      progress INTEGER DEFAULT 0,
      target INTEGER DEFAULT 1,
      completed INTEGER DEFAULT 0,
      PRIMARY KEY (player_id, mission_id)
    );
  `);
}

// --- Player queries ---

export function findOrCreatePlayer(githubId: string, username: string): { id: string; username: string; credits: number } {
  const db = getDB();
  const existing = db.prepare('SELECT id, username, credits FROM players WHERE github_id = ?').get(githubId) as any;
  if (existing) {
    db.prepare('UPDATE players SET last_login = datetime(\'now\') WHERE id = ?').run(existing.id);
    return existing;
  }
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO players (id, github_id, username) VALUES (?, ?, ?)'
  ).run(id, githubId, username);
  // Init default upgrades
  for (const u of ['laser_damage', 'shield', 'engine', 'scanner']) {
    db.prepare('INSERT INTO player_upgrades (player_id, upgrade_id, level) VALUES (?, ?, 1)').run(id, u);
  }
  // Init default reputation
  for (const [f, v] of [['federation', 0], ['miners', 0], ['traders', 0], ['pirates', -20]] as const) {
    db.prepare('INSERT INTO player_reputation (player_id, faction_id, value) VALUES (?, ?, ?)').run(id, f, v);
  }
  return { id, username, credits: 1000 };
}

export function getPlayer(id: string): any {
  return getDB().prepare('SELECT * FROM players WHERE id = ?').get(id);
}

export function updatePlayerCredits(id: string, credits: number): void {
  getDB().prepare('UPDATE players SET credits = ? WHERE id = ?').run(credits, id);
}

export function updatePlayerCargo(id: string, cargoUsed: number): void {
  getDB().prepare('UPDATE players SET cargo_used = ? WHERE id = ?').run(cargoUsed, id);
}

export function updatePlayerHullShield(id: string, hull: number, shield: number): void {
  getDB().prepare('UPDATE players SET hull = ?, shield = ? WHERE id = ?').run(hull, shield, id);
}

export function updatePlayerPosition(id: string, x: number, y: number, z: number, system: number): void {
  getDB().prepare(
    'UPDATE players SET position_x = ?, position_y = ?, position_z = ?, current_system = ? WHERE id = ?'
  ).run(x, y, z, system, id);
}

export function getPlayerUpgrades(id: string): Record<string, number> {
  const rows = getDB().prepare('SELECT upgrade_id, level FROM player_upgrades WHERE player_id = ?').all(id) as any[];
  const upgrades: Record<string, number> = {};
  for (const r of rows) upgrades[r.upgrade_id] = r.level;
  return upgrades;
}

export function getPlayerReputation(id: string): Record<string, number> {
  const rows = getDB().prepare('SELECT faction_id, value FROM player_reputation WHERE player_id = ?').all(id) as any[];
  const rep: Record<string, number> = {};
  for (const r of rows) rep[r.faction_id] = r.value;
  return rep;
}

export function getPlayerCargo(id: string): any[] {
  return getDB().prepare('SELECT good_id, quantity FROM player_cargo WHERE player_id = ?').all(id);
}

export function getPlayerMissions(id: string): any[] {
  return getDB().prepare('SELECT * FROM player_missions WHERE player_id = ?').all(id);
}

export function upsertPlayerCargo(id: string, goodId: string, qty: number): void {
  getDB().prepare(
    'INSERT INTO player_cargo (player_id, good_id, quantity) VALUES (?, ?, ?) ON CONFLICT(player_id, good_id) DO UPDATE SET quantity = ?'
  ).run(id, goodId, qty, qty);
}

export function upsertPlayerMission(id: string, mission: any): void {
  getDB().prepare(
    `INSERT INTO player_missions (player_id, mission_id, type, title, description, reward, progress, target, completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id, mission_id) DO UPDATE SET progress = ?, completed = ?`
  ).run(id, mission.mission_id, mission.type, mission.title, mission.description || '',
    mission.reward, mission.progress, mission.target, mission.completed ? 1 : 0,
    mission.progress, mission.completed ? 1 : 0);
}

export function changeReputation(id: string, factionId: string, delta: number): void {
  getDB().prepare(
    `INSERT INTO player_reputation (player_id, faction_id, value) VALUES (?, ?, ?)
     ON CONFLICT(player_id, faction_id) DO UPDATE SET value = MAX(-100, MIN(100, value + ?))`
  ).run(id, factionId, delta, delta);
}

export function closeDB(): void {
  if (db) db.close();
}
