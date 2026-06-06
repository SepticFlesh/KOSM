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
  private aiPersonality: 'aggressive' | 'balanced' | 'cautious' = 'balanced';
  private dodgeTimer = 0;
  private dodgeDir = 0;

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
    const personalities: Array<'aggressive' | 'balanced' | 'cautious'> = ['aggressive', 'balanced', 'cautious'];
    this.aiPersonality = personalities[Math.floor(Math.random() * 3)];
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

  /** Shoot a laser bolt towards target with lead prediction */
  shootAt(target: THREE.Vector3, targetVel?: THREE.Vector3): void {
    if (this.fireCooldown > 0) return;
    this.fireCooldown = this.fireRate;

    let aimPoint = target.clone();
    // Simple lead: predict where target will be
    if (targetVel) {
      const dist = this.flightModel.state.position.distanceTo(target);
      const travelTime = dist / 250; // bolt speed
      aimPoint.add(targetVel.clone().multiplyScalar(travelTime * 0.7));
    }

    const pos = this.flightModel.state.position.clone();
    const dir = aimPoint.clone().sub(pos).normalize();
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

  private lastPlayerPos = new THREE.Vector3();
  private playerVelocity = new THREE.Vector3();

  update(dt: number, playerPos: THREE.Vector3): void {
    this.playerVelocity.copy(playerPos).sub(this.lastPlayerPos).divideScalar(Math.max(dt, 0.001));
    this.lastPlayerPos.copy(playerPos);
    const myPos = this.flightModel.state.position;
    const dist = myPos.distanceTo(playerPos);
    const toPlayer = playerPos.clone().sub(myPos).normalize();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.flightModel.state.orientation);
    const dot = forward.dot(toPlayer);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.flightModel.state.orientation);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.flightModel.state.orientation);

    const atkRng = this.aiPersonality === 'aggressive' ? 350 : this.aiPersonality === 'cautious' ? 120 : 200;
    const chsRng = this.aiPersonality === 'aggressive' ? 2500 : this.aiPersonality === 'cautious' ? 1000 : 1500;

    this.aiTimer -= dt;
    if (dist < atkRng) this.aiState = 'attack';
    else if (dist < chsRng) this.aiState = 'chase';
    else if (this.aiTimer <= 0) {
      this.aiState = 'patrol';
      this.aiTimer = 4 + Math.random() * 6;
      this.patrolTarget.set(
        myPos.x + (Math.random() - 0.5) * 3000,
        myPos.y + (Math.random() - 0.5) * 1000,
        myPos.z + (Math.random() - 0.5) * 3000);
    }

    this.dodgeTimer -= dt;
    if (this.health < 60 && this.dodgeTimer <= 0 && this.aiState === 'attack') {
      this.dodgeTimer = 0.8 + Math.random() * 1.5;
      this.dodgeDir = (Math.random() > 0.5 ? 1 : -1);
    }

    if (this.aiState === 'patrol') {
      this.flightModel.setThrottle(0.2);
      this.steerToward(this.patrolTarget.clone().sub(myPos).normalize(), up, right, 2.0);
    } else if (this.aiState === 'chase') {
      this.flightModel.setThrottle(this.aiPersonality === 'aggressive' ? 0.8 : 0.5);
      this.steerToward(toPlayer, up, right, 3.0);
    } else if (this.aiState === 'attack') {
      this.flightModel.setThrottle(this.aiPersonality === 'cautious' ? 0.4 : 0.5);
      let aim = toPlayer.clone();
      if (this.dodgeTimer > 0) aim.add(right.clone().multiplyScalar(this.dodgeDir * 0.5)).normalize();
      this.steerToward(aim, up, right, 4.0);
      if (dot > 0.5) this.shootAt(playerPos, this.playerVelocity);
    }

    if (this.aiPersonality === 'cautious' && dist < 80) {
      this.flightModel.setThrottle(0.7);
      this.steerToward(toPlayer.clone().multiplyScalar(-1), up, right, 3.0);
    }

    if (this.health < 30 && this.aiState === 'attack') {
      this.flightModel.setThrottle(1.0);
      const evade = toPlayer.clone().multiplyScalar(-1);
      evade.x += (Math.random() - 0.5) * 2; evade.y += (Math.random() - 0.5) * 2;
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
