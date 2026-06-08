import * as THREE from 'three';
import { StarSystem } from '../world/StarSystem';
import { ShipController } from '../gameplay/ShipController';
import { EnemyShip } from '../gameplay/EnemyShip';
import { ExplosionEffect } from '../gameplay/ExplosionEffect';
import { SpaceStation } from '../world/SpaceStation';
import { resolveDamage } from '../gameplay/WeaponSystem';
import { MiningSystem } from '../gameplay/MiningSystem';
import { gameState } from '../ui/store/gameStore';
import { NebulaSystem } from '../rendering/NebulaSystem';
import { WarpEffect } from '../rendering/WarpEffect';

// ── Spatial hash for O(1) hit detection ─────────────────────────────

const HASH_CELL_SIZE = 10; // 10-unit grid cells

class SpatialHash<T extends { position: THREE.Vector3 }> {
  private cells = new Map<number, T[]>();

  clear(): void {
    this.cells.clear();
  }

  private key(x: number, y: number, z: number): number {
    const ix = Math.floor(x / HASH_CELL_SIZE);
    const iy = Math.floor(y / HASH_CELL_SIZE);
    const iz = Math.floor(z / HASH_CELL_SIZE);
    // Simple hash combining 3 ints
    return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) >>> 0;
  }

  insert(item: T): void {
    const k = this.key(item.position.x, item.position.y, item.position.z);
    let bucket = this.cells.get(k);
    if (!bucket) { bucket = []; this.cells.set(k, bucket); }
    bucket.push(item);
  }

  /** Find all items within `radius` of `pos` */
  query(pos: THREE.Vector3, radius: number): T[] {
    const results: T[] = [];
    const r = HASH_CELL_SIZE;
    const minX = Math.floor((pos.x - radius) / r);
    const maxX = Math.floor((pos.x + radius) / r);
    const minY = Math.floor((pos.y - radius) / r);
    const maxY = Math.floor((pos.y + radius) / r);
    const minZ = Math.floor((pos.z - radius) / r);
    const maxZ = Math.floor((pos.z + radius) / r);

    for (let ix = minX; ix <= maxX; ix++) {
      for (let iy = minY; iy <= maxY; iy++) {
        for (let iz = minZ; iz <= maxZ; iz++) {
          const k = ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) >>> 0;
          const bucket = this.cells.get(k);
          if (bucket) {
            for (const item of bucket) {
              if (item.position.distanceToSquared(pos) <= radius * radius) {
                results.push(item);
              }
            }
          }
        }
      }
    }
    return results;
  }
}

/**
 * Scene manager — all game objects, lifecycle.
 */
export type GameMode = 'single-player' | 'multiplayer';

export class SceneManager {
  private scene: THREE.Scene;
  private updatables: Array<{ update: (dt: number, elapsed: number) => void }> = [];

  private starSystem: StarSystem | null = null;
  private playerShip: ShipController | null = null;
  public enemies: EnemyShip[] = [];
  private explosions: ExplosionEffect[] = [];
  private station: SpaceStation | null = null;
  public mining: MiningSystem | null = null;
  private nebulaSystem: NebulaSystem | null = null;
  private warpEffect: WarpEffect | null = null;
  public isWarping = false;
  public mode: GameMode = 'single-player';

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  createStarSystem(seed: number = 42): StarSystem {
    this.starSystem = new StarSystem(this.scene, seed);
    this.starSystem.generate();
    this.updatables.push(this.starSystem);
    // Generate nebulas for this system
    if (!this.nebulaSystem) this.nebulaSystem = new NebulaSystem(this.scene);
    this.nebulaSystem.generate(seed);
    return this.starSystem;
  }

  createPlayerShip(camera: THREE.Camera): ShipController {
    this.playerShip = new ShipController(this.scene, camera);
    this.updatables.push(this.playerShip);
    return this.playerShip;
  }

  spawnAsteroids(count: number = 12): void {
    if (!this.mining) this.mining = new MiningSystem(this.scene);
    this.mining.spawn(count, new THREE.Vector3(0, 0, 0), 300000);
  }

  createStation(pos: THREE.Vector3): SpaceStation {
    this.station = new SpaceStation(this.scene, pos);
    return this.station;
  }

  /** Spawn enemies in the system */
  spawnEnemies(count: number = 3): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dist = 50000 + Math.random() * 150000;
      const pos = new THREE.Vector3(
        Math.cos(angle) * dist,
        (Math.random() - 0.5) * 200,
        Math.sin(angle) * dist
      );
      const enemy = new EnemyShip(this.scene, pos);
      // Share particle texture from player weapon system
      if (this.playerShip) {
        enemy.setParticleTexture(
          (this.playerShip.weaponSystem as any).particleTex
        );
      }
      this.enemies.push(enemy);
    }
    console.log(`[SceneManager] Spawned ${count} enemies`);
  }

  /** Main update */
  update(dt: number, elapsedTime: number): void {
    for (const obj of this.updatables) {
      obj.update(dt, elapsedTime);
    }
    // Update enemies (SP: local AI; MP: positions from server, AI skipped)
    if (this.mode === 'single-player' && this.playerShip) {
      const playerPos = this.playerShip.flightModel.state.position;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        e.update(dt, playerPos);
        if (e.isDead()) {
          const tex = this.playerShip?.weaponSystem.particleTex;
          const epos = new THREE.Vector3(
            e.flightModel.state.position.x,
            e.flightModel.state.position.y,
            e.flightModel.state.position.z
          );
          if (tex) {
            e.mesh.visible = false;
            this.explosions.push(new ExplosionEffect(this.scene, epos, tex, 6.0));
            setTimeout(() => { e.dispose(); }, 1500);
          } else {
            e.dispose();
          }
          this.enemies.splice(i, 1);
        }
      }
    }
    // Update station
    if (this.station) this.station.update(dt);
    // Update mining
    if (this.mining) this.mining.update(dt);

    // Update explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].update(dt);
      if (this.explosions[i].dead) {
        this.explosions.splice(i, 1);
      }
    }

    // Update warp effect
    if (this.warpEffect) {
      if (this.playerShip) this.playerShip.updateMeshOnly(dt);
      this.warpEffect.setAtCamera();
      this.warpEffect.update(dt);
      return;
    }

    // Hit detection — SP only (MP is server-authoritative)
    if (this.mode === 'single-player') {
      this.checkHits();
      this.checkPlayerDamage();
    }
  }

  public checkHits(): void {
    if (!this.playerShip || this.enemies.length === 0) return;
    const weapon = this.playerShip.weaponSystem;
    const { bolts } = weapon;
    if (!bolts || bolts.length === 0) return;

    // Build spatial hash of enemy positions
    interface EnemyRef { enemy: EnemyShip; position: THREE.Vector3 }
    const hash = new SpatialHash<EnemyRef>();
    for (const enemy of this.enemies) {
      hash.insert({ enemy, position: enemy.flightModel.state.position });
    }

    for (let bi = bolts.length - 1; bi >= 0; bi--) {
      const bolt = bolts[bi];
      const nearby = hash.query(bolt.position, 2.5);
      for (const ref of nearby) {
        ref.enemy.takeDamage(resolveDamage());
        gameState.lastHitTime = Date.now();
        (window as any).__kosmLastHit = Date.now();
        // Remove bolt
        const b = bolts[bi];
        this.scene.remove(b.head); this.scene.remove(b.trail); this.scene.remove(b.light);
        (b.head.material as THREE.Material).dispose(); (b.trail.material as THREE.Material).dispose();
        b.head.geometry.dispose(); b.trail.geometry.dispose();
        bolts.splice(bi, 1);
        break;
      }
    }
  }

  getStarSystem(): StarSystem | null { return this.starSystem; }
  getPlayerShip(): ShipController | null { return this.playerShip; }
  getEnemies(): EnemyShip[] { return this.enemies; }
  getStation(): SpaceStation | null { return this.station; }
  addExplosion(effect: ExplosionEffect): void { this.explosions.push(effect); }

  private checkPlayerDamage(): void {
    if (!this.playerShip) return;
    const playerPos = this.playerShip.flightModel.state.position;
    const BOLT_HIT_RADIUS = 1.5;

    // Collect all enemy bolts with their owner
    interface BoltRef { bolt: EnemyShip['enemyBolts'][0]; enemy: EnemyShip }
    const hash = new SpatialHash<BoltRef & { position: THREE.Vector3 }>();
    for (const enemy of this.enemies) {
      for (const bolt of enemy.enemyBolts) {
        hash.insert({ bolt, enemy, position: bolt.position } as any);
      }
    }

    const nearby = hash.query(playerPos, BOLT_HIT_RADIUS);
    for (const { bolt, enemy } of nearby) {
      // Remove bolt
      this.scene.remove(bolt.head); this.scene.remove(bolt.trail); this.scene.remove(bolt.light);
      (bolt.head.material as THREE.Material).dispose(); (bolt.trail.material as THREE.Material).dispose();
      bolt.head.geometry.dispose(); bolt.trail.geometry.dispose();
      const idx = enemy.enemyBolts.indexOf(bolt);
      if (idx >= 0) enemy.enemyBolts.splice(idx, 1);

      // Apply damage to player
      const p = gameState.player;
      let dmg = 10;
      if (p.shield > 0) {
        const shieldDmg = Math.min(p.shield, dmg);
        gameState.updatePlayer({ shield: p.shield - shieldDmg });
        dmg -= shieldDmg;
      }
      if (dmg > 0) {
        gameState.updatePlayer({ hull: Math.max(0, p.hull - dmg) });
      }
      gameState.lastDamageTime = Date.now();
      (window as any).__kosmLastDmg = Date.now();
      this.playerShip?.addShake(0.5);
    }
  }

  mineAsteroid(playerPos: THREE.Vector3, dt: number): { destroyed: boolean; ore?: number; type?: string } {
    if (!this.mining) return { destroyed: false };
    const a = this.mining.findNearest(playerPos, 200);
    if (!a) return { destroyed: false };
    a.health -= 30 * dt;
    (a.mesh.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x440000);
    (a.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1;
    if (a.health <= 0) {
      const ore = a.oreAmount;
      const type = a.oreType;
      this.scene.remove(a.mesh);
      a.mesh.geometry.dispose();
      (a.mesh.material as THREE.Material).dispose();
      this.mining.asteroids = this.mining.asteroids.filter(x => x !== a);
      return { destroyed: true, ore, type };
    }
    return { destroyed: false };
  }

  /** Switch system, place ship far away, fly in during warp */
  startWarp(targetSeed: number, playerShip: ShipController): void {
    if (this.warpEffect || this.isWarping) return;
    this.isWarping = true;
    playerShip.flightModel.setThrottle(0);
    // Switch immediately
    this.switchSystem(targetSeed, playerShip);
    // Place ship 200000 units further out
    const pos = playerShip.flightModel.state.position;
    const targetPos = pos.clone();
    pos.z += 200000;
    playerShip.flightModel.reset(pos);
    const startPos = pos.clone();
    const warpDuration = 5.0;
    // Play warp effect (camera-attached)
    const warpCam = this.playerShip?.camera;
    this.warpEffect = new WarpEffect(this.scene, warpCam || new THREE.PerspectiveCamera(), warpDuration, () => {
      this.warpEffect = null;
      this.isWarping = false;
      playerShip.resetWarpGlow();
    });
    this.warpEffect.setAtCamera();
    // Fly-in animation
    let warpAge = 0;
    const flyIn = (dt: number) => {
      warpAge += dt;
      const t = Math.min(1, warpAge / warpDuration);
      const eased = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      const newPos = new THREE.Vector3().lerpVectors(startPos, targetPos, eased);
      playerShip.flightModel.state.position.copy(newPos);
    };
    const origUpd = this.warpEffect.update.bind(this.warpEffect);
    this.warpEffect.update = function(dt: number) {
      flyIn(dt);
      origUpd(dt);
    };
  }

  /** Jump to a new system — destroy old, create new */
  switchSystem(seed: number, playerShip: ShipController): void {
    // Clear old system
    if (this.starSystem) {
      this.starSystem.dispose();
      this.updatables = this.updatables.filter(u => u !== this.starSystem);
    }
    // Clear enemies
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    // Clear explosions
    for (const ex of this.explosions) ex.dead = true;
    this.explosions.length = 0;
    // Clear station
    if (this.station) { this.station.dispose(); this.station = null; }
    // Clear mining
    if (this.mining) { this.mining.dispose(); this.mining = null; }

    // Create new system
    this.createStarSystem(seed);
    this.createStation(new THREE.Vector3(200, 50, -100));
    this.spawnEnemies(4);
    this.spawnAsteroids(15);

    // Reset player position
    playerShip.flightModel.reset(new THREE.Vector3(600, 250, -800));
  }
}
