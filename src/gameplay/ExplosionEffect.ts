import * as THREE from 'three';
import { soundManager } from '../audio/SoundManager';

interface SparkSystem {
  points: THREE.Points;
  vels: THREE.Vector3[];
  lifes: number[];
  maxLife: number;
  count: number;
  implode?: boolean;        // expand then collapse
  startPositions?: Float32Array; // original positions for implosion calc
}

export class ExplosionEffect {
  private scene: THREE.Scene;
  private parts: THREE.Object3D[] = [];
  private sparkSystems: SparkSystem[] = [];
  private age = 0;
  private maxAge = 1.5;
  public dead = false;

  constructor(scene: THREE.Scene, pos: THREE.Vector3, _tex: THREE.Texture, scale: number = 1.0) {
    this.scene = scene;
    soundManager.playExplosion();

    // Flash
    const flash = new THREE.PointLight(0xff4400, 30 * scale, 50 * scale);
    flash.position.copy(pos);
    this.scene.add(flash);
    this.parts.push(flash);

    const tex = this.makeGlowTexture();

    // Layer 1: fast white-hot core sparks (small, fast, short life)
    this.sparkSystems.push(this.makeSparks(pos, tex, scale, {
      count: 60, size: 0.25, speed: 15, life: 0.5,
      r: 1, g: 0.9, b: 0.7,
    }));

    // Layer 2: orange fire particles (medium, explosive)
    this.sparkSystems.push(this.makeSparks(pos, tex, scale, {
      count: 80, size: 0.5, speed: 8, life: 0.9,
      r: 1, g: 0.4, b: 0.05,
    }));

    // Layer 3: red embers (large, slow, long life)
    this.sparkSystems.push(this.makeSparks(pos, tex, scale, {
      count: 50, size: 0.8, speed: 3, life: 1.4,
      r: 0.9, g: 0.15, b: 0.02,
    }));

    // Layer 4: yellow sparks (medium-fast, scattered)
    this.sparkSystems.push(this.makeSparks(pos, tex, scale, {
      count: 40, size: 0.35, speed: 11, life: 0.7,
      r: 1, g: 0.8, b: 0.1,
    }));

    // Layer 5: outer ring (flat disc, shockwave)
    this.sparkSystems.push(this.makeRingSparks(pos, tex, scale));

    // Layer 6: secondary burst
    this.sparkSystems.push(this.makeSparks(pos, tex, scale, {
      count: 30, size: 0.3, speed: 20, life: 0.35,
      r: 1, g: 1, b: 0.8,
    }));

    // Layer 7: expanding-then-collapsing cloud (implosion)
    const implodeSys = this.makeSparks(pos, tex, scale, {
      count: 120, size: 1.2, speed: 8, life: 1.3,
      r: 0.3, g: 0.6, b: 1.0, // bright blue
    });
    implodeSys.implode = true;
    implodeSys.startPositions = new Float32Array((implodeSys.points.geometry.attributes.position.array as Float32Array));
    this.sparkSystems.push(implodeSys);
  }

  private makeGlowTexture(): THREE.Texture {
    const s = 32;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
    g.addColorStop(0,'rgba(255,255,255,1)');
    g.addColorStop(0.15,'rgba(255,180,40,0.9)');
    g.addColorStop(0.5,'rgba(255,40,0,0.3)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,s,s);
    return new THREE.CanvasTexture(c);
  }

  private makeSparks(pos: THREE.Vector3, tex: THREE.Texture, scale: number, opts: {
    count: number; size: number; speed: number; life: number;
    r: number; g: number; b: number;
  }): SparkSystem {
    const N = opts.count;
    const pArr = new Float32Array(N * 3);
    const cArr = new Float32Array(N * 3);
    const vels: THREE.Vector3[] = [];
    const lifes: number[] = [];

    for (let i = 0; i < N; i++) {
      pArr[i*3]=pos.x; pArr[i*3+1]=pos.y; pArr[i*3+2]=pos.z;
      const th = Math.random()*Math.PI*2;
      const ph = Math.acos(2*Math.random()-1);
      const s = (0.3 + Math.random()*0.7) * opts.speed * scale;
      vels.push(new THREE.Vector3(
        Math.sin(ph)*Math.cos(th)*s,
        Math.sin(ph)*Math.sin(th)*s,
        Math.cos(ph)*s
      ));
      lifes.push(opts.life * (0.5 + Math.random()*0.5));
      cArr[i*3]=opts.r; cArr[i*3+1]=opts.g; cArr[i*3+2]=opts.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
    const mat = new THREE.PointsMaterial({
      size: opts.size * scale, map: tex,
      blending: THREE.AdditiveBlending, depthWrite: false,
      vertexColors: true, transparent: true,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.parts.push(pts);

    return { points: pts, vels, lifes, maxLife: opts.life, count: N };
  }

  private makeRingSparks(pos: THREE.Vector3, tex: THREE.Texture, scale: number): SparkSystem {
    const N = 48;
    const pArr = new Float32Array(N * 3);
    const cArr = new Float32Array(N * 3);
    const vels: THREE.Vector3[] = [];
    const lifes: number[] = [];

    for (let i = 0; i < N; i++) {
      pArr[i*3]=pos.x; pArr[i*3+1]=pos.y; pArr[i*3+2]=pos.z;
      const angle = (i/N)*Math.PI*2;
      const ringDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const s = (6 + Math.random()*8) * scale;
      vels.push(ringDir.clone().multiplyScalar(s));
      lifes.push(0.4 + Math.random()*0.4);
      cArr[i*3]=1; cArr[i*3+1]=0.7; cArr[i*3+2]=0.2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.2 * scale, map: tex,
      blending: THREE.AdditiveBlending, depthWrite: false,
      vertexColors: true, transparent: true,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.parts.push(pts);

    return { points: pts, vels, lifes, maxLife: 0.5, count: N };
  }

  update(dt: number): void {
    this.age += dt;
    if (this.age >= this.maxAge) {
      for (const p of this.parts) {
        this.scene.remove(p);
        if (p instanceof THREE.Points) { p.geometry.dispose(); (p.material as THREE.Material).dispose(); }
      }
      this.dead = true;
      return;
    }
    const t = this.age / this.maxAge;

    for (const p of this.parts) {
      if (p instanceof THREE.PointLight) {
        p.intensity = 30 * (1 - t) * (1 - t);
      }
    }

    // Update spark systems
    for (const sys of this.sparkSystems) {
      const posArr = sys.points.geometry.attributes.position.array as Float32Array;
      const colArr = sys.points.geometry.attributes.color.array as Float32Array;
      const isImploding = sys.implode === true;
      for (let i = 0; i < sys.count; i++) {
        sys.lifes[i] -= dt;
        if (sys.lifes[i] <= 0) { posArr[i*3+1] = -9999; continue; }

        if (isImploding) {
          const phase = 1 - sys.lifes[i] / sys.maxLife;
          if (phase < 0.3) {
            // Expand outward
            posArr[i*3] += sys.vels[i].x * dt;
            posArr[i*3+1] += sys.vels[i].y * dt;
            posArr[i*3+2] += sys.vels[i].z * dt;
          } else {
            // Collapse — резко к центру
            const dx = (sys.startPositions![i*3] - posArr[i*3]);
            const dy = (sys.startPositions![i*3+1] - posArr[i*3+1]);
            const dz = (sys.startPositions![i*3+2] - posArr[i*3+2]);
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            const collapseSpeed = 25 + phase * 40; // всё быстрее к концу
            if (dist > 0.3) {
              posArr[i*3] += (dx/dist) * collapseSpeed * dt;
              posArr[i*3+1] += (dy/dist) * collapseSpeed * dt;
              posArr[i*3+2] += (dz/dist) * collapseSpeed * dt;
            }
          }
        } else {
          posArr[i*3] += sys.vels[i].x * dt;
          posArr[i*3+1] += sys.vels[i].y * dt;
          posArr[i*3+2] += sys.vels[i].z * dt;
        }

        const lt = Math.max(0, sys.lifes[i] / sys.maxLife);
        colArr[i*3] *= 0.995;
        colArr[i*3+1] *= 0.99;
        colArr[i*3+2] *= 0.985;
      }
      sys.points.geometry.attributes.position.needsUpdate = true;
      sys.points.geometry.attributes.color.needsUpdate = true;
      (sys.points.material as THREE.PointsMaterial).opacity = 1 - t;
    }
  }
}
