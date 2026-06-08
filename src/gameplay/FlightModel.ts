import * as THREE from 'three';
import type { ShipConfig } from '@shared/physics';
import { DEFAULT_SHIP_CONFIG } from '@shared/physics';

// Re-export for convenience
export type { ShipConfig };
export { DEFAULT_SHIP_CONFIG };

/**
 * Flight mode — matching shared/physics.ts definition.
 * Both a type (string union) and a const object (enum-like access).
 */
export type FlightMode = 'realistic' | 'flight_assist' | 'cruise';

export const FlightMode = {
  Realistic: 'realistic' as FlightMode,
  FlightAssist: 'flight_assist' as FlightMode,
  Cruise: 'cruise' as FlightMode,
} as const;

/**
 * Ship state using THREE.js math types (client-side rendering).
 */
export interface ShipState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  orientation: THREE.Quaternion;
  angularVelocity: THREE.Vector3;
  boostEnergy: number;
  mode: FlightMode;
  throttle: number;          // 0..1
}

/**
 * Flight model — client-side ship physics.
 * Uses shared ShipConfig constants; simulation matches server.
 */
export class FlightModel {
  public state: ShipState;
  public config: ShipConfig;

  private thrustVector: THREE.Vector3 = new THREE.Vector3();
  private torqueVector: THREE.Vector3 = new THREE.Vector3();
  private boosting = false;
  public boostActive = false;

  constructor(config: Partial<ShipConfig> = {}) {
    this.config = { ...DEFAULT_SHIP_CONFIG, ...config };
    this.state = {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      orientation: new THREE.Quaternion(),
      angularVelocity: new THREE.Vector3(),
      boostEnergy: this.config.boostCapacity,
      mode: 'flight_assist',
      throttle: 0,
    };
  }

  setThrust(axis: THREE.Vector3): void {
    this.thrustVector.copy(axis);
  }

  setTorque(axis: THREE.Vector3): void {
    this.torqueVector.copy(axis);
  }

  setMode(mode: FlightMode): void {
    this.state.mode = mode;
  }

  setThrottle(throttle: number): void {
    this.state.throttle = Math.max(0, Math.min(1, throttle));
  }

  setBoost(active: boolean): void {
    const hasSpeed = this.state.velocity.length() > 0.5;
    this.boosting = active && this.state.boostEnergy > 0 && hasSpeed;
    this.boostActive = this.boosting;
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
    const torqueScale = config.rotationalSpeed * dt;
    state.angularVelocity.x += this.torqueVector.x * torqueScale;
    state.angularVelocity.y += this.torqueVector.y * torqueScale;
    state.angularVelocity.z += this.torqueVector.z * torqueScale;

    // Angular drag (matching shared/physics.ts coefficients)
    let angularDrag: number;
    switch (state.mode) {
      case 'realistic':     angularDrag = 0.995; break;
      case 'cruise':        angularDrag = 0.98; break;
      case 'flight_assist':
      default:              angularDrag = 0.94; break;
    }
    state.angularVelocity.multiplyScalar(angularDrag);

    const av = state.angularVelocity.clone().multiplyScalar(dt);
    const angle = av.length();
    if (angle > 0.0001) {
      const rotationQuat = new THREE.Quaternion().setFromAxisAngle(av.normalize(), angle);
      state.orientation.multiply(rotationQuat);
      state.orientation.normalize();
    }

    // ── Linear movement ──
    const localThrust = this.thrustVector.clone();
    localThrust.z += state.throttle;

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
    const thrustActive = Math.abs(this.thrustVector.x) > 0.01 ||
                         Math.abs(this.thrustVector.y) > 0.01 ||
                         Math.abs(this.thrustVector.z) > 0.01 ||
                         state.throttle > 0.01;
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

    const maxVertSpeed = 30 * boostMul;
    if (Math.abs(state.velocity.y) > maxVertSpeed) {
      state.velocity.y = Math.sign(state.velocity.y) * maxVertSpeed;
    }

    const speed = state.velocity.length();
    if (speed > maxSpeed && maxSpeed > 0.1) {
      state.velocity.multiplyScalar(maxSpeed / speed);
    }

    state.position.add(state.velocity.clone().multiplyScalar(dt));
  }

  reset(position?: THREE.Vector3): void {
    this.state.position.copy(position ?? new THREE.Vector3());
    this.state.velocity.set(0, 0, 0);
    this.state.orientation.identity();
    this.state.angularVelocity.set(0, 0, 0);
    this.state.boostEnergy = this.config.boostCapacity;
    this.state.throttle = 0;
    this.thrustVector.set(0, 0, 0);
    this.torqueVector.set(0, 0, 0);
  }

  getForward(): THREE.Vector3 {
    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(this.state.orientation);
    return forward;
  }

  getUp(): THREE.Vector3 {
    const up = new THREE.Vector3(0, 1, 0);
    up.applyQuaternion(this.state.orientation);
    return up;
  }

  getRight(): THREE.Vector3 {
    const right = new THREE.Vector3(1, 0, 0);
    right.applyQuaternion(this.state.orientation);
    return right;
  }
}
