import { Vector3, Quaternion } from 'three';
import {
  type ShipConfig,
  type FlightMode,
  DEFAULT_SHIP_CONFIG,
  NPC_SHIP_CONFIG,
} from '@shared/physics.js';

// Re-export shared types for convenience
export type { ShipConfig, FlightMode };
export { DEFAULT_SHIP_CONFIG, NPC_SHIP_CONFIG };

// Legacy alias — use DEFAULT_SHIP_CONFIG instead
export const DEFAULT_CONFIG = DEFAULT_SHIP_CONFIG;
export const NPC_CONFIG = NPC_SHIP_CONFIG;

export interface ShipState {
  position: Vector3;
  velocity: Vector3;
  orientation: Quaternion;
  angularVelocity: Vector3;
  boostEnergy: number;
  mode: FlightMode;
  throttle: number;
  health: number;
  maxHealth: number;
  shield: number;
}

export class ShipEntity {
  public state: ShipState;
  public config: ShipConfig;
  private thrustVector = new Vector3();
  private torqueVector = new Vector3();
  public boosting = false;
  public inputThrottle = 0;
  public inputTorque = new Vector3();
  public inputFire = false;
  public inputMine = false;
  public playerControlled = false;
  public clientOrientation = new Quaternion();

  // Drag coefficients (matching shared/physics.ts reference)
  private static readonly DRAG_ANGULAR: Record<string, number> = {
    realistic: 0.995,
    flight_assist: 0.94,
    cruise: 0.98,
  };
  private static readonly DRAG_LINEAR_ACTIVE: Record<string, number> = {
    realistic: 1.0,
    flight_assist: 0.998,
    cruise: 0.999,
  };
  private static readonly DRAG_LINEAR_IDLE: Record<string, number> = {
    realistic: 1.0,
    flight_assist: 0.97,
    cruise: 0.999,
  };

  constructor(config: Partial<ShipConfig> = {}) {
    this.config = { ...DEFAULT_SHIP_CONFIG, ...config };
    this.state = {
      position: new Vector3(),
      velocity: new Vector3(),
      orientation: new Quaternion(),
      angularVelocity: new Vector3(),
      boostEnergy: this.config.boostCapacity,
      mode: 'flight_assist',
      throttle: 0,
      health: 100,
      maxHealth: 100,
      shield: 100,
    };
  }

  applyInput(throttle: number, boost: boolean, torque: Vector3, mode?: string, fire?: boolean): void {
    this.inputThrottle = Math.max(0, Math.min(1, throttle));
    this.boosting = boost && this.state.boostEnergy > 0 && this.state.velocity.length() > 0.5;
    this.inputTorque.copy(torque);
    this.inputFire = fire || false;
    if (mode === 'realistic' || mode === 'flight_assist' || mode === 'cruise') {
      this.state.mode = mode;
    }
  }

  simulate(dt: number): void {
    const clampedDt = Math.min(dt, 0.05);
    const substeps = Math.ceil(clampedDt / (1 / 120));
    const subDt = clampedDt / substeps;
    for (let i = 0; i < substeps; i++) {
      this.substep(subDt);
    }
  }

  private substep(dt: number): void {
    const { state, config } = this;

    // ── Rotation ──
    // Player-controlled ships use client-authoritative orientation
    if (!this.playerControlled) {
      const torqueScale = config.rotationalSpeed * dt;
      state.angularVelocity.x += this.inputTorque.x * torqueScale;
      state.angularVelocity.y += this.inputTorque.y * torqueScale;
      state.angularVelocity.z += this.inputTorque.z * torqueScale;

      const angularDrag = ShipEntity.DRAG_ANGULAR[state.mode] ?? 0.94;
      state.angularVelocity.multiplyScalar(angularDrag);

      const av = state.angularVelocity.clone().multiplyScalar(dt);
      const angle = av.length();
      if (angle > 0.0001) {
        const rotationQuat = new Quaternion().setFromAxisAngle(av.normalize(), angle);
        state.orientation.multiply(rotationQuat);
        state.orientation.normalize();
      }
    } else {
      // Player ship: trust client orientation directly
      state.orientation.copy(this.clientOrientation);
    }

    // ── Linear movement ──
    const localThrust = new Vector3(0, 0, state.throttle);
    state.throttle = this.inputThrottle;

    let thrustMultiplier = 1.0;
    if (this.boosting && state.boostEnergy > 0) {
      thrustMultiplier = config.boostMultiplier;
      const speedRatio = Math.min(1, state.velocity.length() / config.maxSpeedAssist);
      state.boostEnergy = Math.max(0, state.boostEnergy - (0.1 + speedRatio * 0.5) * dt);
    } else {
      state.boostEnergy = Math.min(config.boostCapacity, state.boostEnergy + config.boostRecharge * dt);
    }

    const thrustForce = localThrust.multiplyScalar(config.thrust * thrustMultiplier * dt);
    thrustForce.applyQuaternion(state.orientation);
    const acceleration = thrustForce.divideScalar(config.mass);
    state.velocity.add(acceleration);

    // ── Drag ──
    const thrustActive = state.throttle > 0.01;
    if (state.mode === 'flight_assist') {
      state.velocity.multiplyScalar(thrustActive ? 0.998 : 0.97);
    } else if (state.mode === 'cruise') {
      state.velocity.multiplyScalar(0.999);
    }
    // realistic: no drag

    // ── Speed limit ──
    const boostMul = this.boosting ? config.boostMultiplier : 1;
    const maxSpeed = state.mode === 'cruise'
      ? state.throttle * config.maxSpeedCruise
      : state.throttle * config.maxSpeedAssist * boostMul;
    const speed = state.velocity.length();
    if (speed > maxSpeed && maxSpeed > 0.1) {
      state.velocity.multiplyScalar(maxSpeed / speed);
    }

    state.position.add(state.velocity.clone().multiplyScalar(dt));
  }

  reset(position?: Vector3): void {
    this.state.position.copy(position ?? new Vector3());
    this.state.velocity.set(0, 0, 0);
    this.state.orientation.identity();
    this.state.angularVelocity.set(0, 0, 0);
    this.state.boostEnergy = this.config.boostCapacity;
    this.state.throttle = 0;
    this.state.health = 100;
    this.state.shield = 100;
    this.thrustVector.set(0, 0, 0);
    this.inputTorque.set(0, 0, 0);
  }
}
