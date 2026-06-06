import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { hash2D } from '../utils/rng';

/**
 * Загрузчик и кеш ассетов.
 * Поддерживает:
 * - glTF модели
 * - Текстуры
 * - Звуки
 * - Процедурные текстуры
 */
export class AssetLoader {
  private gltfLoader: GLTFLoader | null = null;
  private textureLoader: THREE.TextureLoader;

  // Кеш
  private textureCache: Map<string, THREE.Texture> = new Map();
  private modelCache: Map<string, THREE.Group> = new Map();

  constructor() {
    this.textureLoader = new THREE.TextureLoader();
  }

  /**
   * Получить GLTFLoader (lazy init — требует импорта из three/examples)
   */
  private async getGLTFLoader(): Promise<GLTFLoader> {
    if (!this.gltfLoader) {
      const { GLTFLoader: GLTF } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      this.gltfLoader = new GLTF();
    }
    return this.gltfLoader;
  }

  /**
   * Загрузить glTF модель
   */
  async loadModel(url: string): Promise<THREE.Group> {
    const cached = this.modelCache.get(url);
    if (cached) return cached.clone();

    const loader = await this.getGLTFLoader();
    const gltf = await loader.loadAsync(url);
    this.modelCache.set(url, gltf.scene);
    return gltf.scene.clone();
  }

  /**
   * Загрузить текстуру
   */
  async loadTexture(url: string): Promise<THREE.Texture> {
    const cached = this.textureCache.get(url);
    if (cached) return cached;

    const texture = await this.textureLoader.loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textureCache.set(url, texture);
    return texture;
  }

  /**
   * Сгенерировать процедурную текстуру (шум Перлина на CPU)
   */
  generateNoiseTexture(size: number = 256, scale: number = 8): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const value = this.simpleNoise(x / scale, y / scale);
        const color = Math.floor(value * 255);
        imageData.data[i] = color;
        imageData.data[i + 1] = color;
        imageData.data[i + 2] = color;
        imageData.data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  /**
   * Простой 2D-шум (замена Перлина, без внешних зависимостей)
   */
  private simpleNoise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    // Smoothstep
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const h00 = hash2D(ix, iy);
    const h10 = hash2D(ix + 1, iy);
    const h01 = hash2D(ix, iy + 1);
    const h11 = hash2D(ix + 1, iy + 1);

    return (
      h00 * (1 - sx) * (1 - sy) +
      h10 * sx * (1 - sy) +
      h01 * (1 - sx) * sy +
      h11 * sx * sy
    );
  }

  /**
   * Очистить кеш
   */
  clearCache(): void {
    this.textureCache.forEach((t) => t.dispose());
    this.textureCache.clear();
    this.modelCache.clear();
  }
}
