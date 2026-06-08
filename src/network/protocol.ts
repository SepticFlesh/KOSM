// ============================================================
// Client network protocol — mirrors server/src/protocol/messages.ts
// ============================================================

import type {
  Vec3, Quat,
  InputPayload, EntitySnapshot, WorldSnapshot,
} from '@shared/types';

export type { Vec3, Quat, InputPayload, EntitySnapshot, WorldSnapshot };

// --- Client → Server messages ---
export type ClientMessage =
  | { type: 'auth'; payload: { token: string } }
  | { type: 'input'; payload: InputPayload }
  | { type: 'fire_bolt'; payload: { pos: Vec3; dir: Vec3 } }
  | { type: 'trade_buy'; payload: { goodId: string; quantity: number } }
  | { type: 'trade_sell'; payload: { goodId: string; quantity: number } }
  | { type: 'trade_request'; payload: Record<string, never> }
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
