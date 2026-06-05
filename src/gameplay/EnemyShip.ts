import * as THREE from 'three';
import { FlightModel, FlightMode, DEFAULT_SHIP_CONFIG } from './FlightModel';

/**
 * Вражеский корабль — пират.
 * Упрощённая модель, свой FlightModel, AI-пилот.
 */
export class EnemyShip {
  public flightModel: FlightModel;
  public mesh: THREE.Group;
  public health = 100;
  public maxHealth = 100;

  // AI state
  public aiState: 'patrol' | 'chase' | 'attack' | 'evade' = 'patrol';
  public aiTimer = 0;
  public patrolTarget = new THREE.Vector3();

  // Weapon
  private fireCooldown = 0;
  private fireRate = 0.5;

  // Scene ref for effects
  private scene: THREE.Scene;

  // Laser bolts from enemy
  public enemyBolts: Array<{
    head: THREE.Points;
    trail: THREE.Points;
    light: THREE.PointLight;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
  }> = [];

  // Shared texture (set externally)
  private particleTex: THREE.Texture | null = null;

  constructor(scene: THREE.Scene, position: THREE.Vector3) {
    this.scene = scene;
    this.flightModel = new FlightModel({
      thrust: 250,
      rotationalSpeed: 5.0,
      maxSpeedAssist: 250,
    });
    this.flightModel.state.mode = FlightMode.FlightAssist;
    this.flightModel.state.position.copy(position);
    this.flightModel.setThrottle(0.3);

    this.mesh = this.createMesh();
    this.scene.add(this.mesh);

    this.patrolTarget.set(
      (Math.random() - 0.5) * 1000,
      (Math.random() - 0.5) * 400,
      (Math.random() - 0.5) * 1000
    );
  }

  private createMesh(): THREE.Group {
    const g = new THREE.Group();
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x551111, roughness: 0.5, metalness: 0.6,
    });
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xaa2222, roughness: 0.3, metalness: 0.4, emissive: 0x330000, emissiveIntensity: 0.3,
    });

    // Simple body - tapered cylinder
    const bodyGeo = new THREE.CylinderGeometry(0.15, 0.25, 2.0, 8);
    const body = new THREE.Mesh(bodyGeo, darkMat);
    body.rotation.x = Math.PI / 2;
    g.add(body);

    // Wings
    const wingGeo = new THREE.BoxGeometry(2.0, 0.05, 0.5);
    const wings = new THREE.Mesh(wingGeo, redMat);
    wings.position.z = -0.3;
    g.add(wings);

    // Nose
    const noseGeo = new THREE.ConeGeometry(0.15, 0.6, 8);
    const nose = new THREE.Mesh(noseGeo, darkMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 1.2;
    g.add(nose);

    return g;
  }

  setParticleTexture(tex: THREE.Texture): void {
    this.particleTex = tex;
  }

  /** Shoot a laser bolt towards target */
  shootAt(target: THREE.Vector3): void {
    if (this.fireCooldown > 0) return;
    this.fireCooldown = this.fireRate;

    const pos = this.flightModel.state.position.clone();
    const dir = target.clone().sub(pos).normalize();
    const offset = new THREE.Vector3(0.3, 0, 0.5).applyQuaternion(this.flightModel.state.orientation);
    const spawnPos = pos.clone().add(offset);

    this.spawnBolt(spawnPos, dir);
  }

  private spawnBolt(pos: THREE.Vector3, dir: THREE.Vector3): void {
    if (!this.particleTex) return;
    const N = 8;
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0,0,0]), 3));
    const hm = new THREE.PointsMaterial({
      size: 0.35, map: this.particleTex, blending: THREE.AdditiveBlending,
      depthWrite: false, color: 0xff2222, transparent: true,
    });
    const head = new THREE.Points(hg, hm);
    head.position.copy(pos);
    this.scene.add(head);

    const tg = new THREE.BufferGeometry();
    const tp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { tp[i*3]=pos.x; tp[i*3+1]=pos.y; tp[i*3+2]=pos.z; }
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    const tm = new THREE.PointsMaterial({
      size: 0.25, map: this.particleTex, blending: THREE.AdditiveBlending,
      depthWrite: false, color: 0xff2222, transparent: true,
    });
    const trail = new THREE.Points(tg, tm);
    trail.position.copy(pos);
    this.scene.add(trail);

    const light = new THREE.PointLight(0xff2222, 3, 5);
    light.position.copy(pos);
    this.scene.add(light);

    this.enemyBolts.push({
      head, trail, light,
      position: pos.clone(),
      velocity: dir.clone().multiplyScalar(250),
      life: 1.0, maxLife: 1.0,
    });
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    const myPos = this.flightModel.state.position;
    const dist = myPos.distanceTo(playerPos);
    const toPlayer = playerPos.clone().sub(myPos).normalize();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.flightModel.state.orientation);
    const dot = forward.dot(toPlayer);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.flightModel.state.orientation);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.flightModel.state.orientation);

    // AI state
    this.aiTimer -= dt;
    if (dist < 60) {
      this.aiState = 'attack';
    } else if (dist < 250) {
      this.aiState = 'chase';
    } else if (this.aiTimer <= 0) {
      this.aiState = 'patrol';
      this.aiTimer = 4 + Math.random() * 6;
      this.patrolTarget.set(
        myPos.x + (Math.random() - 0.5) * 500,
        myPos.y + (Math.random() - 0.5) * 200,
        myPos.z + (Math.random() - 0.5) * 500
      );
    }

    // Movement
    if (this.aiState === 'patrol') {
      this.flightModel.setThrottle(0.2);
      // Steer toward patrol point
      const toPatrol = this.patrolTarget.clone().sub(myPos).normalize();
      this.steerToward(toPatrol, up, right, 2.0);
    } else if (this.aiState === 'chase') {
      this.flightModel.setThrottle(0.6);
      this.steerToward(toPlayer, up, right, 3.0);
    } else if (this.aiState === 'attack') {
      this.flightModel.setThrottle(0.5);
      this.steerToward(toPlayer, up, right, 4.0);
      // Shoot when facing player
      if (dot > 0.6) this.shootAt(playerPos);
    }

    // Evade if health low
    if (this.health < 40 && this.aiState === 'attack') {
      this.flightModel.setThrottle(0.8);
      // Steer slightly away from player
      const evade = toPlayer.clone().multiplyScalar(-1);
      evade.x += (Math.random() - 0.5) * 2;
      evade.y += (Math.random() - 0.5) * 2;
      evade.normalize();
      this.steerToward(evade, up, right, 3.0);
    }

    this.flightModel.simulate(dt);
    this.mesh.position.copy(this.flightModel.state.position);
    this.mesh.quaternion.copy(this.flightModel.state.orientation);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.updateBolts(dt);
  }

  private steerToward(target: THREE.Vector3, up: THREE.Vector3, right: THREE.Vector3, gain: number): void {
    const pitchErr = target.dot(up);
    const yawErr = target.dot(right);
    this.flightModel.setTorque(new THREE.Vector3(
      Math.max(-1, Math.min(1, pitchErr * gain)),
      Math.max(-1, Math.min(1, yawErr * gain)),
      0
    ));
  }

  private updateBolts(dt: number): void {
    for (let i = this.enemyBolts.length - 1; i >= 0; i--) {
      const b = this.enemyBolts[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.head); this.scene.remove(b.trail); this.scene.remove(b.light);
        b.head.material.dispose(); b.trail.material.dispose();
        b.head.geometry.dispose(); b.trail.geometry.dispose();
        this.enemyBolts.splice(i, 1);
        continue;
      }
      b.position.add(b.velocity.clone().multiplyScalar(dt));
      b.head.position.copy(b.position);
      b.light.position.copy(b.position);
      b.light.intensity = 3 * (b.life / b.maxLife);
      (b.head.material as THREE.PointsMaterial).opacity = b.life / b.maxLife;
    }
  }

  takeDamage(amount: number): void {
    this.health -= amount;
  }

  isDead(): boolean {
    return this.health <= 0;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    for (const b of this.enemyBolts) {
      this.scene.remove(b.head); this.scene.remove(b.trail); this.scene.remove(b.light);
    }
  }
}
