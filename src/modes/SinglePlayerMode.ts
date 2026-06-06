import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { Universe } from '../world/Universe';
import type { ShipController } from '../gameplay/ShipController';
import { TradeSystem } from '../gameplay/TradeSystem';
import { MissionSystem } from '../gameplay/MissionSystem';
import { generateEvents, applyEvents } from '../gameplay/EconomyEvents';
import { getStoryStep, createStoryMission } from '../gameplay/StoryMissions';
import { saveGame } from '../utils/saveLoad';
import { gameState } from '../ui/store/gameStore';
import { soundManager } from '../audio/SoundManager';

/**
 * Single Player mode — навешивает на корабль SP-колбэки
 * (торговля, миссии, FTL-прыжки, добыча, сохранения).
 */
export function attachSinglePlayer(
  engine: Engine,
  universe: Universe,
  playerShip: ShipController,
): () => void {
  const sceneManager = engine.getSceneManager();

  // Trade system
  const tradeSystem = new TradeSystem(42);
  const missionSystem = new MissionSystem();
  let tradeGoodsCache: any[] | null = null;
  const minedGoods: any[] = [];

  // FTL Jump — локальный переход между системами
  playerShip.onJumpRequest = () => {
    const nextIdx = (universe.currentSystemIndex + 1) % universe.systems.length;
    const nextSys = universe.jumpTo(nextIdx);
    if (nextSys) {
      playerShip.inputEnabled = false;
      sceneManager.startWarp(nextSys.seed, playerShip);
      setTimeout(() => { playerShip.inputEnabled = true; }, 5500);
      tradeGoodsCache = null;
      console.log('[FTL] Jumped to', nextSys.name);
      gameState.jumpFlashTime = Date.now();
      soundManager.startMusic(nextSys.id);
      // Story: complete delivery if on step 2
      if (gameState.getStoryStep() === 2) {
        const missions = gameState.missions;
        const storyM = missions.find(m => m.id === 102);
        if (storyM && !storyM.completed) {
          gameState.completeMission(102);
          gameState.advanceStory();
        }
      }
    }
  };

  // Mining — локальная добыча
  playerShip.onMineRequest = () => {
    const mining = sceneManager.mining;
    if (mining) {
      const nearest = mining.findNearest(playerShip.flightModel.state.position, 200);
      playerShip.mineBeamTarget = nearest ? nearest.position : null;
    }
    const result = sceneManager.mineAsteroid(
      playerShip.flightModel.state.position, 0.016
    );
    if (result.destroyed) {
      playerShip.mineBeamTarget = null;
    }
    if (result.destroyed && result.ore) {
      const ore = result.ore!;
      const type = result.type!;
      gameState.cargoUsed = Math.min(gameState.cargoMax, gameState.cargoUsed + ore);
      const existing = minedGoods.find((g: any) => g.name === type);
      if (existing) existing.playerQty += ore;
      else minedGoods.push({
        id: type.toLowerCase(), name: type,
        price: type === 'Золото' ? 350 : type === 'Уран' ? 200 : type === 'Титан' ? 80 : 25,
        playerQty: ore, stationQty: 0,
      });
      console.log(`[Mining] +${ore}t ${type}, cargo: ${gameState.cargoUsed}/${gameState.cargoMax}`);
      gameState.changeReputation('miners', 2);
    }
  };

  // Trade — открыть рынок у станции
  playerShip.onTradeRequest = () => {
    const station = sceneManager.getStation();
    if (!station) return;
    const dist = playerShip.flightModel.state.position.distanceTo(station.position);
    if (dist < 15000) {
      if (gameState.tradeOpen) {
        gameState.closeTrade();
      } else {
        if (!tradeGoodsCache) {
          const baseGoods = tradeSystem.generateMarket();
          const events = generateEvents(universe.getCurrentSystem().seed);
          tradeGoodsCache = applyEvents(baseGoods, events);
        }
        // Merge mined goods
        const merged = tradeGoodsCache.map((g: any) => {
          const m = minedGoods.find((x: any) => x.name === g.name);
          return m ? { ...g, playerQty: m.playerQty } : g;
        });
        for (const m of minedGoods) {
          if (!merged.find((g: any) => g.name === m.name)) merged.push({ ...m, stationQty: 0 });
        }
        gameState.openTrade(merged);
        const missions = missionSystem.generateMissions();
        const step = gameState.getStoryStep();
        if (step >= 1 && step <= 4) {
          const storyDef = getStoryStep(step - 1);
          if (storyDef) {
            missions.unshift(createStoryMission(storyDef, 100 + step));
          }
        }
        gameState.setMissions(missions);
        gameState.setStationTab('trade');
        // Story: complete delivery if on step 4
        if (gameState.getStoryStep() === 4) {
          const ms = gameState.missions;
          const storyM = ms.find(m => m.id === 104);
          if (storyM && !storyM.completed) {
            gameState.completeMission(104);
            gameState.advanceStory();
          }
        }
        // Sync mined goods after market closes
        if (!(gameState as any)._closeWrapped) {
          (gameState as any)._closeWrapped = true;
          const origClose = gameState.closeTrade;
          gameState.closeTrade = () => {
            for (const m of minedGoods) {
              const g = gameState.tradeGoods.find((x: any) => x.name === m.name);
              if (g) m.playerQty = g.playerQty;
            }
            origClose();
          };
        }
      }
    }
  };

  // Track kills for missions + reputation + enemy respawn
  const origUpdate = sceneManager.update.bind(sceneManager);
  let prevEnemyCount = sceneManager.enemies.length;
  sceneManager.update = function (dt: number, elapsed: number) {
    origUpdate(dt, elapsed);
    const kills = prevEnemyCount - this.enemies.length;
    prevEnemyCount = this.enemies.length;
    if (kills > 0) {
      gameState.changeReputation('federation', 10 * kills);
      gameState.changeReputation('traders', 5 * kills);
      gameState.missions.forEach(m => {
        if (m.type === 'destroy' && !m.completed) {
          const np = m.progress + kills;
          gameState.updateMissionProgress(m.id, np);
          if (np >= m.target) {
            gameState.completeMission(m.id);
            if (m.id >= 100 && m.id <= 104) gameState.advanceStory();
          }
        }
      });
    }
    // Respawn enemies after 15s if all dead
    if (this.enemies.length === 0 && !(this as any)._respawnTimer) {
      (this as any)._respawnTimer = setTimeout(() => {
        this.spawnEnemies(4);
        (this as any)._respawnTimer = null;
      }, 15000);
    }
  };

  return () => {
    // Cleanup: restore original sceneManager.update
    sceneManager.update = origUpdate;
  };
}

/**
 * Запускает HUD sync и автосохранение для SP.
 */
export function startSPHUDSync(
  engine: Engine,
  starPos: THREE.Vector3,
  playerShip: ShipController,
  universe: Universe,
): () => void {
  let destroyed = false;
  let lastSave = Date.now();
  let lastFrame = Date.now();
  let hudSyncRef: number;

  const sync = () => {
    if (destroyed) return;
    const fm = playerShip.flightModel;
    const shipPos = fm.state.position;

    const now = Date.now();
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;

    // Shield regen: +1/sec after 3s of no damage
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

    // Autosave every 10s
    const saveNow = Date.now();
    if (saveNow - lastSave >= 10000) {
      lastSave = saveNow;
      saveGame({
        credits: gameState.playerCredits,
        cargoUsed: gameState.cargoUsed,
        missionProgress: Object.fromEntries(
          gameState.missions.map(m => [m.id, { progress: m.progress, completed: m.completed }])
        ),
        timestamp: saveNow,
      });
    }

    // Radar blips
    const blips: Array<{ x: number; y: number; height: number; health: number; type: 'enemy' | 'station' }> = [];
    const radarRange = gameState.getUpgradeLevel('scanner') === 1 ? 5000 :
      gameState.getUpgradeLevel('scanner') === 2 ? 15000 :
        gameState.getUpgradeLevel('scanner') === 3 ? 40000 : 80000;

    for (const e of engine.getSceneManager().enemies) {
      const rel = e.flightModel.state.position.clone().sub(shipPos);
      const dist = rel.length();
      const scale = Math.min(dist / radarRange, 1.0);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fm.state.orientation);
      const rgt = new THREE.Vector3(1, 0, 0).applyQuaternion(fm.state.orientation);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(fm.state.orientation);
      blips.push({
        x: Math.max(-1, Math.min(1, rel.dot(rgt) / Math.max(dist, 0.01) * scale)),
        y: Math.max(-1, Math.min(1, rel.dot(fwd) / Math.max(dist, 0.01) * scale)),
        height: Math.max(-1, Math.min(1, rel.dot(up) / Math.max(dist, 0.01) * scale)),
        health: e.health / e.maxHealth,
        type: 'enemy',
      });
    }

    const st = engine.getSceneManager().getStation();
    if (st) {
      const rel = st.position.clone().sub(shipPos);
      const dist = rel.length();
      const scale = Math.min(dist / radarRange, 1.0);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fm.state.orientation);
      const rgt = new THREE.Vector3(1, 0, 0).applyQuaternion(fm.state.orientation);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(fm.state.orientation);
      blips.push({
        x: Math.max(-1, Math.min(1, rel.dot(rgt) / Math.max(dist, 0.01) * scale)),
        y: Math.max(-1, Math.min(1, rel.dot(fwd) / Math.max(dist, 0.01) * scale)),
        height: Math.max(-1, Math.min(1, rel.dot(up) / Math.max(dist, 0.01) * scale)),
        health: 1,
        type: 'station',
      });
    }
    gameState.setRadarBlips(blips);
    (window as any).__kosmRadarBlips = blips;

    // Map data every 500ms
    if (Math.floor(Date.now() / 500) !== Math.floor((Date.now() - 100) / 500)) {
      const mapObjects: any[] = [];
      mapObjects.push({ x: 0, z: 0, r: 6, color: '#fa4', label: 'Star' });
      const ss = engine.getSceneManager().getStarSystem();
      if (ss) {
        for (const p of ss.getPlanets()) {
          const pos = p.getPosition();
          mapObjects.push({ x: pos.x, z: pos.z, r: 3, color: '#6af', label: 'P' });
        }
      }
      const station = engine.getSceneManager().getStation();
      if (station) mapObjects.push({ x: station.position.x, z: station.position.z, r: 4, color: '#4f4', label: 'Station' });
      const enems = engine.getSceneManager().enemies;
      for (const e of enems) {
        mapObjects.push({ x: e.flightModel.state.position.x, z: e.flightModel.state.position.z, r: 2, color: '#f44' });
      }
      mapObjects.push({
        x: shipPos.x, z: shipPos.z, r: 3, color: '#fff', isPlayer: true,
        angle: Math.atan2(
          new THREE.Vector3(1, 0, 0).applyQuaternion(fm.state.orientation).z,
          new THREE.Vector3(0, 0, 1).applyQuaternion(fm.state.orientation).z
        ),
      });
      gameState.setMapData({ objects: mapObjects, range: 150000 });
    }

    hudSyncRef = requestAnimationFrame(sync);
  };

  hudSyncRef = requestAnimationFrame(sync);

  return () => {
    destroyed = true;
    cancelAnimationFrame(hudSyncRef);
  };
}
