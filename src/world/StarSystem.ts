import * as THREE from 'three';
import { Planet } from './Planet';
import { SeededRNG } from '../utils/rng';

/**
 * Звёздная система.
 * Содержит звезду, планеты, астероидные поля.
 * Вся геометрия генерируется процедурно из seed.
 */
export class StarSystem {
  private scene: THREE.Scene;
  private seed: number;
  private rng: SeededRNG;

  // Объекты системы
  private star: THREE.Mesh | null = null;
  private starLight: THREE.PointLight | null = null;
  private planets: Planet[] = [];
  private asteroidBelt: THREE.Points | null = null;
  private orbitLines: THREE.Line[] = [];

  // Конфигурация
  private systemRadius = 5000; // Радиус системы в условных единицах

  constructor(scene: THREE.Scene, seed: number = 42) {
    this.scene = scene;
    this.seed = seed;
    this.rng = new SeededRNG(seed);
  }

  /**
   * Сгенерировать всю систему
   */
  generate(): void {
    this.createStar();
    this.createPlanets();
    this.createAsteroidBelt();
    this.createOrbitLines();

    console.log(
      `[StarSystem] Generated system (seed=${this.seed}): ${this.planets.length} planets`
    );
  }

  /**
   * Создать центральную звезду
   */
  private createStar(): void {
    // Звезда — светящаяся сфера с эмиссивным материалом
    const starRadius = 30 + this.rng.next() * 20;
    const geometry = new THREE.SphereGeometry(starRadius, 64, 64);

    // Цвет звезды: от голубого до оранжевого
    const hue = 0.08 + this.rng.next() * 0.12; // жёлтый → оранжевый
    const starColor = new THREE.Color().setHSL(hue, 0.9, 0.8);

    const material = new THREE.MeshBasicMaterial({
      color: starColor,
    });

    this.star = new THREE.Mesh(geometry, material);
    this.star.position.set(0, 0, 0);
    this.scene.add(this.star);

    // Источник света
    this.starLight = new THREE.PointLight(starColor, 100, this.systemRadius * 2, 1);
    this.starLight.position.set(0, 0, 0);
    this.scene.add(this.starLight);

    // Корона (внешнее свечение)
    const coronaGeometry = new THREE.SphereGeometry(starRadius * 1.5, 32, 32);
    const coronaMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: starColor },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vPosition = worldPos.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vPosition;
        uniform vec3 uColor;
        uniform float uTime;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vPosition);
          float fresnel = 1.0 - abs(dot(viewDir, vNormal));
          float alpha = pow(fresnel, 3.0) * 0.4;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const corona = new THREE.Mesh(coronaGeometry, coronaMaterial);
    corona.name = 'StarCorona';
    this.scene.add(corona);
  }

  /**
   * Создать планеты
   */
  private createPlanets(): void {
    const planetCount = 3 + Math.floor(this.rng.next() * 5); // 3–7 планет

    for (let i = 0; i < planetCount; i++) {
      const orbitRadius = 200 + i * 400 + this.rng.next() * 300;
      const planetSeed = this.rng.nextInt();
      const planet = new Planet(this.scene, planetSeed, orbitRadius, i);
      planet.generate();

      // Случайная начальная позиция на орбите
      const startAngle = this.rng.next() * Math.PI * 2;
      planet.setOrbitAngle(startAngle);
      planet.setOrbitSpeed(0.05 + this.rng.next() * 0.2);

      this.planets.push(planet);
    }
  }

  /**
   * Создать пояс астероидов
   */
  private createAsteroidBelt(): void {
    const count = 2000;
    const innerRadius = 1500;
    const outerRadius = 2200;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const radius = innerRadius + this.rng.next() * (outerRadius - innerRadius);
      const height = (this.rng.next() - 0.5) * 100;

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      sizes[i] = 0.5 + this.rng.next() * 3;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 2,
      color: 0x887766,
      blending: THREE.NormalBlending,
      depthWrite: true,
      sizeAttenuation: true,
    });

    this.asteroidBelt = new THREE.Points(geometry, material);
    this.asteroidBelt.name = 'AsteroidBelt';
    this.scene.add(this.asteroidBelt);
  }

  /**
   * Создать линии орбит для визуализации
   */
  private createOrbitLines(): void {
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x223344,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });

    for (const planet of this.planets) {
      const orbitRadius = planet.getOrbitRadius();
      const segments = 128;
      const points: THREE.Vector3[] = [];

      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push(
          new THREE.Vector3(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius)
        );
      }

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const orbitLine = new THREE.Line(geometry, lineMaterial);
      this.scene.add(orbitLine);
      this.orbitLines.push(orbitLine);
    }
  }

  /**
   * Обновление системы (орбитальное движение)
   */
  update(dt: number, _elapsed: number): void {
    for (const planet of this.planets) {
      planet.update(dt);
    }
  }

  /**
   * Получить планету по индексу
   */
  getPlanet(index: number): Planet | null {
    return this.planets[index] ?? null;
  }

  /**
   * Получить все планеты
   */
  getPlanets(): Planet[] {
    return [...this.planets];
  }

  /**
   * Позиция звезды в мировых координатах
   */
  getStarPosition(): THREE.Vector3 {
    return this.star?.position.clone() ?? new THREE.Vector3();
  }

  /**
   * Радиус системы
   */
  getRadius(): number {
    return this.systemRadius;
  }

  dispose(): void {
    this.planets.forEach((p) => p.dispose());
    if (this.star) {
      this.star.geometry.dispose();
      (this.star.material as THREE.Material).dispose();
      this.scene.remove(this.star);
    }
    if (this.starLight) {
      this.scene.remove(this.starLight);
    }
    if (this.asteroidBelt) {
      this.asteroidBelt.geometry.dispose();
      (this.asteroidBelt.material as THREE.Material).dispose();
      this.scene.remove(this.asteroidBelt);
    }
    this.orbitLines.forEach((line) => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      this.scene.remove(line);
    });
  }
}
