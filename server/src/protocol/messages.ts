// ============================================================
// Message protocol — shared between client and server.
// ============================================================

import { z } from 'zod';
import type {
  Vec3, Quat,
  InputPayload, EntitySnapshot, WorldSnapshot,
  TradeGood, MissionDef, PlayerFullState,
} from '../shared/types.js';

export type { Vec3, Quat, InputPayload, EntitySnapshot, WorldSnapshot, TradeGood, MissionDef, PlayerFullState };

// --- Client → Server ---

export interface AuthMessage {
  type: 'auth';
  payload: { token: string };
}

export interface InputMessage {
  type: 'input';
  payload: InputPayload;
}

export interface TradeBuyMessage {
  type: 'trade_buy';
  payload: { goodId: string; quantity: number };
}

export interface TradeSellMessage {
  type: 'trade_sell';
  payload: { goodId: string; quantity: number };
}

export interface MissionAcceptMessage {
  type: 'mission_accept';
  payload: { missionId: number };
}

export interface JumpRequestMessage {
  type: 'jump_request';
  payload: { targetSystem: number };
}

export interface ChatMessage {
  type: 'chat_message';
  payload: { text: string };
}

export type ClientMessage =
  | AuthMessage
  | InputMessage
  | TradeBuyMessage
  | TradeSellMessage
  | { type: 'trade_request'; payload: Record<string, never> }
  | MissionAcceptMessage
  | JumpRequestMessage
  | ChatMessage
  | { type: 'fire_bolt'; payload: { pos: Vec3; dir: Vec3 } }
  | { type: 'ping'; payload?: Record<string, never> };

// --- Server → Client ---

export interface AuthOkMessage {
  type: 'auth_ok';
  payload: { playerId: string; username: string };
}

export interface AuthErrorMessage {
  type: 'auth_error';
  payload: { reason: string };
}

export interface WorldSnapshotMessage {
  type: 'world_snapshot';
  payload: WorldSnapshot;
}

export interface PlayerStateMessage {
  type: 'player_state';
  payload: PlayerFullState;
}

export interface TradeMenuMessage {
  type: 'trade_menu';
  payload: { goods: TradeGood[]; credits: number };
}

export interface MissionsMessage {
  type: 'missions';
  payload: { missions: MissionDef[] };
}

export interface CombatEventMessage {
  type: 'combat_event';
  payload: { damage: number; sourceId: string; targetId: string };
}

export interface ChatBroadcastMessage {
  type: 'chat_broadcast';
  payload: { playerName: string; text: string; timestamp: number };
}

export interface SystemSwitchMessage {
  type: 'system_switch';
  payload: { systemSeed: number; position: Vec3 };
}

export interface ErrorMessage {
  type: 'error';
  payload: { code: string; message: string };
}

export type ServerMessage =
  | AuthOkMessage
  | AuthErrorMessage
  | WorldSnapshotMessage
  | PlayerStateMessage
  | TradeMenuMessage
  | MissionsMessage
  | CombatEventMessage
  | ChatBroadcastMessage
  | SystemSwitchMessage
  | ErrorMessage;

// ── Zod validation schemas ──────────────────────────────────────────

const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });
const QuatSchema = z.object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() });

export const InputPayloadSchema = z.object({
  tick: z.number(),
  throttle: z.number().min(0).max(1),
  boost: z.boolean(),
  fire: z.boolean(),
  mine: z.boolean(),
  torque: Vec3Schema,
  thrust: Vec3Schema,
  mode: z.enum(['realistic', 'flight_assist', 'cruise']),
  orientation: QuatSchema,
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'),     payload: z.object({ token: z.string().min(1) }) }),
  z.object({ type: z.literal('input'),    payload: InputPayloadSchema }),
  z.object({ type: z.literal('fire_bolt'), payload: z.object({ pos: Vec3Schema, dir: Vec3Schema }) }),
  z.object({ type: z.literal('trade_buy'),  payload: z.object({ goodId: z.string().min(1), quantity: z.number().int().positive() }) }),
  z.object({ type: z.literal('trade_sell'), payload: z.object({ goodId: z.string().min(1), quantity: z.number().int().positive() }) }),
  z.object({ type: z.literal('trade_request'), payload: z.object({}).optional() }),
  z.object({ type: z.literal('mission_accept'), payload: z.object({ missionId: z.number().int().positive() }) }),
  z.object({ type: z.literal('jump_request'),  payload: z.object({ targetSystem: z.number().int().min(0) }) }),
  z.object({ type: z.literal('chat_message'),  payload: z.object({ text: z.string().min(1).max(500) }) }),
  z.object({ type: z.literal('ping'), payload: z.object({}).optional() }),
]);

export type ClientMessageValidated = z.infer<typeof ClientMessageSchema>;

/** Validate an incoming client message. Returns parsed message or error string. */
export function validateClientMessage(data: unknown): { ok: true; msg: ClientMessageValidated } | { ok: false; error: string } {
  const result = ClientMessageSchema.safeParse(data);
  if (result.success) return { ok: true, msg: result.data };
  const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  return { ok: false, error: issues };
}
