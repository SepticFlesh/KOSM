import { Quaternion } from 'three';
import type { EntitySnapshot } from './protocol';

interface InterpEntry {
  snapshots: Array<{ state: EntitySnapshot; time: number }>;
}

/**
 * Interpolates remote entities between server snapshots for smooth rendering.
 */
export class EntityInterpolator {
  private entries = new Map<string, InterpEntry>();
  private renderDelay = 0.1; // 100ms behind server time

  /** Feed a new snapshot into the interpolator */
  addSnapshot(entities: EntitySnapshot[], serverTime: number): void {
    for (const e of entities) {
      if (!this.entries.has(e.id)) {
        this.entries.set(e.id, { snapshots: [] });
      }
      const entry = this.entries.get(e.id)!;
      entry.snapshots.push({ state: e, time: serverTime });
      // Keep only last 3 snapshots
      if (entry.snapshots.length > 3) entry.snapshots.shift();
    }
  }

  /** Get interpolated state for an entity at current render time */
  getState(entityId: string): EntitySnapshot | null {
    const entry = this.entries.get(entityId);
    if (!entry || entry.snapshots.length < 2) {
      // Return latest if only one
      if (entry && entry.snapshots.length === 1) return entry.snapshots[0].state;
      return null;
    }

    const renderTime = Date.now() / 1000 - this.renderDelay;
    const snaps = entry.snapshots;

    // Find two snapshots bracketing renderTime
    let i0 = 0;
    for (let i = 1; i < snaps.length; i++) {
      if (snaps[i].time > renderTime) break;
      i0 = i;
    }
    let i1 = Math.min(i0 + 1, snaps.length - 1);
    if (i0 === i1) return snaps[i0].state;

    const t0 = snaps[i0].time;
    const t1 = snaps[i1].time;
    const frac = t1 > t0 ? (renderTime - t0) / (t1 - t0) : 0;
    const t = Math.max(0, Math.min(1, frac));

    return this.lerpEntity(snaps[i0].state, snaps[i1].state, t);
  }

  /** Remove entities no longer in snapshots */
  cleanup(activeIds: Set<string>): void {
    for (const id of this.entries.keys()) {
      if (!activeIds.has(id)) this.entries.delete(id);
    }
  }

  private lerpEntity(a: EntitySnapshot, b: EntitySnapshot, t: number): EntitySnapshot {
    return {
      id: a.id,
      position: {
        x: a.position.x + (b.position.x - a.position.x) * t,
        y: a.position.y + (b.position.y - a.position.y) * t,
        z: a.position.z + (b.position.z - a.position.z) * t,
      },
      orientation: this.slerpQuat(a.orientation, b.orientation, t),
      velocity: {
        x: a.velocity.x + (b.velocity.x - a.velocity.x) * t,
        y: a.velocity.y + (b.velocity.y - a.velocity.y) * t,
        z: a.velocity.z + (b.velocity.z - a.velocity.z) * t,
      },
      health: a.health + (b.health - a.health) * t,
      shield: a.shield + (b.shield - a.shield) * t,
      ownerId: a.ownerId,
      npcType: a.npcType,
    };
  }

  private slerpQuat(
    a: { x: number; y: number; z: number; w: number },
    b: { x: number; y: number; z: number; w: number },
    t: number,
  ): { x: number; y: number; z: number; w: number } {
    const qa = new Quaternion(a.x, a.y, a.z, a.w);
    const qb = new Quaternion(b.x, b.y, b.z, b.w);
    qa.slerp(qb, t);
    return { x: qa.x, y: qa.y, z: qa.z, w: qa.w };
  }
}
