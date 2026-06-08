// ============================================================
// Shared geometric & protocol types.
// Both client and server import from here.
// ============================================================

// ── Geometric primitives ────────────────────────────────────────────

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

// ── Network protocol types ──────────────────────────────────────────

export interface InputPayload {
  tick: number;
  throttle: number;
  boost: boolean;
  fire: boolean;
  mine: boolean;
  torque: Vec3;
  thrust: Vec3;
  mode: string;
  orientation: Quat;
}

export interface EntitySnapshot {
  id: string;
  position: Vec3;
  orientation: Quat;
  velocity: Vec3;
  health: number;
  shield: number;
  ownerId?: string;
  npcType?: string;
}

export interface WorldSnapshot {
  tick: number;
  timestamp: number;
  systemSeed: number;
  entities: EntitySnapshot[];
  station?: { id: string; position: Vec3 };
  routes?: Array<{
    id: string;
    type: string;
    waypoints: Array<{ x: number; y: number; z: number; isBase?: boolean }>;
  }>;
}

// ── Economy & Missions ──────────────────────────────────────────────

export interface TradeGood {
  id: string;
  name: string;
  price: number;
  playerQty: number;
  stationQty: number;
}

export interface MissionDef {
  id: number;
  type: 'destroy' | 'deliver';
  title: string;
  description: string;
  reward: number;
  progress: number;
  target: number;
  completed: boolean;
}

export interface PlayerFullState {
  playerId: string;
  username: string;
  credits: number;
  cargoUsed: number;
  cargoMax: number;
  cargo: TradeGood[];
  hull: number;
  shield: number;
  reputation: Record<string, number>;
  upgrades: Record<string, number>;
  missions: MissionDef[];
  currentSystem: number;
  position: Vec3;
  orientation: Quat;
}
