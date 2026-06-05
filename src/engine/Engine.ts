import * as THREE from 'three';
import { SceneManager } from './SceneManager';
import { InputManager } from './InputManager';
import { AssetLoader } from './AssetLoader';
import { Starfield } from './rendering/Starfield';

/**
 * Г�авный игровой цикл.
 * Управляет �ендером, �ценой та симуляцией.
 */
export class Engine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement | null = null;
  private sceneManager: SceneManager;
  private inputManager: InputManager;
  private assetLoader: AssetLoader;
  private starfield: Starfield | null = null;

  // Delta time tracking (manual, avoids THREE.Timer quirks)
  private lastTime = 0;
  private totalTime = 0;

  // FPS tracking
  private frameCount = 0;
  private lastFpsUpdate = 0;
  private currentFps = 60;

  private isRunning = false;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000000
    );

    this.sceneManager = new SceneManager(this.scene);
    this.inputManager = new InputManager();
    this.assetLoader = new AssetLoader();

    // renderer создаётся в init() с реальным canvas
    this.renderer = null!;
  }

  /**
   * Инициализац�я �ендерера, сцены та �вездного неба.
   */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    // Настройка рендерера
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Настройка сцены
    this.scene.background = new THREE.Color(0x000022);
    this.scene.fog = null; // В космосе нет тумана

    // Камера
    this.camera.position.set(0, 5, -20);
    this.camera.lookAt(0, 0, 0);

    // Звёздное небо
    this.starfield = new Starfield(this.scene, 15000);
    this.starfield.create();

    // Освещение (базовое, для тестовых объектов)
    const ambientLight = new THREE.AmbientLight(0x111122, 0.5);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    sunLight.position.set(100, 50, 0);
    this.scene.add(sunLight);

    // Обработка ресайза
    window.addEventListener('resize', this.onResize.bind(this));

    console.log('[Engine] Initialized');
  }

  /**
   * Запуск игрового цикла
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now() / 1000; // секунды
    this.lastFpsUpdate = performance.now();
    this.inputManager.attach(this.canvas ?? undefined);
    this.gameLoop();
    console.log('[Engine] Started');
  }

  /**
   * Остановка игрового цикла
   */
  stop(): void {
    this.isRunning = false;
    this.inputManager.detach(this.canvas ?? undefined);
  }

  /**
   * Главный цикл игры
   */
  private gameLoop = (): void => {
    if (!this.isRunning) return;

    requestAnimationFrame(this.gameLoop);

    const now = performance.now() / 1000; // секунды
    const dt = Math.min(now - this.lastTime, 0.1); // Cap delta
    this.lastTime = now;
    this.totalTime += dt;

    // Обновление
    this.update(dt, this.totalTime);

    // Рендер
    this.render();
  };

  /**
   * Обновление логики
   */
  private update(dt: number, elapsedTime: number): void {
    // Сначала симуляция (читает накопленные дельты мыши/клавиш)
    this.sceneManager.update(dt, elapsedTime);
    // Потом сброс дельт для следующего кадра
    this.inputManager.update();

    // Поворот звёздного неба (медленный)
    if (this.starfield) {
      this.starfield.update(dt);
    }

    // FPS counter + adaptive quality
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 1000) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      // Adaptive quality
      if (this.currentFps < 25) {
        this.renderer.setPixelRatio(0.75);
      } else if (this.currentFps < 40) {
        this.renderer.setPixelRatio(1.0);
      } else {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      }
    }
  }

  /**
   * �ендер текущего кадра
   */
  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private quality = 'high';
  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Reset quality on resize
    this.quality = 'high';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  // --- Публичные геттеры ---

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  getInput(): InputManager {
    return this.inputManager;
  }

  getAssetLoader(): AssetLoader {
    return this.assetLoader;
  }

  getSceneManager(): SceneManager {
    return this.sceneManager;
  }

  getFps(): number {
    return this.currentFps;
  }

  getDeltaTime(): number {
    return performance.now() / 1000 - this.lastTime;
  }

  getElapsedTime(): number {
    return this.totalTime;
  }
}
