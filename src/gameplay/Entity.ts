import * as THREE from 'three';

/**
 * Serializable state for any ship-like entity (player, NPC, remote player).
 * Used for network sync and shared AI/physics.
 */
export interface EntityState {
  id: string;
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
  velocity: { x: number; y: number; z: number };
  angularVelocity: { x: number; y: number; z: number };
  health: number;
  maxHealth: number;
  shield: number;
  throttle: number;
  boostActive: boolean;
  mode: string;
}

/** Convert THREE.Vector3 to plain object */
export function vec3ToState(v: THREE.Vector3): { x: number; y: number; z: number } {
  return { x: v.x, y: v.y, z: v.z };
}

/** Convert THREE.Quaternion to plain object */
export function quatToState(q: THREE.Quaternion): { x: number; y: number; z: number; w: number } {
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

/** Apply plain state object to a THREE.Vector3 */
export function stateToVec3(s: { x: number; y: number; z: number }, target: THREE.Vector3): THREE.Vector3 {
  return target.set(s.x, s.y, s.z);
}

/** Apply plain state object to a THREE.Quaternion */
export function stateToQuat(s: { x: number; y: number; z: number; w: number }, target: THREE.Quaternion): THREE.Quaternion {
  return target.set(s.x, s.y, s.z, s.w);
}
