import * as THREE from 'three';
import { Planet } from './Planet';
import { SeededRNG } from '../utils/rng';

export class StarSystem {
  private scene: THREE.Scene;
  private seed: number;
  private rng: SeededRNG;

  private star: THREE.Mesh | null = null;
  private starLight: THREE.PointLight | null = null;
  private planets: Planet[] = [];
  private orbitLines: THREE.Line[] = [];

  // Масштаб: внешняя планета ~1 000 000 ед от звезды
  private systemRadius = 1100000;

  constructor(scene: THREE.Scene, seed: number = 42) {
    this.scene = scene;
    this.seed = seed;
    this.rng = new SeededRNG(seed);
  }

  generate(): void {
    this.createStar();
    this.createPlanets();
    this.createOrbitLines();
    console.log(`[StarSystem] seed=${this.seed}: ${this.planets.length} planets`);
  }

  private createStar(): void {
    const starRadius = 80000 + this.rng.next() * 40000;
    const geometry = new THREE.SphereGeometry(starRadius, 64, 64);
    const hue = 0.08 + this.rng.next() * 0.12;
    const starColor = new THREE.Color().setHSL(hue, 0.9, 0.8);
    const material = new THREE.MeshBasicMaterial({ color: starColor });
    this.star = new THREE.Mesh(geometry, material);
    this.scene.add(this.star);

    // Main light
    this.starLight = new THREE.PointLight(starColor, 150, this.systemRadius * 2, 1);
    this.scene.add(this.starLight);

    // Corona glow
    const coronaGeo = new THREE.SphereGeometry(starRadius * 1.6, 32, 32);
    const coronaMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: starColor } },
      vertexShader: `varying vec3 vNormal; varying vec3 vPos; void main() { vec4 wp = modelMatrix * vec4(position,1.0); vPos = wp.xyz; vNormal = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vNormal; varying vec3 vPos; uniform vec3 uColor; void main() { float f = 1.0 - abs(dot(normalize(cameraPosition - vPos), vNormal)); gl_FragColor = vec4(uColor, pow(f,3.0)*0.4); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const corona = new THREE.Mesh(coronaGeo, coronaMat);
    this.scene.add(corona);
  }

  private createPlanets(): void {
    const count = 5 + Math.floor(this.rng.next() * 6); // 5-10 planets

    // Exponential spacing: closer planets bunched, far ones spread out
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1); // 0..1
      const orbitRadius = 800000 + Math.pow(t, 1.5) * 5000000; // inner~800K, outer~5.8M
      const planetSeed = this.rng.nextInt();
      const planet = new Planet(this.scene, planetSeed, orbitRadius, i);
      planet.generate();

      const startAngle = this.rng.next() * Math.PI * 2;
      planet.setOrbitAngle(startAngle);
      planet.setOrbitSpeed((0.01 + this.rng.next() * 0.1) / 1000);

      this.planets.push(planet);

      // Generate moons for gas giants or large planets
      if (planet.type === 'gas_giant' || (this.rng.next() < 0.3 && i > 1)) {
        const moonCount = 1 + Math.floor(this.rng.next() * 3);
        planet.generateMoons(moonCount, this.rng.nextInt());
      }
    }
  }

  private createOrbitLines(): void {
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x112233, transparent: true, opacity: 0.2, depthWrite: false,
    });
    for (const planet of this.planets) {
      const r = planet.getOrbitRadius();
      const segments = 256;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geo, lineMaterial);
      this.scene.add(line);
      this.orbitLines.push(line);
    }
  }

  update(dt: number, _elapsed: number): void {
    for (const planet of this.planets) planet.update(dt);
  }

  getPlanets(): Planet[] { return [...this.planets]; }
  getStarPosition(): THREE.Vector3 { return new THREE.Vector3(0, 0, 0); }
  getRadius(): number { return this.systemRadius; }

  dispose(): void {
    this.planets.forEach(p => p.dispose());
    if (this.star) { this.star.geometry.dispose(); (this.star.material as THREE.Material).dispose(); this.scene.remove(this.star); }
    if (this.starLight) this.scene.remove(this.starLight);
    this.orbitLines.forEach(l => { l.geometry.dispose(); (l.material as THREE.Material).dispose(); this.scene.remove(l); });
  }
}
