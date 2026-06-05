import * as THREE from 'three';
import { StarSystem } from '../world/StarSystem';
import { ShipController } from '../gameplay/ShipController';
import { EnemyShip } from '../gameplay/EnemyShip';
import { ExplosionEffect } from '../gameplay/ExplosionEffect';
import { SpaceStation } from '../world/SpaceStation';
import { getLaserDamage } from '../gameplay/WeaponSystem';
import { MiningSystem } from '../gameplay/MiningSystem';
import { gameState } from '../ui/store/gameStore';
import { NebulaSystem } from '../rendering/NebulaSystem';

/**
 * Scene manager — all game objects, lifecycle.
 */
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
    this.mining.spawn(count, new THREE.Vector3(0, 0, 0), 800);
  }

  createStation(pos: THREE.Vector3): SpaceStation {
    this.station = new SpaceStation(this.scene, pos);
    return this.station;
  }

  /** Spawn enemies in the system */
  spawnEnemies(count: number = 3): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dist = 80 + Math.random() * 120;
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
    // Update enemies
    if (this.playerShip) {
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

    // Check player → enemy hits
    this.checkHits();
    // Check enemy → player hits
    this.checkPlayerDamage();
  }

  public checkHits(): void {
    if (!this.playerShip || this.enemies.length === 0) return;
    const weapon = this.playerShip.weaponSystem;
    const { bolts } = weapon;
    if (!bolts || bolts.length === 0) return;

    for (let bi = bolts.length - 1; bi >= 0; bi--) {
      const bolt = bolts[bi];
      for (let ei = 0; ei < this.enemies.length; ei++) {
        const enemy = this.enemies[ei];
        const dist = bolt.position.distanceTo(enemy.flightModel.state.position);
        if (dist < 2.5) {
          enemy.takeDamage(getLaserDamage());
          gameState.lastHitTime = Date.now();
          // Remove bolt
          const b = bolts[bi];
          this.scene.remove(b.head); this.scene.remove(b.trail); this.scene.remove(b.light);
          b.head.material.dispose(); b.trail.material.dispose();
          b.head.geometry.dispose(); b.trail.geometry.dispose();
          bolts.splice(bi, 1);
          break;
        }
      }
    }
  }

  getStarSystem(): StarSystem | null { return this.starSystem; }
  getPlayerShip(): ShipController | null { return this.playerShip; }
  getEnemies(): EnemyShip[] { return this.enemies; }
  getStation(): SpaceStation | null { return this.station; }

  private checkPlayerDamage(): void {
    if (!this.playerShip) return;
    const playerPos = this.playerShip.flightModel.state.position;
    for (const enemy of this.enemies) {
      for (let bi = enemy.enemyBolts.length - 1; bi >= 0; bi--) {
        const bolt = enemy.enemyBolts[bi];
        const dist = bolt.position.distanceTo(playerPos);
        if (dist < 1.5) {
          // Remove bolt
          this.scene.remove(bolt.head); this.scene.remove(bolt.trail); this.scene.remove(bolt.light);
          bolt.head.material.dispose(); bolt.trail.material.dispose();
          bolt.head.geometry.dispose(); bolt.trail.geometry.dispose();
          enemy.enemyBolts.splice(bi, 1);
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
          this.playerShip?.addShake(0.5);
        }
      }
    }
  }

  mineAsteroid(playerPos: THREE.Vector3, dt: number): { destroyed: boolean; ore?: number; type?: string } {
    if (!this.mining) return { destroyed: false };
    const a = this.mining.findNearest(playerPos, 80);
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
    playerShip.flightModel.reset(new THREE.Vector3(0, 100, 300));
  }
}
