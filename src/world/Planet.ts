import * as THREE from 'three';
import { SeededRNG } from '../utils/rng';

export class Planet {
  private scene: THREE.Scene;
  private seed: number;
  private rng: SeededRNG;
  private orbitRadius: number;
  private index: number;

  private mesh: THREE.Mesh | null = null;
  private atmosphere: THREE.Mesh | null = null;
  private ringMesh: THREE.Mesh | null = null;
  private ringParticles: THREE.Points | null = null;
  private moons: Array<{ mesh: THREE.Mesh; orbitRadius: number; angle: number; speed: number }> = [];

  public type = 'rocky';
  private radius = 10;
  private color = new THREE.Color(0x888888);
  private orbitAngle = 0;
  private orbitSpeed = 0.1;
  private hasRings = false;

  constructor(scene: THREE.Scene, seed: number, orbitRadius: number, index: number) {
    this.scene = scene; this.seed = seed; this.rng = new SeededRNG(seed);
    this.orbitRadius = orbitRadius; this.index = index;
  }

  generate(): void {
    this.determineType();
    this.createTexture();
    this.createMesh();
    this.createAtmosphere();
    if (this.hasRings) this.createRings();
    this.updatePosition();
  }

  generateMoons(count: number, moonSeed: number): void {
    const moonRng = new SeededRNG(moonSeed);
    for (let i = 0; i < count; i++) {
      const moonGeo = new THREE.SphereGeometry(this.radius * 0.15 + moonRng.next() * this.radius * 0.25, 12, 8);
      const moonMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.08 + moonRng.next() * 0.1, 0.15, 0.3 + moonRng.next() * 0.3),
        roughness: 0.8, metalness: 0.1,
      });
      const moon = new THREE.Mesh(moonGeo, moonMat);
      moon.position.copy(this.mesh!.position);
      this.scene.add(moon);
      this.moons.push({
        mesh: moon,
        orbitRadius: this.radius * 2 + moonRng.next() * this.radius * 5,
        angle: moonRng.next() * Math.PI * 2,
        speed: (0.3 + moonRng.next() * 0.7) / 1000,
      });
    }
  }

  private determineType(): void {
    const roll = this.rng.next();
    if (roll < 0.15) {
      this.type = 'gas_giant'; this.radius = 2500 + this.rng.next() * 4000;
      this.color = new THREE.Color().setHSL(0.05 + this.rng.next() * 0.2, 0.3, 0.5 + this.rng.next() * 0.3);
      this.hasRings = this.rng.next() < 0.5;
    } else if (roll < 0.30) {
      this.type = 'ice'; this.radius = 800 + this.rng.next() * 1500;
      this.color = new THREE.Color().setHSL(0.55, 0.15, 0.6 + this.rng.next() * 0.4);
    } else if (roll < 0.40) {
      this.type = 'lava'; this.radius = 1000 + this.rng.next() * 1200;
      this.color = new THREE.Color().setHSL(0.03, 0.85, 0.4 + this.rng.next() * 0.2);
    } else {
      this.type = 'rocky'; this.radius = 600 + this.rng.next() * 2000;
      this.color = new THREE.Color().setHSL(0.08 + this.rng.next() * 0.15, 0.2, 0.3 + this.rng.next() * 0.3);
      this.hasRings = this.rng.next() < 0.05;
    }
  }

  private createTexture(): void {
    const size = 512;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const noiseRng = new SeededRNG(this.seed + 1000);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size, ny = y / size;
        const cn = this.fbm(noiseRng, nx * 8, ny * 8, 5);
        const dn = this.fbm(noiseRng, nx * 24 + 100, ny * 24 + 100, 3);
        let r: number, g: number, b: number;

        if (this.type === 'rocky') {
          if (cn > 0.55) { r = 0.35 + dn * 0.4; g = 0.25 + dn * 0.4; b = 0.15 + dn * 0.2; }
          else if (cn > 0.45) { r = 0.3 + dn * 0.3; g = 0.35 + dn * 0.3; b = 0.25 + dn * 0.2; }
          else { r = 0.1 + dn * 0.15; g = 0.15 + dn * 0.2; b = 0.4 + dn * 0.4; }
        } else if (this.type === 'gas_giant') {
          const band = Math.sin(ny * 30 + cn * 5) * 0.5 + 0.5;
          r = this.color.r * (0.5 + band * 0.5 + dn * 0.2);
          g = this.color.g * (0.5 + band * 0.4 + dn * 0.2);
          b = this.color.b * (0.4 + band * 0.6 + dn * 0.2);
        } else if (this.type === 'ice') {
          r = 0.7 + cn * 0.2 + dn * 0.1;
          g = 0.8 + cn * 0.15 + dn * 0.05;
          b = 0.85 + cn * 0.1 + dn * 0.05;
        } else {
          const lava = this.fbm(noiseRng, nx * 10, ny * 10, 3);
          const isLava = lava > 0.6;
          r = isLava ? 0.9 + dn * 0.1 : 0.08 + dn * 0.1;
          g = isLava ? 0.25 + dn * 0.2 : 0.04;
          b = isLava ? 0.04 : 0.02;
        }
        img.data[i] = Math.floor(r * 255);
        img.data[i + 1] = Math.floor(g * 255);
        img.data[i + 2] = Math.floor(b * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = this.mesh?.material as THREE.MeshStandardMaterial;
    if (mat) mat.map = tex;
  }

  private fbm(rng: SeededRNG, x: number, y: number, octaves: number): number {
    let v = 0, a = 1, f = 1, m = 0;
    for (let i = 0; i < octaves; i++) { v += a * this.noise(x * f, y * f); m += a; a *= 0.5; f *= 2; }
    return v / m;
  }

  private noise(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (this.hash(ix, iy) * (1 - sx) * (1 - sy) + this.hash(ix + 1, iy) * sx * (1 - sy) +
            this.hash(ix, iy + 1) * (1 - sx) * sy + this.hash(ix + 1, iy + 1) * sx * sy);
  }

  private hash(x: number, y: number): number {
    let h = x * 374761393 + y * 668265263 + this.seed;
    h = (h ^ (h >> 13)) * 1274126177; h = h ^ (h >> 16);
    return (h & 0x7fffffff) / 0x7fffffff;
  }

  private createMesh(): void {
    const geo = new THREE.SphereGeometry(this.radius, 64, 48);
    const mat = new THREE.MeshStandardMaterial({
      roughness: this.type === 'gas_giant' ? 0.9 : 0.8, metalness: this.type === 'lava' ? 0.3 : 0.05,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = `Planet_${this.index}`;
    this.scene.add(this.mesh);
    // Re-create texture now that mesh exists
    this.createTexture();
  }

  private createAtmosphere(): void {
    const atmosGeo = new THREE.SphereGeometry(this.radius * 1.06, 48, 32);
    const atmosMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this.type === 'lava' ? new THREE.Color(0xff4400) : this.type === 'ice' ? new THREE.Color(0x88ccff) : new THREE.Color(0x4488cc) },
      },
      vertexShader: `varying vec3 vNormal; varying vec3 vPos; void main() { vec4 wp = modelMatrix * vec4(position,1.0); vPos = wp.xyz; vNormal = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vNormal; varying vec3 vPos; uniform vec3 uColor; void main() { vec3 vd = normalize(cameraPosition - vPos); float f = 1.0 - abs(dot(vd, vNormal)); gl_FragColor = vec4(uColor, pow(f, 3.5) * 0.35); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const atmos = new THREE.Mesh(atmosGeo, atmosMat);
    this.scene.add(atmos);
    // Track atmosphere position
    this.atmosphere = atmos;
  }

  private createRings(): void {
    const innerR = this.radius * 1.3, outerR = this.radius * 2.4;
    // Solid ring
    const ringGeo = new THREE.RingGeometry(innerR, outerR, 128);
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 32;
    const ctx = cv.getContext('2d')!;
    const ringRng = new SeededRNG(this.seed + 2000);
    for (let x = 0; x < 512; x++) {
      const a = 0.1 + ringRng.next() * 0.6;
      const shade = Math.floor((0.6 + ringRng.next() * 0.4) * 255);
      ctx.fillStyle = `rgba(${shade},${Math.floor(shade*0.8)},${Math.floor(shade*0.6)},${a})`;
      ctx.fillRect(x, 0, 1, 16 + ringRng.next() * 16);
    }
    const ringTex = new THREE.CanvasTexture(cv);
    ringTex.colorSpace = THREE.SRGBColorSpace;
    const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, side: THREE.DoubleSide, transparent: true, depthWrite: false });
    this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.ringMesh.rotation.x = Math.PI / 2 + (this.rng.next() - 0.5) * 0.3;
    this.scene.add(this.ringMesh);

    // Asteroid particles within rings
    const N = 1500;
    const pArr = new Float32Array(N * 3);
    const cArr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const dist = innerR + this.rng.next() * (outerR - innerR);
      const h = (this.rng.next() - 0.5) * this.radius * 0.2;
      pArr[i * 3] = Math.cos(angle) * dist;
      pArr[i * 3 + 1] = h;
      pArr[i * 3 + 2] = Math.sin(angle) * dist;
      const shade = 0.3 + this.rng.next() * 0.4;
      cArr[i * 3] = shade; cArr[i * 3 + 1] = shade * 0.8; cArr[i * 3 + 2] = shade * 0.6;
    }
    const ptGeo = new THREE.BufferGeometry();
    ptGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
    ptGeo.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
    const ptMat = new THREE.PointsMaterial({
      size: 0.5, vertexColors: true, blending: THREE.NormalBlending, depthWrite: true, sizeAttenuation: true,
    });
    this.ringParticles = new THREE.Points(ptGeo, ptMat);
    this.ringParticles.rotation.x = this.ringMesh.rotation.x;
    this.scene.add(this.ringParticles);
  }

  update(dt: number): void {
    this.orbitAngle += this.orbitSpeed * dt;
    this.updatePosition();
    if (this.mesh) this.mesh.rotation.y += dt * 0.00015;
    // Update moons
    for (const m of this.moons) {
      m.angle += m.speed * dt;
      const px = this.mesh!.position.x + Math.cos(m.angle) * m.orbitRadius;
      const pz = this.mesh!.position.z + Math.sin(m.angle) * m.orbitRadius;
      m.mesh.position.set(px, this.mesh!.position.y, pz);
    }
    // Track ring rotation
    if (this.ringMesh) this.ringMesh.rotation.z += dt * 0.00005;
    if (this.ringParticles) this.ringParticles.rotation.z += dt * 0.00005;
  }

  private updatePosition(): void {
    const x = Math.cos(this.orbitAngle) * this.orbitRadius;
    const z = Math.sin(this.orbitAngle) * this.orbitRadius;
    const pos = new THREE.Vector3(x, 0, z);
    if (this.mesh) this.mesh.position.copy(pos);
    if (this.atmosphere) this.atmosphere.position.copy(pos);
    if (this.ringMesh) this.ringMesh.position.copy(pos);
    if (this.ringParticles) this.ringParticles.position.copy(pos);
  }

  getPosition(): THREE.Vector3 { return this.mesh?.position.clone() ?? new THREE.Vector3(); }
  getOrbitRadius(): number { return this.orbitRadius; }
  setOrbitAngle(a: number): void { this.orbitAngle = a; this.updatePosition(); }
  setOrbitSpeed(s: number): void { this.orbitSpeed = s; }

  dispose(): void {
    if (this.mesh) { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.scene.remove(this.mesh); }
    if (this.atmosphere) { (this.atmosphere as THREE.Mesh).geometry.dispose(); ((this.atmosphere as THREE.Mesh).material as THREE.Material).dispose(); this.scene.remove(this.atmosphere); }
    if (this.ringMesh) { this.ringMesh.geometry.dispose(); (this.ringMesh.material as THREE.Material).dispose(); this.scene.remove(this.ringMesh); }
    if (this.ringParticles) { this.ringParticles.geometry.dispose(); (this.ringParticles.material as THREE.Material).dispose(); this.scene.remove(this.ringParticles); }
    for (const m of this.moons) { m.mesh.geometry.dispose(); (m.mesh.material as THREE.Material).dispose(); this.scene.remove(m.mesh); }
  }
}
