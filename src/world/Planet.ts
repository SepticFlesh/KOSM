import * as THREE from 'three';
import { SeededRNG } from '../utils/rng';

/**
 * Планета с процедурной геометрией и текстурой.
 * Типы: каменная, газовая, ледяная, лавовая.
 */
export enum PlanetType {
  Rocky = 'rocky',
  GasGiant = 'gas_giant',
  Ice = 'ice',
  Lava = 'lava',
}

export class Planet {
  private scene: THREE.Scene;
  private seed: number;
  private rng: SeededRNG;
  private orbitRadius: number;
  private index: number;

  // 3D объекты
  private mesh: THREE.Mesh | null = null;
  private atmosphere: THREE.Mesh | null = null;
  private ringMesh: THREE.Mesh | null = null; // Для планет с кольцами

  // Параметры
  private type: PlanetType = PlanetType.Rocky;
  private radius: number = 10;
  private color: THREE.Color = new THREE.Color(0x888888);
  private orbitAngle = 0;
  private orbitSpeed = 0.1;
  private hasRings = false;
  private hasAtmosphere = false;

  // Текстура (процедурная)
  private texture: THREE.CanvasTexture | null = null;

  constructor(
    scene: THREE.Scene,
    seed: number,
    orbitRadius: number,
    index: number
  ) {
    this.scene = scene;
    this.seed = seed;
    this.rng = new SeededRNG(seed);
    this.orbitRadius = orbitRadius;
    this.index = index;
  }

  /**
   * Сгенерировать планету
   */
  generate(): void {
    this.determineType();
    this.createTexture();
    this.createMesh();
    if (this.hasAtmosphere) this.createAtmosphere();
    if (this.hasRings) this.createRings();

    // Начальная позиция
    this.updatePosition();
  }

  /**
   * Определить тип планеты на основе seed
   */
  private determineType(): void {
    const roll = this.rng.next();

    if (roll < 0.15) {
      this.type = PlanetType.GasGiant;
      this.radius = 15 + this.rng.next() * 20;
      this.color = new THREE.Color().setHSL(
        0.05 + this.rng.next() * 0.2,
        0.3 + this.rng.next() * 0.2,
        0.5 + this.rng.next() * 0.3
      );
      this.hasRings = this.rng.next() < 0.3;
      this.hasAtmosphere = true;
    } else if (roll < 0.30) {
      this.type = PlanetType.Ice;
      this.radius = 5 + this.rng.next() * 10;
      this.color = new THREE.Color().setHSL(
        0.55 + this.rng.next() * 0.1,
        0.1 + this.rng.next() * 0.2,
        0.6 + this.rng.next() * 0.4
      );
      this.hasAtmosphere = this.rng.next() < 0.5;
    } else if (roll < 0.40) {
      this.type = PlanetType.Lava;
      this.radius = 6 + this.rng.next() * 8;
      this.color = new THREE.Color().setHSL(
        0.02 + this.rng.next() * 0.05,
        0.8 + this.rng.next() * 0.2,
        0.4 + this.rng.next() * 0.2
      );
      this.hasAtmosphere = true;
    } else {
      this.type = PlanetType.Rocky;
      this.radius = 4 + this.rng.next() * 12;
      this.color = new THREE.Color().setHSL(
        0.08 + this.rng.next() * 0.15,
        0.15 + this.rng.next() * 0.3,
        0.3 + this.rng.next() * 0.3
      );
      this.hasAtmosphere = this.rng.next() < 0.4;
      this.hasRings = this.rng.next() < 0.05;
    }
  }

  /**
   * Создать процедурную текстуру планеты
   */
  private createTexture(): void {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(size, size);

    const baseR = this.color.r;
    const baseG = this.color.g;
    const baseB = this.color.b;

    const noiseRng = new SeededRNG(this.seed + 1000);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Многослойный шум для реалистичности
        const nx = x / size;
        const ny = y / size;

        // Континентальный шум
        const continentNoise = this.fbm(noiseRng, nx * 8, ny * 8, 5);
        // Детальный шум
        const detailNoise = this.fbm(noiseRng, nx * 24 + 100, ny * 24 + 100, 3);

        let r: number, g: number, b: number;

        switch (this.type) {
          case PlanetType.Rocky:
            // Континенты и океан��
            if (continentNoise > 0.55) {
              // Суша: коричнево-зелёная
              r = baseR * (0.6 + detailNoise * 0.5);
              g = baseG * (0.5 + detailNoise * 0.6);
              b = baseB * (0.3 + detailNoise * 0.3);
            } else if (continentNoise > 0.45) {
              // Побережье
              r = baseR * (0.7 + detailNoise * 0.3);
              g = baseG * (0.6 + detailNoise * 0.3);
              b = baseB * (0.5 + detailNoise * 0.3);
            } else {
              // Океан
              r = 0.1 + detailNoise * 0.15;
              g = 0.2 + detailNoise * 0.25;
              b = 0.5 + detailNoise * 0.4;
            }
            break;

          case PlanetType.GasGiant:
            // Полосы
            const bandNoise = Math.sin(ny * 30 + continentNoise * 5) * 0.5 + 0.5;
            const turbulence = detailNoise * 0.3;
            r = baseR * (0.6 + bandNoise * 0.4 + turbulence);
            g = baseG * (0.5 + bandNoise * 0.3 + turbulence);
            b = baseB * (0.4 + bandNoise * 0.5 + turbulence);
            break;

          case PlanetType.Ice:
            r = 0.7 + continentNoise * 0.2 + detailNoise * 0.1;
            g = 0.8 + continentNoise * 0.15 + detailNoise * 0.05;
            b = 0.85 + continentNoise * 0.1 + detailNoise * 0.05;
            break;

          case PlanetType.Lava:
            const lavaNoise = this.fbm(noiseRng, nx * 10, ny * 10, 3);
            const isLava = lavaNoise > 0.6;
            r = isLava ? 0.9 + detailNoise * 0.1 : 0.1 + detailNoise * 0.1;
            g = isLava ? 0.3 + detailNoise * 0.2 : 0.05 + detailNoise * 0.05;
            b = isLava ? 0.05 + detailNoise * 0.05 : 0.03;
            break;

          default:
            r = baseR * (0.7 + detailNoise * 0.3);
            g = baseG * (0.7 + detailNoise * 0.3);
            b = baseB * (0.7 + detailNoise * 0.3);
        }

        imageData.data[i] = Math.floor(r * 255);
        imageData.data[i + 1] = Math.floor(g * 255);
        imageData.data[i + 2] = Math.floor(b * 255);
        imageData.data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapU = THREE.ClampToEdgeWrapping;
  }

  /**
   * Fractional Brownian Motion — многослойный шум
   */
  private fbm(rng: SeededRNG, x: number, y: number, octaves: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.simpleNoise(x * frequency, y * frequency);
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  }

  private simpleNoise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    // Smoothstep
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const h00 = this.hash(ix, iy);
    const h10 = this.hash(ix + 1, iy);
    const h01 = this.hash(ix, iy + 1);
    const h11 = this.hash(ix + 1, iy + 1);

    return (
      h00 * (1 - sx) * (1 - sy) +
      h10 * sx * (1 - sy) +
      h01 * (1 - sx) * sy +
      h11 * sx * sy
    );
  }

  private hash(x: number, y: number): number {
    let h = x * 374761393 + y * 668265263 + this.seed;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return (h & 0x7fffffff) / 0x7fffffff;
  }

  /**
   * Создать меш планеты
   */
  private createMesh(): void {
    const geometry = new THREE.SphereGeometry(this.radius, 64, 48);
    const material = new THREE.MeshStandardMaterial({
      map: this.texture,
      roughness: this.type === PlanetType.GasGiant ? 0.9 : 0.8,
      metalness: this.type === PlanetType.Lava ? 0.3 : 0.05,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = `Planet_${this.index}_${this.type}`;
    this.scene.add(this.mesh);
  }

  /**
   * Создать атмосферу (внешнее свечение)
   */
  private createAtmosphere(): void {
    const atmosphereGeometry = new THREE.SphereGeometry(this.radius * 1.08, 64, 48);
    const atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this.color },
        uCameraPos: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        uniform vec3 uColor;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = 1.0 - abs(dot(viewDir, vNormal));
          float alpha = pow(fresnel, 4.0) * 0.35;
          gl_FragColor = vec4(uColor * 1.5, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    this.atmosphere.name = `Atmosphere_${this.index}`;
    this.scene.add(this.atmosphere);
  }

  /**
   * Создать кольца (для газовых гигантов)
   */
  private createRings(): void {
    const innerRadius = this.radius * 1.3;
    const outerRadius = this.radius * 2.2;
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 128);

    // Процедурная текстура колец
    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = 512;
    ringCanvas.height = 32;
    const ctx = ringCanvas.getContext('2d')!;

    const ringRng = new SeededRNG(this.seed + 2000);
    for (let x = 0; x < 512; x++) {
      const alpha = 0.1 + ringRng.next() * 0.6;
      const shade = Math.floor((0.6 + ringRng.next() * 0.4) * 255);
      ctx.fillStyle = `rgba(${shade},${shade},${Math.floor(shade * 0.8)},${alpha})`;
      ctx.fillRect(x, 0, 1, 16 + ringRng.next() * 16);
    }

    const ringTexture = new THREE.CanvasTexture(ringCanvas);
    ringTexture.colorSpace = THREE.SRGBColorSpace;

    const ringMaterial = new THREE.MeshBasicMaterial({
      map: ringTexture,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });

    this.ringMesh = new THREE.Mesh(geometry, ringMaterial);
    this.ringMesh.rotation.x = Math.PI / 2 + (this.rng.next() - 0.5) * 0.3;
    this.ringMesh.name = `Rings_${this.index}`;
    this.scene.add(this.ringMesh);
  }

  /**
   * Обновление позиции (орбитальное движение)
   */
  update(dt: number): void {
    this.orbitAngle += this.orbitSpeed * dt;
    this.updatePosition();

    // Вращение планеты
    if (this.mesh) {
      this.mesh.rotation.y += dt * 0.1;
    }
  }

  /**
   * Вычислить и применить позицию на орбите
   */
  private updatePosition(): void {
    const x = Math.cos(this.orbitAngle) * this.orbitRadius;
    const z = Math.sin(this.orbitAngle) * this.orbitRadius;

    const position = new THREE.Vector3(x, 0, z);

    if (this.mesh) this.mesh.position.copy(position);
    if (this.atmosphere) this.atmosphere.position.copy(position);
    if (this.ringMesh) {
      this.ringMesh.position.copy(position);
      this.ringMesh.rotation.x = Math.PI / 2 + (this.rng.next() - 0.5) * 0.3;
    }
  }

  // --- Геттеры ---

  getOrbitRadius(): number {
    return this.orbitRadius;
  }

  getPosition(): THREE.Vector3 {
    return this.mesh?.position.clone() ?? new THREE.Vector3();
  }

  getRadius(): number {
    return this.radius;
  }

  setOrbitAngle(angle: number): void {
    this.orbitAngle = angle;
    this.updatePosition();
  }

  setOrbitSpeed(speed: number): void {
    this.orbitSpeed = speed;
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.scene.remove(this.mesh);
    }
    if (this.atmosphere) {
      this.atmosphere.geometry.dispose();
      (this.atmosphere.material as THREE.Material).dispose();
      this.scene.remove(this.atmosphere);
    }
    if (this.ringMesh) {
      this.ringMesh.geometry.dispose();
      (this.ringMesh.material as THREE.Material).dispose();
      this.scene.remove(this.ringMesh);
    }
    if (this.texture) {
      this.texture.dispose();
    }
  }
}
