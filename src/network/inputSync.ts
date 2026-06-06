import { Vector3, Quaternion } from 'three';
import type { FlightModel } from '../gameplay/FlightModel';
import type { WSClient } from './wsClient';
import type { InputPayload, WorldSnapshot } from './protocol';

/**
 * Manages sending player input to server and reconciling server state.
 */
export class InputSync {
  private ws: WSClient;
  private flightModel: FlightModel;
  private clientTick = 0;
  private sendTimer = 0;
  private sendInterval = 1 / 20; // 20Hz send rate
  private pendingInputs: InputPayload[] = [];

  constructor(ws: WSClient, flightModel: FlightModel) {
    this.ws = ws;
    this.flightModel = flightModel;
  }

  /** Call every frame with dt. Sends input at 20Hz. */
  update(dt: number, fireActive: boolean, mineActive: boolean): void {
    this.sendTimer += dt;

    if (this.sendTimer >= this.sendInterval && this.ws.connected) {
      this.sendTimer -= this.sendInterval;
      this.clientTick++;

      const state = this.flightModel.state;
      const input: InputPayload = {
        tick: this.clientTick,
        throttle: state.throttle,
        boost: this.flightModel.boostActive,
        fire: fireActive,
        mine: mineActive,
        torque: { x: 0, y: 0, z: 0 }, // torque is applied locally, not sent
        thrust: { x: 0, y: 0, z: 0 },
        mode: state.mode,
        orientation: {
          x: state.orientation.x,
          y: state.orientation.y,
          z: state.orientation.z,
          w: state.orientation.w,
        },
      };

      this.pendingInputs.push(input);
      if (this.pendingInputs.length > 10) this.pendingInputs.shift();
      this.ws.send({ type: 'input', payload: input });
    }
  }

  /** Process server snapshot — reconcile if needed */
  onSnapshot(snapshot: WorldSnapshot): void {
    // Find our entity in the snapshot
    // (Player ID matching is done externally — for now, just track tick)
    // Remove acknowledged inputs
    while (this.pendingInputs.length > 0 && this.pendingInputs[0].tick <= snapshot.tick) {
      this.pendingInputs.shift();
    }
  }

  /** Get the server-authoritative position for our player from snapshot */
  getPlayerState(playerId: string, snapshot: WorldSnapshot): {
    position: Vector3;
    orientation: Quaternion;
    velocity: Vector3;
    health: number;
    shield: number;
  } | null {
    const entity = snapshot.entities.find(e => e.id === playerId);
    if (!entity) return null;
    return {
      position: new Vector3(entity.position.x, entity.position.y, entity.position.z),
      orientation: new Quaternion(entity.orientation.x, entity.orientation.y, entity.orientation.z, entity.orientation.w),
      velocity: new Vector3(entity.velocity.x, entity.velocity.y, entity.velocity.z),
      health: entity.health,
      shield: entity.shield,
    };
  }

  /** Smoothly reconcile local state toward server state */
  reconcile(playerState: ReturnType<InputSync['getPlayerState']>): void {
    if (!playerState) return;
    const state = this.flightModel.state;
    const dist = state.position.distanceTo(playerState.position);
    if (dist > 10) {
      // Hard snap
      state.position.copy(playerState.position);
      state.orientation.copy(playerState.orientation);
      state.velocity.copy(playerState.velocity);
    } else if (dist > 1) {
      // Soft correction
      state.position.lerp(playerState.position, 0.3);
      state.orientation.slerp(playerState.orientation, 0.3);
    }
    // Small correction for close states — trust local prediction
  }
}
