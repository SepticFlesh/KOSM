import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { Universe } from '../world/Universe';
import type { ShipController } from '../gameplay/ShipController';
import { gameState } from '../ui/store/gameStore';
import { soundManager } from '../audio/SoundManager';

/**
 * Multiplayer mode — заглушка.
 * Будет заполнена в Фазах D-E (сетевой клиент, синхронизация, чат).
 */
export function attachMultiplayer(
  _engine: Engine,
  universe: Universe,
  playerShip: ShipController,
): () => void {
  // FTL Jump — отправить запрос на сервер (пока локально)
  playerShip.onJumpRequest = () => {
    const nextIdx = (universe.currentSystemIndex + 1) % universe.systems.length;
    const nextSys = universe.jumpTo(nextIdx);
    if (nextSys) {
      console.log('[MP] Jump request to', nextSys.name);
      playerShip.inputEnabled = false;
      _engine.getSceneManager().startWarp(nextSys.seed, playerShip);
      setTimeout(() => { playerShip.inputEnabled = true; }, 5500);
      gameState.jumpFlashTime = Date.now();
      soundManager.startMusic(nextSys.id);
    }
  };

  // Trade — запросить рынок с сервера (пока ничего)
  playerShip.onTradeRequest = () => {
    console.log('[MP] Trade request — not implemented yet');
  };

  // Mining — запросить добычу с сервера (пока ничего)
  playerShip.onMineRequest = () => {
    console.log('[MP] Mine request — not implemented yet');
  };

  return () => {
    // cleanup when exiting MP mode
  };
}

/**
 * Запускает HUD sync для MP (без автосохранения, с заглушкой).
 */
export function startMPHUDSync(
  engine: Engine,
  starPos: THREE.Vector3,
  playerShip: ShipController,
  universe: Universe,
): () => void {
  let destroyed = false;
  let lastFrame = Date.now();
  let hudSyncRef: number;

  const sync = () => {
    if (destroyed) return;
    const fm = playerShip.flightModel;
    const shipPos = fm.state.position;

    const now = Date.now();
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;

    const lastDmg = (gameState as any).lastDamageTime || 0;
    let shield = gameState.player.shield;
    if (now - lastDmg > 3000 && shield < 100) {
      shield = Math.min(100, shield + dt * 1);
    }

    const hudRef = (window as any).__kosmHUD;
    if (hudRef) {
      Object.assign(hudRef, {
        speed: fm.state.velocity.length(),
        throttle: fm.state.throttle,
        boostEnergy: fm.state.boostEnergy,
        shield,
        hull: gameState.player.hull,
        flightMode: fm.state.mode,
        distanceToStar: shipPos.distanceTo(starPos),
        starName: universe.getCurrentSystem().name,
        fps: engine.getFps(),
        cargoUsed: gameState.cargoUsed,
        cargoMax: gameState.cargoMax,
        targetDist: (playerShip as any).targetDistance || 0,
      });
    }
    soundManager.updateEngine(fm.state.throttle, fm.boostActive);

    // Radar — пока пусто (MP будет получать от сервера)
    gameState.setRadarBlips([]);
    (window as any).__kosmRadarBlips = [];

    hudSyncRef = requestAnimationFrame(sync);
  };

  hudSyncRef = requestAnimationFrame(sync);

  return () => {
    destroyed = true;
    cancelAnimationFrame(hudSyncRef);
  };
}
