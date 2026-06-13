import * as THREE from 'three';
import { Engine } from '../engine/Engine';
import { Universe } from '../world/Universe';
import { ShipController } from '../gameplay/ShipController';
import { soundManager } from '../audio/SoundManager';

export type GameMode = 'single-player' | 'multiplayer';

export interface GameContext {
  engine: Engine;
  universe: Universe;
  playerShip: ShipController;
}

/**
 * Общая инициализация игры — Engine, мир, корабль.
 * Вызывается и в SP, и в MP режимах.
 */
export async function initSharedGame(
  canvas: HTMLCanvasElement,
  mode: GameMode,
  mobile: boolean,
): Promise<GameContext> {
  console.log(`[KOSM] Initializing ${mode} mode...`);

  const engine = new Engine();
  await engine.init(canvas);

  const sceneManager = engine.getSceneManager();

  // Set mode on SceneManager (controls AI/hit-detection behavior)
  sceneManager.mode = mode;

  // Direct DOM HUD for both modes
  engine.registerDirectHUD();

  // Universe — 32 star systems
  const universe = new Universe(32);
  const currentSys = universe.getCurrentSystem();

  // Star system, station, asteroids
  sceneManager.createStarSystem(currentSys.seed);
  sceneManager.createStation(new THREE.Vector3(6000, 500, -4000));
  sceneManager.spawnAsteroids(30);

  // Player ship
  const camera = engine.getCamera();
  const playerShip = sceneManager.createPlayerShip(camera);
  playerShip.attachInput(engine.getInput());
  if (mobile) playerShip.mobileMode = true;

  // Targeting callbacks (shared — both modes need nearest-enemy lookup)
  let enemyIdCounter = 0;
  const enemyIds = new WeakMap<object, number>();

  playerShip.getNearestEnemy = () => {
    const enemies = sceneManager.enemies;
    if (enemies.length === 0) return null;
    const myPos = playerShip.flightModel.state.position;
    let nearest: typeof enemies[0] | null = null;
    let nearestDist = Infinity;
    for (const e of enemies) {
      const d = e.flightModel.state.position.distanceTo(myPos);
      if (d < nearestDist) { nearestDist = d; nearest = e; }
    }
    if (!nearest) return null;
    if (!enemyIds.has(nearest)) enemyIds.set(nearest, ++enemyIdCounter);
    return { pos: nearest.flightModel.state.position, id: enemyIds.get(nearest)! };
  };

  playerShip.getEnemyById = (id: number) => {
    for (const e of sceneManager.enemies) {
      if (enemyIds.get(e) === id) return e.flightModel.state.position;
    }
    return null;
  };

  // Spawn enemies (SP mode only; MP gets enemies from server)
  if (mode === 'single-player') {
    sceneManager.spawnEnemies(4);
  }

  // Seed global HUD state
  if (!(window as any).__kosmHUD) {
    (window as any).__kosmHUD = {
      speed: 0, throttle: 0, boostEnergy: 100, shield: 100, hull: 100,
      flightMode: 'flight_assist', distanceToStar: 0, starName: 'Нова',
      fps: 60, cargoUsed: 0, cargoMax: 20, targetDist: 0,
    };
  }

  // Start engine + audio
  engine.start();
  soundManager.startEngine();

  // Position the ship
  playerShip.flightModel.reset(new THREE.Vector3(16000, 800, -4000));

  console.log('[KOSM] Shared game ready.');

  return { engine, universe, playerShip };
}
