// ============================================================
// Client network protocol — mirrors server/src/protocol/messages.ts
// ============================================================

// --- Shared types ---
export interface Vec3 { x: number; y: number; z: number; }
export interface Quat { x: number; y: number; z: number; w: number; }

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
}

// --- Client → Server messages ---
export type ClientMessage =
  | { type: 'auth'; payload: { token: string } }
  | { type: 'input'; payload: InputPayload }
  | { type: 'trade_buy'; payload: { goodId: string; quantity: number } }
  | { type: 'trade_sell'; payload: { goodId: string; quantity: number } }
  | { type: 'mission_accept'; payload: { missionId: number } }
  | { type: 'jump_request'; payload: { targetSystem: number } }
  | { type: 'chat_message'; payload: { text: string } };

// --- Server → Client messages ---
export type ServerMessage =
  | { type: 'auth_ok'; payload: { playerId: string; username: string } }
  | { type: 'auth_error'; payload: { reason: string } }
  | { type: 'world_snapshot'; payload: WorldSnapshot }
  | { type: 'player_state'; payload: any }
  | { type: 'trade_menu'; payload: { goods: any[]; credits: number } }
  | { type: 'missions'; payload: { missions: any[] } }
  | { type: 'combat_event'; payload: { damage: number; sourceId: string; targetId: string } }
  | { type: 'chat_broadcast'; payload: { playerName: string; text: string; timestamp: number } }
  | { type: 'system_switch'; payload: { systemSeed: number; position: Vec3 } }
  | { type: 'error'; payload: { code: string; message: string } };
