import * as THREE from 'three';
import { soundManager } from '../audio/SoundManager';
import { gameState } from '../ui/store/gameStore';

/** Get current laser damage from upgrade level (SP default) */
export function getLaserDamage(): number {
  const lvl = gameState.getUpgradeLevel('laser_damage');
  return [25, 35, 50, 75][lvl - 1] || 25;
}

/** Injectable damage resolver — for MP, server provides damage value */
let damageResolver: (() => number) | null = null;

export function setDamageResolver(fn: (() => number) | null): void {
  damageResolver = fn;
}

export function resolveDamage(): number {
  return damageResolver ? damageResolver() : getLaserDamage();
}

interface LaserBolt {
  head: THREE.Points;
  trail: THREE.Points;
  light: THREE.PointLight;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  trailData: Array<{ offset: number; life: number }>;
}

/**
 * Laser bolts with particle effects - head + trail + glow.
 */
export class WeaponSystem {
  private scene: THREE.Scene;
  public bolts: LaserBolt[] = [];
  private cooldown = 0;
  private fireRate = 0.15;
  private gunToggle = false;
  private gunPositions = [
    new THREE.Vector3(0.55, 0, 0.4),
    new THREE.Vector3(-0.55, 0, 0.4),
  ];
  public particleTex: THREE.Texture;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const s = 32;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.15, 'rgba(255,100,30,0.9)');
    g.addColorStop(0.5, 'rgba(255,30,0,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    this.particleTex = new THREE.CanvasTexture(c);
  }

  fire(shipPos: THREE.Vector3, shipQuat: THREE.Quaternion): void {
    if (this.cooldown > 0) return;
    this.cooldown = this.fireRate;
    soundManager.playLaser();

    const local = this.gunPositions[this.gunToggle ? 0 : 1];
    this.gunToggle = !this.gunToggle;
    const world = local.clone().applyQuaternion(shipQuat).add(shipPos);
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(shipQuat).normalize();
    this.spawn(world, dir);
  }

  private spawn(pos: THREE.Vector3, dir: THREE.Vector3): void {
    const N = 16;

    // Head
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0,0,0]), 3));
    const hm = new THREE.PointsMaterial({
      size: 0.6, map: this.particleTex, blending: THREE.AdditiveBlending,
      depthWrite: false, color: 0xffffff, transparent: true, opacity: 1,
    });
    const head = new THREE.Points(hg, hm);
    head.position.copy(pos);
    this.scene.add(head);

    // Trail
    const tg = new THREE.BufferGeometry();
    const tpArr = new Float32Array(N * 3);
    const tcArr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      tpArr[i*3]=pos.x; tpArr[i*3+1]=pos.y; tpArr[i*3+2]=pos.z;
      tcArr[i*3]=1; tcArr[i*3+1]=0.3; tcArr[i*3+2]=0.05;
    }
    tg.setAttribute('position', new THREE.BufferAttribute(tpArr, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(tcArr, 3));
    const tm = new THREE.PointsMaterial({
      size: 0.4, map: this.particleTex, blending: THREE.AdditiveBlending,
      depthWrite: false, vertexColors: true, transparent: true, opacity: 1,
    });
    const trail = new THREE.Points(tg, tm);
    trail.position.copy(pos);
    this.scene.add(trail);

    // Light
    const light = new THREE.PointLight(0xff4400, 5, 8);
    light.position.copy(pos);
    this.scene.add(light);

    // Trail data
    const td: Array<{ offset: number; life: number }> = [];
    for (let i = 0; i < N; i++) {
      td.push({ offset: (i+1)*0.4, life: (1 - i/N)*0.6 });
    }

    this.bolts.push({ head, trail, light, position: pos.clone(), velocity: dir.clone().multiplyScalar(1000), life: 1.2, maxLife: 1.2, trailData: td });
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.head); this.scene.remove(b.trail); this.scene.remove(b.light);
        (b.head.material as THREE.Material).dispose(); (b.trail.material as THREE.Material).dispose();
        b.head.geometry.dispose(); b.trail.geometry.dispose();
        this.bolts.splice(i, 1);
        continue;
      }

      b.position.add(b.velocity.clone().multiplyScalar(dt));
      b.head.position.copy(b.position);
      b.light.position.copy(b.position);

      const r = b.life / b.maxLife;
      (b.head.material as THREE.PointsMaterial).opacity = r;
      b.light.intensity = 5 * r;

      const posArr = b.trail.geometry.attributes.position.array as Float32Array;
      const colArr = b.trail.geometry.attributes.color.array as Float32Array;
      const back = b.velocity.clone().normalize().multiplyScalar(-1);
      for (let j = 0; j < b.trailData.length; j++) {
        const td = b.trailData[j];
        td.life -= dt * 3;
        if (td.life < 0) td.life = 0;
        const wp = b.position.clone().add(back.clone().multiplyScalar(td.offset));
        posArr[j*3]=wp.x; posArr[j*3+1]=wp.y; posArr[j*3+2]=wp.z;
        const a = Math.max(0, td.life / 0.6);
        colArr[j*3]=a; colArr[j*3+1]=a*0.3; colArr[j*3+2]=a*0.05;
      }
      b.trail.geometry.attributes.position.needsUpdate = true;
      b.trail.geometry.attributes.color.needsUpdate = true;
    }
  }

  clearAll(): void {
    for (const b of this.bolts) {
      this.scene.remove(b.head); this.scene.remove(b.trail); this.scene.remove(b.light);
      (b.head.material as THREE.Material).dispose(); (b.trail.material as THREE.Material).dispose();
      b.head.geometry.dispose(); b.trail.geometry.dispose();
    }
    this.bolts.length = 0;
  }
}
