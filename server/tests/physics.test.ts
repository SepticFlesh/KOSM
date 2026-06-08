import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SHIP_CONFIG,
  NPC_SHIP_CONFIG,
  type ShipConfig,
  type ShipState,
  type ShipInput,
  physicsSubstep,
  resetShipState,
  type FlightMode,
} from '@shared/physics.js';

function makeState(overrides?: Partial<ShipState>): ShipState {
  const s: ShipState = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    boostEnergy: DEFAULT_SHIP_CONFIG.boostCapacity,
    mode: 'flight_assist',
    throttle: 0,
    ...overrides,
  };
  return s;
}

function makeInput(overrides?: Partial<ShipInput>): ShipInput {
  return {
    throttle: 0,
    boost: false,
    torque: { x: 0, y: 0, z: 0 },
    mode: 'flight_assist',
    ...overrides,
  };
}

const scratch = { av: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 0 }, thrustWorld: { x: 0, y: 0, z: 0 } };
const dt = 1 / 120;

describe('Ship Physics (shared)', () => {
  it('should accelerate forward with throttle', () => {
    const state = makeState({ throttle: 1 });
    const input = makeInput({ throttle: 1 });

    for (let i = 0; i < 120; i++) {
      physicsSubstep(state, DEFAULT_SHIP_CONFIG, input, dt, scratch);
    }

    // After 1 second at full throttle, ship should have forward velocity
    expect(state.velocity.z).toBeGreaterThan(0);
    expect(state.position.z).toBeGreaterThan(0);
  });

  it('should obey speed limit in flight_assist mode', () => {
    const state = makeState({ throttle: 1 });
    const input = makeInput({ throttle: 1 });

    // Simulate for many steps to reach steady state
    for (let i = 0; i < 600; i++) {
      physicsSubstep(state, DEFAULT_SHIP_CONFIG, input, dt, scratch);
    }

    const speed = Math.sqrt(
      state.velocity.x ** 2 + state.velocity.y ** 2 + state.velocity.z ** 2
    );
    expect(speed).toBeLessThanOrEqual(DEFAULT_SHIP_CONFIG.maxSpeedAssist * 1.1);
  });

  it('should allow higher speed in cruise mode', () => {
    const state = makeState({ throttle: 1, mode: 'cruise' });
    const input = makeInput({ throttle: 1, mode: 'cruise' });

    for (let i = 0; i < 1200; i++) {
      physicsSubstep(state, DEFAULT_SHIP_CONFIG, input, dt, scratch);
    }

    const speed = Math.sqrt(
      state.velocity.x ** 2 + state.velocity.y ** 2 + state.velocity.z ** 2
    );
    // Cruise speed should be much higher than assist
    expect(speed).toBeGreaterThan(DEFAULT_SHIP_CONFIG.maxSpeedAssist);
  });

  it('should rotate with torque input', () => {
    const state = makeState();
    const input = makeInput({ torque: { x: 1, y: 0, z: 0 } }); // pitch up

    for (let i = 0; i < 30; i++) {
      physicsSubstep(state, DEFAULT_SHIP_CONFIG, input, dt, scratch);
    }

    // Orientation should have changed (no longer identity quaternion)
    const isIdentity =
      state.orientation.x === 0 &&
      state.orientation.y === 0 &&
      state.orientation.z === 0 &&
      state.orientation.w === 1;
    expect(isIdentity).toBe(false);
  });

  it('should drain boost energy when boosting', () => {
    const state = makeState({ throttle: 1 });
    // Give it some initial speed
    state.velocity.z = 10;
    const input = makeInput({ throttle: 1, boost: true });

    const initialEnergy = state.boostEnergy;
    for (let i = 0; i < 60; i++) {
      physicsSubstep(state, DEFAULT_SHIP_CONFIG, input, dt, scratch);
    }

    expect(state.boostEnergy).toBeLessThan(initialEnergy);
  });

  it('should recharge boost when not boosting', () => {
    const state = makeState({ boostEnergy: 50 });
    const input = makeInput();

    for (let i = 0; i < 120; i++) {
      physicsSubstep(state, DEFAULT_SHIP_CONFIG, input, dt, scratch);
    }

    expect(state.boostEnergy).toBeGreaterThan(50);
  });

  it('should apply drag in flight_assist mode when idle', () => {
    const state = makeState({ throttle: 0 });
    state.velocity.z = 100;
    const input = makeInput({ throttle: 0 });

    for (let i = 0; i < 60; i++) {
      physicsSubstep(state, DEFAULT_SHIP_CONFIG, input, dt, scratch);
    }

    // Speed should have decreased due to idle drag (0.97 per substep)
    expect(state.velocity.z).toBeLessThan(100);
  });

  it('should have no drag in realistic mode', () => {
    const state = makeState({ throttle: 0, mode: 'realistic' });
    state.velocity.z = 100;
    const input = makeInput({ throttle: 0, mode: 'realistic' });

    for (let i = 0; i < 60; i++) {
      physicsSubstep(state, DEFAULT_SHIP_CONFIG, input, dt, scratch);
    }

    // In realistic mode, no drag — speed should remain ~100
    expect(state.velocity.z).toBeCloseTo(100, -1); // within 10
  });

  it('should reset state correctly', () => {
    const state = makeState({
      position: { x: 100, y: 200, z: 300 },
      velocity: { x: 10, y: 20, z: 30 },
      throttle: 1,
    });

    resetShipState(state, DEFAULT_SHIP_CONFIG, { x: 0, y: 0, z: 0 });

    expect(state.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(state.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(state.throttle).toBe(0);
    expect(state.boostEnergy).toBe(DEFAULT_SHIP_CONFIG.boostCapacity);
    expect(state.mode).toBe('flight_assist');
  });

  it('should use NPC config with different values', () => {
    expect(NPC_SHIP_CONFIG.thrust).toBeLessThan(DEFAULT_SHIP_CONFIG.thrust);
    expect(NPC_SHIP_CONFIG.boostMultiplier).toBe(1);
    expect(NPC_SHIP_CONFIG.boostCapacity).toBe(0);
    expect(NPC_SHIP_CONFIG.maxSpeedAssist).toBeGreaterThan(DEFAULT_SHIP_CONFIG.maxSpeedAssist);
  });
});
