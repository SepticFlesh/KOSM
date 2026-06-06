// ============================================================
// Message protocol — shared between client and server.
// ============================================================

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
  | MissionAcceptMessage
  | JumpRequestMessage
  | ChatMessage;

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
  ownerId?: string; // player-owned
  npcType?: string; // 'pirate' etc
}

export interface WorldSnapshot {
  tick: number;
  timestamp: number;
  systemSeed: number;
  entities: EntitySnapshot[];
  station?: { id: string; position: Vec3 };
}

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
