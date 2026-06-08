// ============================================================
// Shared ship physics — single source of truth for client & server.
// Both FlightModel (client) and ShipEntity (server) use these
// types, constants, and the core simulation step.
// ============================================================

// ── Types ───────────────────────────────────────────────────────────

export type FlightMode = 'realistic' | 'flight_assist' | 'cruise';

export interface ShipConfig {
  mass: number;
  thrust: number;
  rotationalSpeed: number;   // rad/s base turn rate
  maxSpeedAssist: number;
  maxSpeedCruise: number;
  boostMultiplier: number;
  boostCapacity: number;     // max boost energy
  boostRecharge: number;     // energy/sec recovery
}

export interface ShipState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
  angularVelocity: { x: number; y: number; z: number };
  boostEnergy: number;
  mode: FlightMode;
  throttle: number;          // 0..1
}

export interface ShipInput {
  throttle: number;          // 0..1
  boost: boolean;
  torque: { x: number; y: number; z: number }; // -1..1 per axis
  mode: FlightMode;
}

// ── Constants ───────────────────────────────────────────────────────

export const DEFAULT_SHIP_CONFIG: ShipConfig = {
  mass: 20,
  thrust: 4000,
  rotationalSpeed: 8.0,
  maxSpeedAssist: 30,
  maxSpeedCruise: 200,
  boostMultiplier: 40.0,
  boostCapacity: 100,
  boostRecharge: 15,
};

/** Lighter config for NPC/traffic ships */
export const NPC_SHIP_CONFIG: ShipConfig = {
  mass: 20,
  thrust: 250,
  rotationalSpeed: 5.0,
  maxSpeedAssist: 250,
  maxSpeedCruise: 200,
  boostMultiplier: 1.0,
  boostCapacity: 0,
  boostRecharge: 0,
};

// ── Core simulation ─────────────────────────────────────────────────

const PHYSICS_SUBSTEP = 1 / 120; // fixed 120Hz substep for stability
const EPSILON = 0.0001;

// Drag coefficients per flight mode
const DRAG_ANGULAR: Record<FlightMode, number> = {
  realistic:     0.995,
  flight_assist: 0.94,
  cruise:        0.98,
};

const DRAG_LINEAR_ACTIVE: Record<FlightMode, number> = {
  realistic:     1.0,
  flight_assist: 0.998,
  cruise:        0.999,
};

const DRAG_LINEAR_IDLE: Record<FlightMode, number> = {
  realistic:     1.0,
  flight_assist: 0.97,
  cruise:        0.999,
};

// Reusable vectors (caller must provide to avoid allocations)
interface Scratch {
  av: { x: number; y: number; z: number };
  axis: { x: number; y: number; z: number };
  thrustWorld: { x: number; y: number; z: number };
}

function createScratch(): Scratch {
  return {
    av: { x: 0, y: 0, z: 0 },
    axis: { x: 0, y: 0, z: 0 },
    thrustWorld: { x: 0, y: 0, z: 0 },
  };
}

// Vec3 helpers (inline to avoid THREE dependency in shared code)
const V3 = {
  set<T extends { x: number; y: number; z: number }>(out: T, x: number, y: number, z: number): T {
    out.x = x; out.y = y; out.z = z; return out;
  },
  copy<T extends { x: number; y: number; z: number }>(out: T, src: { x: number; y: number; z: number }): T {
    out.x = src.x; out.y = src.y; out.z = src.z; return out;
  },
  add(out: { x: number; y: number; z: number }, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
    out.x = a.x + b.x; out.y = a.y + b.y; out.z = a.z + b.z;
  },
  sub(out: { x: number; y: number; z: number }, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
    out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z;
  },
  scale(out: { x: number; y: number; z: number }, v: { x: number; y: number; z: number }, s: number) {
    out.x = v.x * s; out.y = v.y * s; out.z = v.z * s;
  },
  length(v: { x: number; y: number; z: number }): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  },
  normalize(out: { x: number; y: number; z: number }, v: { x: number; y: number; z: number }) {
    const len = V3.length(v);
    if (len > EPSILON) { out.x = v.x / len; out.y = v.y / len; out.z = v.z / len; }
    else { out.x = 0; out.y = 0; out.z = 0; }
  },
  dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  },
};

// Quaternion helpers
const Q4 = {
  multiply(out: { x: number; y: number; z: number; w: number },
           a: { x: number; y: number; z: number; w: number },
           b: { x: number; y: number; z: number; w: number }) {
    out.x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
    out.y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
    out.z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
    out.w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  },
  setFromAxisAngle(out: { x: number; y: number; z: number; w: number },
                   axis: { x: number; y: number; z: number }, angle: number) {
    const half = angle * 0.5;
    const s = Math.sin(half);
    out.x = axis.x * s; out.y = axis.y * s; out.z = axis.z * s;
    out.w = Math.cos(half);
  },
  normalize(out: { x: number; y: number; z: number; w: number },
            q: { x: number; y: number; z: number; w: number }) {
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    if (len > EPSILON) { out.x = q.x / len; out.y = q.y / len; out.z = q.z / len; out.w = q.w / len; }
  },
  rotateVector(out: { x: number; y: number; z: number },
               v: { x: number; y: number; z: number },
               q: { x: number; y: number; z: number; w: number }) {
    // q * v * q^-1
    const qv = { x: v.x, y: v.y, z: v.z, w: 0 };
    const qInv = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
    const tmp = { x: 0, y: 0, z: 0, w: 0 };
    Q4.multiply(tmp, q, qv);
    Q4.multiply(tmp, tmp, qInv);
    out.x = tmp.x; out.y = tmp.y; out.z = tmp.z;
  },
};

/**
 * Single substep of ship physics (fixed dt = 1/120s).
 *
 * Pure function — mutates `state` in place.
 * Separate from THREE.js so both client (with THREE) and server (with THREE)
 * can use it without shared dependency on the math library.
 *
 * Caller provides `scratch` object to avoid allocations.
 * Caller optionally provides the THREE implementation for rotation
 * (or uses the built-in quaternion math above).
 */
export function physicsSubstep(
  state: ShipState,
  config: ShipConfig,
  input: ShipInput,
  dt: number,
  scratch: Scratch,
): void {
  // ── Rotation ──
  const torqueScale = config.rotationalSpeed * dt;
  scratch.av.x = state.angularVelocity.x + input.torque.x * torqueScale;
  scratch.av.y = state.angularVelocity.y + input.torque.y * torqueScale;
  scratch.av.z = state.angularVelocity.z + input.torque.z * torqueScale;

  // Angular drag
  const angularDrag = DRAG_ANGULAR[input.mode] ?? 0.94;
  scratch.av.x *= angularDrag;
  scratch.av.y *= angularDrag;
  scratch.av.z *= angularDrag;

  // Update orientation via axis-angle
  V3.scale(scratch.av, scratch.av, dt); // reuse av as scaled angular velocity
  const angle = V3.length(scratch.av);
  if (angle > EPSILON) {
    V3.normalize(scratch.axis, scratch.av);
    const rot = { x: 0, y: 0, z: 0, w: 1 };
    Q4.setFromAxisAngle(rot, scratch.axis, angle);
    Q4.multiply(state.orientation, state.orientation, rot);
    Q4.normalize(state.orientation, state.orientation);
  }

  // Store angular velocity (unscaled)
  scratch.av.x = state.angularVelocity.x;
  scratch.av.y = state.angularVelocity.y;
  scratch.av.z = state.angularVelocity.z;
  // Recalculate from post-drag values ÷ dt
  state.angularVelocity.x = scratch.av.x * angularDrag;
  state.angularVelocity.y = scratch.av.y * angularDrag;
  state.angularVelocity.z = scratch.av.z * angularDrag;

  // ── Boost energy ──
  if (input.boost && state.boostEnergy > 0 && V3.length(state.velocity) > 0.5) {
    const speedRatio = Math.min(1, V3.length(state.velocity) / config.maxSpeedAssist);
    state.boostEnergy = Math.max(0, state.boostEnergy - (0.1 + speedRatio * 0.5) * dt);
  } else {
    state.boostEnergy = Math.min(config.boostCapacity, state.boostEnergy + config.boostRecharge * dt);
  }
  const boosting = input.boost && state.boostEnergy > 0;

  // ── Linear thrust ──
  const thrustMultiplier = boosting ? config.boostMultiplier : 1.0;
  const thrustForce = config.thrust * thrustMultiplier * dt * state.throttle;

  // Thrust in local Z-forward, rotated to world
  const localThrust = { x: 0, y: 0, z: thrustForce };
  Q4.rotateVector(scratch.thrustWorld, localThrust, state.orientation);

  // Acceleration: F = ma → a = F/m
  const accelScale = 1 / config.mass;
  state.velocity.x += scratch.thrustWorld.x * accelScale;
  state.velocity.y += scratch.thrustWorld.y * accelScale;
  state.velocity.z += scratch.thrustWorld.z * accelScale;

  // ── Drag ──
  const thrustActive = state.throttle > 0.01;
  const drag = thrustActive
    ? (DRAG_LINEAR_ACTIVE[input.mode] ?? 0.998)
    : (DRAG_LINEAR_IDLE[input.mode] ?? 0.97);
  state.velocity.x *= drag;
  state.velocity.y *= drag;
  state.velocity.z *= drag;

  // ── Speed limit ──
  const boostMul = boosting ? config.boostMultiplier : 1;
  const maxSpeed = input.mode === 'cruise'
    ? state.throttle * config.maxSpeedCruise
    : state.throttle * config.maxSpeedAssist * boostMul;

  const speed = V3.length(state.velocity);
  if (speed > maxSpeed && maxSpeed > 0.1) {
    const limiter = maxSpeed / speed;
    state.velocity.x *= limiter;
    state.velocity.y *= limiter;
    state.velocity.z *= limiter;
  }

  // ── Position update ──
  state.position.x += state.velocity.x * dt;
  state.position.y += state.velocity.y * dt;
  state.position.z += state.velocity.z * dt;
}

/**
 * Full simulation step with fixed substeps.
 * Call from your game loop with variable dt.
 */
export function simulateShip(
  state: ShipState,
  config: ShipConfig,
  input: ShipInput,
  dt: number,
  scratch?: Scratch,
): void {
  const _scratch = scratch ?? createScratch();
  const clampedDt = Math.min(dt, 0.05);
  const substeps = Math.ceil(clampedDt / PHYSICS_SUBSTEP);
  const subDt = clampedDt / substeps;

  for (let i = 0; i < substeps; i++) {
    physicsSubstep(state, config, input, subDt, _scratch);
  }
}

/**
 * Reset a ship state to defaults.
 */
export function resetShipState(state: ShipState, config: ShipConfig, pos?: { x: number; y: number; z: number }): void {
  state.position.x = pos?.x ?? 0;
  state.position.y = pos?.y ?? 0;
  state.position.z = pos?.z ?? 0;
  state.velocity.x = 0; state.velocity.y = 0; state.velocity.z = 0;
  state.orientation.x = 0; state.orientation.y = 0; state.orientation.z = 0; state.orientation.w = 1;
  state.angularVelocity.x = 0; state.angularVelocity.y = 0; state.angularVelocity.z = 0;
  state.boostEnergy = config.boostCapacity;
  state.throttle = 0;
  state.mode = 'flight_assist';
}
