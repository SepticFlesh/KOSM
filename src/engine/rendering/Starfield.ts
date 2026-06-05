import * as THREE from 'three';

/**
 * Процедурное звёздное небо.
 * Создаёт систему частиц с тысячами звёзд,
 * генерирует skybox с туманностями.
 */
export class Starfield {
  private scene: THREE.Scene;
  private starCount: number;
  private points: THREE.Points | null = null;

  // Медленное вращение для живости
  private rotationSpeed = 0.0001;

  constructor(scene: THREE.Scene, starCount: number = 15000) {
    this.scene = scene;
    this.starCount = starCount;
  }

  /**
   * Создать звёздное поле
   */
  create(): void {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.starCount * 3);
    const colors = new Float32Array(this.starCount * 3);
    const sizes = new Float32Array(this.starCount);

    for (let i = 0; i < this.starCount; i++) {
      // Равномерное распределение на сфере большого радиуса
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 50000 + Math.random() * 100000;

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      // Цвет звезды: от холодного бело-голубого до тёплого жёлто-красного
      const temp = Math.random(); // 0 = холодная голубая, 1 = тёплая красная
      const r = 0.7 + temp * 0.3;
      const g = 0.7 + temp * 0.2;
      const b = 0.8 + (1 - temp) * 0.2;

      colors[i * 3] = r * (0.6 + Math.random() * 0.4);
      colors[i * 3 + 1] = g * (0.6 + Math.random() * 0.4);
      colors[i * 3 + 2] = b * (0.6 + Math.random() * 0.4);

      // Размер: большинство звёзд маленькие, редкие крупные
      sizes[i] = Math.random() < 0.02
        ? 5 + Math.random() * 10    // Яркие звёзды
        : 0.5 + Math.random() * 2.5; // Обычные
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Материал с поддержкой цвета вершин и размера
    const material = new THREE.PointsMaterial({
      size: 5,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true, // Дальние звёзды меньше
    });

    this.points = new THREE.Points(geometry, material);
    this.points.name = 'Starfield';
    this.scene.add(this.points);

    console.log(`[Starfield] Created ${this.starCount} stars`);
  }

  /**
   * Создать галактический диск (фоновая структура)
   */
  createGalacticDisc(
    innerRadius: number = 80000,
    outerRadius: number = 150000
  ): void {
    const count = 5000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Больше звёзд у внутреннего края
      const t = Math.pow(Math.random(), 2);
      const radius = innerRadius + t * (outerRadius - innerRadius);
      const height = (Math.random() - 0.5) * 5000 * (1 - t * 0.9); // То��ьше к краю

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      // Голубоватый оттенок диска
      colors[i * 3] = 0.4 + Math.random() * 0.3;
      colors[i * 3 + 1] = 0.5 + Math.random() * 0.3;
      colors[i * 3 + 2] = 0.6 + Math.random() * 0.4;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 8,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    });

    const disc = new THREE.Points(geometry, material);
    disc.name = 'GalacticDisc';
    this.scene.add(disc);
  }

  /**
   * Медленное вращение звёзд
   */
  update(_dt: number): void {
    if (this.points) {
      this.points.rotation.y += this.rotationSpeed;
      this.points.rotation.x += this.rotationSpeed * 0.3;
    }
  }
}
