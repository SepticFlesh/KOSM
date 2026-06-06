import * as THREE from 'three';
import { SceneManager } from './SceneManager';
import { InputManager } from './InputManager';
import { AssetLoader } from './AssetLoader';
import { Starfield } from './rendering/Starfield';

/**
 * Главный игровой цикл.
 * Управляет рендером, сценой и симуляцией.
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
   * Инициализация рендерера, сцены и звёздного неба.
   */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    // Настройка рендерера
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    const p = this.canvas?.parentElement;
    this.renderer.setSize(p?.clientWidth || window.innerWidth, p?.clientHeight || window.innerHeight);
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

    // Direct HUD update
    const ship = this.sceneManager.getPlayerShip();
    if (!ship) return;
    const fm = ship.flightModel;
    const spd = fm.state.velocity.length();
    const thr = fm.state.throttle;
    const bst = fm.state.boostEnergy;
    const mode = fm.state.mode;
    const pos = fm.state.position;
    const starDist = Math.sqrt(pos.x*pos.x + pos.y*pos.y + pos.z*pos.z);

    const setText = (id: string, text: string) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const setStyle = (id: string, prop: string, val: string) => { const el = document.getElementById(id); if (el) (el as any).style[prop] = val; };
    const setDisplay = (id: string, show: boolean) => { const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; };

    setText('hud-speed', Math.round(spd).toLocaleString());
    setText('hud-fps', this.currentFps + ' FPS');
    setText('hud-thrval', Math.round(thr * 100) + '%');
    setText('hud-bstval', Math.round(bst) + '%');
    setStyle('hud-thr', 'height', (thr * 100) + '%');
    setStyle('hud-bst', 'height', bst + '%');
    setStyle('hud-shield', 'width', '100%');
    setText('hud-shieldval', '100%');
    setStyle('hud-hull', 'width', '100%');
    setText('hud-hullval', '100%');
    setText('hud-dist', 'STAR: ' + Math.round(starDist).toLocaleString() + ' M');

    const modeLabel = mode === 'flight_assist' ? 'ASSIST' : mode === 'cruise' ? 'CRUISE' : 'REAL';
    const modeColor = mode === 'flight_assist' ? '#4af' : mode === 'cruise' ? '#fa4' : '#f44';
    const modeEl = document.getElementById('hud-mode');
    if (modeEl) { modeEl.textContent = modeLabel; (modeEl as any).style.color = modeColor; (modeEl as any).style.borderColor = modeColor; }

    // Target distance
    const tgtDist = (ship as any).targetDistance || 0;
    setDisplay('hud-target', tgtDist > 0);
    if (tgtDist > 0) setText('hud-target', 'TARGET: ' + Math.round(tgtDist) + ' M');

    // Damage/hit flash
    const now2 = Date.now();
    const dmgEl = document.getElementById('hud-dmg');
    if (dmgEl) {
      const show = (window as any).__kosmLastDmg && now2 - (window as any).__kosmLastDmg < 200;
      dmgEl.style.display = show ? '' : 'none';
      if (show) dmgEl.style.background = 'rgba(255,0,0,0.4)';
    }
    const hitEl = document.getElementById('hud-hit');
    if (hitEl) {
      const show = (window as any).__kosmLastHit && now2 - (window as any).__kosmLastHit < 150;
      hitEl.style.display = show ? '' : 'none';
    }


    // FPS counter + adaptive quality
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 1000) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      // Adaptive quality (skip on mobile)
      if (window.innerWidth >= 768) {
        if (this.currentFps < 25) {
          this.renderer.setPixelRatio(0.75);
        } else if (this.currentFps < 40) {
          this.renderer.setPixelRatio(1.0);
        } else {
          this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        }
      }
    }
  }

  /**
   * Рендер текущего кадра
   */
  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const pw = this.canvas?.parentElement;
    this.camera.aspect = (pw?.clientWidth || window.innerWidth) / (pw?.clientHeight || window.innerHeight);
    this.camera.updateProjectionMatrix();
    const p = this.canvas?.parentElement;
    this.renderer.setSize(p?.clientWidth || window.innerWidth, p?.clientHeight || window.innerHeight);
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
