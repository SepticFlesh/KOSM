import * as THREE from 'three';

/**
 * Beautiful volumetric-looking nebulas using overlapping sprites.
 */
export class NebulaSystem {
  private scene: THREE.Scene;
  private groups: THREE.Group[] = [];

  constructor(scene: THREE.Scene) { this.scene = scene; }

  generate(seed: number): void {
    this.clear();
    const rng = mulberry32(seed);

    const palettes = [
      [{ r: 0.2, g: 0.05, b: 0.5 }, { r: 0.05, g: 0.1, b: 0.6 }],
      [{ r: 0.05, g: 0.35, b: 0.25 }, { r: 0.1, g: 0.45, b: 0.15 }],
      [{ r: 0.45, g: 0.08, b: 0.08 }, { r: 0.25, g: 0.03, b: 0.15 }],
      [{ r: 0.05, g: 0.25, b: 0.45 }, { r: 0.15, g: 0.35, b: 0.25 }],
      [{ r: 0.4, g: 0.15, b: 0.05 }, { r: 0.45, g: 0.25, b: 0.03 }],
    ];

    const pal = palettes[seed % palettes.length];
    const count = 4 + Math.floor(rng() * 5); // 4-8 nebulas

    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const tex = genTex(rng, pal, 512);

      // Each nebula = 3-5 overlapping sprites for volumetric look
      const layers = 3 + Math.floor(rng() * 3);
      for (let j = 0; j < layers; j++) {
        const mat = new THREE.SpriteMaterial({
          map: tex,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.15 + rng() * 0.15,
        });
        const sprite = new THREE.Sprite(mat);

        // Slight position offset between layers
        const offX = (rng() - 0.5) * 300;
        const offY = (rng() - 0.5) * 300;
        const offZ = (rng() - 0.5) * 300;
        sprite.position.set(offX, offY, offZ);

        const scale = (2000 + rng() * 5000) * (0.7 + j * 0.2);
        sprite.scale.set(scale, scale * (0.5 + rng() * 0.5), 1);
        sprite.rotation.z = rng() * Math.PI * 2;
        group.add(sprite);
      }

      // Position group at large distance
      const dist = 4000 + rng() * 7000;
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      group.position.set(
        Math.sin(phi) * Math.cos(theta) * dist,
        Math.sin(phi) * Math.sin(theta) * dist,
        Math.cos(phi) * dist,
      );

      this.scene.add(group);
      this.groups.push(group);
    }
  }

  clear(): void {
    for (const g of this.groups) {
      g.traverse(c => {
        if (c instanceof THREE.Sprite) {
          (c.material as THREE.SpriteMaterial).map?.dispose();
          (c.material as THREE.SpriteMaterial).dispose();
        }
      });
      this.scene.remove(g);
    }
    this.groups.length = 0;
  }
}

function genTex(rng: () => number, pal: Array<{r:number;g:number;b:number}>, size: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d')!;
  const h = size / 2;

  // Main soft gradient
  const c1 = pal[0]; const c2 = pal[1];
  const cx = h + (rng() - 0.5) * h * 0.6;
  const cy = h + (rng() - 0.5) * h * 0.6;
  const grd = ctx.createRadialGradient(cx, cy, 0, h, h, h * 0.9);
  grd.addColorStop(0, `rgba(${Math.floor(c1.r*255)},${Math.floor(c1.g*255)},${Math.floor(c1.b*255)},0.7)`);
  grd.addColorStop(0.3, `rgba(${Math.floor((c1.r+c2.r)/2*255)},${Math.floor((c1.g+c2.g)/2*255)},${Math.floor((c1.b+c2.b)/2*255)},0.4)`);
  grd.addColorStop(0.7, `rgba(${Math.floor(c2.r*255)},${Math.floor(c2.g*255)},${Math.floor(c2.b*255)},0.08)`);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);

  // Soft cloudy blobs
  for (let i = 0; i < 50; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 20 + rng() * 180;
    const a = 0.02 + rng() * 0.15;
    const cr = c1.r + (c2.r - c1.r) * rng();
    const cg = c1.g + (c2.g - c1.g) * rng();
    const cb = c1.b + (c2.b - c1.b) * rng();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${Math.floor(cr*255)},${Math.floor(cg*255)},${Math.floor(cb*255)},${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  }

  // Blur the edges
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(h, h, h*0.4, h, h, h*0.95);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) | 0;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
