import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { Universe } from '../world/Universe';
import type { ShipController } from '../gameplay/ShipController';
import { gameState } from '../ui/store/gameStore';
import { soundManager } from '../audio/SoundManager';

// ── Vec3 object pool (reduces GC pressure from ~200 allocs/frame) ────

class Vec3Pool {
  private pool: THREE.Vector3[] = [];
  private index = 0;

  get(x = 0, y = 0, z = 0): THREE.Vector3 {
    if (this.index >= this.pool.length) {
      this.pool.push(new THREE.Vector3());
    }
    const v = this.pool[this.index++];
    v.set(x, y, z);
    return v;
  }

  /** Release all borrowed vectors back to the pool */
  releaseAll(): void {
    this.index = 0;
  }

  /** Pre-allocate */
  ensure(capacity: number): void {
    while (this.pool.length < capacity) {
      this.pool.push(new THREE.Vector3());
    }
  }
}

export type BlipSource = 'sp' | 'mp';

export interface BlipEntity {
  px: number; py: number; pz: number;
  health: number;
  type: 'enemy' | 'station' | 'player' | 'star' | 'planet' | 'orbit';
  npcType?: string;
  isPlayer?: boolean;
  isNPC?: boolean;
  r?: number; // for planet/orbit radius
}

export interface HUDSyncOptions {
  engine: Engine;
  starPos: THREE.Vector3;
  playerShip: ShipController;
  universe: Universe;
  source: BlipSource;
  /** Return list of entities for radar/navigator/map */
  getEntities: () => BlipEntity[];
  /** Optional: autosave callback (SP only) */
  onAutosave?: () => void;
  /** Optional: auto-aim target (SP only) */
  getLockedTarget?: () => { pos: THREE.Vector3; distance: number } | null;
}

/**
 * Shared HUD sync loop — drives radar, navigator, map, and HUD fields.
 * Used by both SinglePlayer and Multiplayer modes.
 */
export function createHUDSync(opts: HUDSyncOptions): () => void {
  const { engine, starPos, playerShip, universe, source, getEntities, onAutosave, getLockedTarget } = opts;
  let destroyed = false;
  let lastFrame = Date.now();
  let lastSave = Date.now();
  let hudSyncRef: number;

  // Pre-allocate pool (supports ~300 entities per frame)
  const pool = new Vec3Pool();
  pool.ensure(200);

  const sync = () => {
    if (destroyed) return;
    const fm = playerShip.flightModel;
    const shipPos = fm.state.position;

    const now = Date.now();
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;

    // ── Shield regen: +1/sec after 3s of no damage ──
    const lastDmg = (gameState as any).lastDamageTime || 0;
    let shield = gameState.player.shield;
    if (now - lastDmg > 3000 && shield < 100) {
      shield = Math.min(100, shield + dt * 1);
    }

    // ── Update global HUD ref (read by HUD component) ──
    const hudRef = (window as any).__kosmHUD;
    if (hudRef) {
      Object.assign(hudRef, {
        speed: fm.state.velocity.length(),
        throttle: fm.state.throttle,
        boostEnergy: fm.state.boostEnergy,
        shield,
        hull: gameState.player.hull,
        flightMode: fm.state.mode,
        distanceToStar: shipPos.distanceTo(starPos),
        starName: universe.getCurrentSystem().name,
        fps: engine.getFps(),
        cargoUsed: gameState.cargoUsed,
        cargoMax: gameState.cargoMax,
        targetDist: (playerShip as any).targetDistance || 0,
      });
    }
    soundManager.updateEngine(fm.state.throttle, fm.boostActive);

    // ── Autosave (SP only) ──
    if (onAutosave) {
      const saveNow = Date.now();
      if (saveNow - lastSave >= 10000) {
        lastSave = saveNow;
        onAutosave();
      }
    }

    // ── Orientation vectors (pooled) ──
    const bFwd = pool.get(0, 0, 1).applyQuaternion(fm.state.orientation);
    const bRgt = pool.get(1, 0, 0).applyQuaternion(fm.state.orientation);
    const bUp = pool.get(0, 1, 0).applyQuaternion(fm.state.orientation);

    const entities = getEntities();

    // ── Radar blips (close range) ──
    const blipRange = source === 'sp' ? 80000 : 500;
    const blips: Array<{ x: number; y: number; height: number; health: number; type: 'enemy' | 'station' | 'player' }> = [];
    for (const e of entities) {
      if (e.type === 'star' || e.type === 'planet' || e.type === 'orbit') continue;
      const wpos = pool.get(e.px, e.py, e.pz);
      const rel = pool.get().copy(wpos).sub(shipPos);
      const dist = rel.length();
      if (dist > blipRange || dist < 1) continue;
      blips.push({
        x: Math.max(-1, Math.min(1, rel.dot(bRgt) / Math.max(dist, 0.01) * Math.min(dist / blipRange, 1.0))),
        y: Math.max(-1, Math.min(1, rel.dot(bFwd) / Math.max(dist, 0.01) * Math.min(dist / blipRange, 1.0))),
        height: Math.max(-1, Math.min(1, rel.dot(bUp) / Math.max(dist, 0.01) * Math.min(dist / blipRange, 1.0))),
        health: e.health / 100,
        type: e.isPlayer ? 'player' : 'enemy',
      });
    }
    // Station blip
    const blipSt = engine.getSceneManager().getStation();
    if (blipSt) {
      const rel = pool.get().copy(blipSt.position).sub(shipPos);
      const dist = rel.length();
      if (dist < blipRange) {
        blips.push({
          x: Math.max(-1, Math.min(1, rel.dot(bRgt) / Math.max(dist, 0.01) * Math.min(dist / blipRange, 1.0))),
          y: Math.max(-1, Math.min(1, rel.dot(bFwd) / Math.max(dist, 0.01) * Math.min(dist / blipRange, 1.0))),
          height: Math.max(-1, Math.min(1, rel.dot(bUp) / Math.max(dist, 0.01) * Math.min(dist / blipRange, 1.0))),
          health: 1,
          type: 'station',
        });
      }
    }
    (window as any).__kosmRadarBlips = blips;

    // ── Navigator blips (wide range, mirrored left-right) ──
    const navRange = 200000;
    const navBlips: any[] = [];

    // Star system objects — X negated for left-right mirror
    try {
      const starSys = engine.getSceneManager().getStarSystem();
      if (starSys) {
        const starPos = starSys.getStarPosition();
        const starRel = pool.get(starPos.x, starPos.y, starPos.z).sub(shipPos);
        navBlips.push({ x: -starRel.dot(bRgt) / navRange, y: starRel.dot(bFwd) / navRange, height: starRel.dot(bUp) / navRange, health: 1, type: 'star', r: starSys.getRadius() });
        for (const p of starSys.getPlanets()) {
          const ppos = p.getPosition();
          const prel = pool.get().copy(ppos).sub(shipPos);
          const pdist = prel.length();
          if (pdist < navRange) {
            const orbitR = p.getOrbitRadius();
            navBlips.push({ x: -prel.dot(bRgt) / navRange, y: prel.dot(bFwd) / navRange, height: prel.dot(bUp) / navRange, health: 1, type: 'planet', r: orbitR * 0.05 });
            if (orbitR > 1000) {
              const orbitRel = pool.get(starPos.x, starPos.y, starPos.z).sub(shipPos);
              navBlips.push({ x: -orbitRel.dot(bRgt) / navRange, y: orbitRel.dot(bFwd) / navRange, height: 0, health: 0, type: 'orbit', r: orbitR });
            }
          }
        }
      }
    } catch (_) { /* ignore */ }

    for (const e of entities) {
      if (e.type === 'star' || e.type === 'planet' || e.type === 'orbit') continue;
      const wpos = pool.get(e.px, e.py, e.pz);
      const rel = pool.get().copy(wpos).sub(shipPos);
      const dist = rel.length();
      if (dist > navRange) continue;
      navBlips.push({
        x: Math.max(-1, Math.min(1, -rel.dot(bRgt) / navRange)),
        y: Math.max(-1, Math.min(1, rel.dot(bFwd) / navRange)),
        height: Math.max(-1, Math.min(1, rel.dot(bUp) / navRange)),
        health: 1,
        type: e.isPlayer ? 'player' : 'enemy',
      });
    }
    (window as any).__kosmNavBlips = navBlips;

    // ── Ship yaw/pitch for map ──
    const fwd = fm.getForward();
    const r = pool.get(1, 0, 0).applyQuaternion(fm.state.orientation);
    if (hudRef) {
      Object.assign(hudRef, {
        _shipYaw: Math.atan2(r.z, -r.x),
        _shipPitch: Math.asin(Math.max(-1, Math.min(1, fwd.y))),
        _shipX: shipPos.x, _shipY: shipPos.y, _shipZ: shipPos.z,
      });
    }

    // ── Auto-aim target marker (SP only) ──
    if (getLockedTarget) {
      try {
        const target = getLockedTarget();
        const targets: Array<{ screenX: number; screenY: number; distance: number; type: string; health?: number }> = [];
        if (target) {
          const v = pool.get().copy(target.pos).project(engine.getCamera());
          if (v.z < 1) {
            const mc = document.getElementById('game-canvas');
            const cw = mc?.clientWidth || window.innerWidth;
            const ch = mc?.clientHeight || window.innerHeight;
            targets.push({
              screenX: (v.x * 0.5 + 0.5) * cw,
              screenY: (-v.y * 0.5 + 0.5) * ch,
              distance: target.distance,
              type: 'target',
              health: 1,
            });
          }
        }
        (window as any).__kosmTargets = targets;
      } catch (_) { (window as any).__kosmTargets = []; }
    }

    // ── Map data every 500ms ──
    if (Math.floor(Date.now() / 500) !== Math.floor((Date.now() - 100) / 500)) {
      const mapObjects: any[] = [{ x: 0, z: 0, r: 6, color: '#fa4', label: 'Star' }];
      const ss = engine.getSceneManager().getStarSystem();
      if (ss) {
        for (const p of ss.getPlanets()) {
          const pos = p.getPosition();
          mapObjects.push({ x: pos.x, z: pos.z, r: 3, color: '#6af', label: 'P' });
        }
      }
      const mst = engine.getSceneManager().getStation();
      if (mst) mapObjects.push({ x: mst.position.x, z: mst.position.z, r: 4, color: '#4f4', label: 'Station' });
      for (const e of entities) {
        if (e.type === 'star' || e.type === 'planet' || e.type === 'orbit') continue;
        mapObjects.push({
          x: e.px, z: e.pz, y: e.py,
          r: 2,
          color: e.isPlayer ? '#48f' : '#f44',
        });
      }
      mapObjects.push({
        x: shipPos.x, z: shipPos.z, r: 3, color: '#fff',
        isPlayer: true,
        angle: Math.atan2(fwd.x, fwd.z),
      });
      gameState.setMapData({ objects: mapObjects, range: source === 'sp' ? 150000 : 200000 });
    }

    // Release all borrowed vectors back to pool
    pool.releaseAll();

    hudSyncRef = requestAnimationFrame(sync);
  };

  hudSyncRef = requestAnimationFrame(sync);

  return () => {
    destroyed = true;
    cancelAnimationFrame(hudSyncRef);
  };
}
