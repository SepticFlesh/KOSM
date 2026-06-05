import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Engine } from '../engine/Engine';
import { gameState } from '../ui/store/gameStore';
import { TradeSystem } from '../gameplay/TradeSystem';
import { soundManager } from '../audio/SoundManager';
import { MissionSystem } from '../gameplay/MissionSystem';
import { generateEvents, applyEvents } from '../gameplay/EconomyEvents';
import { getStoryStep, createStoryMission } from '../gameplay/StoryMissions';
import { loadGame, saveGame } from '../utils/saveLoad';
import { Universe } from '../world/Universe';

/**
 * Компонент-обёртка для игрового canvas.
 * Инициализирует движок, управляет pointer lock для Elite-style контроля.
 */
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const hudSyncRef = useRef<number>(0);
  const initDoneRef = useRef(false);
  const [pointerLocked, setPointerLocked] = useState(false);

  const { openTrade, closeTrade } = gameState;

  // Отслеживаем pointer lock
  useEffect(() => {
    const onChange = () => {
      setPointerLocked(document.pointerLockElement === canvasRef.current);
    };
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || initDoneRef.current) return;
    initDoneRef.current = true;

    // Авто-фокус на canvas
    canvas.focus();

    let engine: Engine | null = null;
    let destroyed = false;

    async function init() {
      engine = new Engine();
      engineRef.current = engine;

      console.log('[KOSM] Initializing...');
      await engine.init(canvas!);

      if (destroyed) {
        engine.stop();
        return;
      }

      const sceneManager = engine.getSceneManager();
      // Universe
      const universe = new Universe(5);
      const currentSys = universe.getCurrentSystem();

      const starSystem = sceneManager.createStarSystem(currentSys.seed);

      // Space station near the star
      sceneManager.createStation(new THREE.Vector3(200, 50, -100));
      sceneManager.spawnAsteroids(15);

      const camera = engine.getCamera();
      const playerShip = sceneManager.createPlayerShip(camera);
      playerShip.attachInput(engine.getInput());

      // Автонаведение: колбэки для поиска врагов
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
        // Присвоить ID если нет
        if (!enemyIds.has(nearest)) enemyIds.set(nearest, ++enemyIdCounter);
        return { pos: nearest.flightModel.state.position, id: enemyIds.get(nearest)! };
      };

      playerShip.getEnemyById = (id: number) => {
        for (const e of sceneManager.enemies) {
          if (enemyIds.get(e) === id) return e.flightModel.state.position;
        }
        return null;
      };

      // Trade system
      const tradeSystem = new TradeSystem(42);
      // Trade + Mission system
      const missionSystem = new MissionSystem();
      let tradeGoodsCache: any[] | null = null;
      const minedGoods: any[] = [];

      // FTL Jump
      playerShip.onJumpRequest = () => {
        const nextIdx = (universe.currentSystemIndex + 1) % universe.systems.length;
        const nextSys = universe.jumpTo(nextIdx);
        if (nextSys) {
          sceneManager.switchSystem(nextSys.seed, playerShip);
          // Clear trade cache
          tradeGoodsCache = null;
          console.log('[FTL] Jumped to', nextSys.name);
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

      // Mining
      playerShip.onMineRequest = () => {
        const mining = sceneManager.mining;
        if (mining) {
          const nearest = mining.findNearest(playerShip.flightModel.state.position, 100);
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
          else minedGoods.push({ id: type.toLowerCase(), name: type, price: type === 'Золото' ? 350 : type === 'Уран' ? 200 : type === 'Титан' ? 80 : 25, playerQty: ore, stationQty: 0 });
          console.log(`[Mining] +${ore}t ${type}, cargo: ${gameState.cargoUsed}/${gameState.cargoMax}`);
          gameState.changeReputation('miners', 2);
        }
      };

      playerShip.onTradeRequest = () => {
        const station = sceneManager.getStation();
        if (!station) return;
        const dist = playerShip.flightModel.state.position.distanceTo(station.position);
        if (dist < 50) {
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
            // Add story mission if active
            const step = gameState.getStoryStep();
            if (step >= 1 && step <= 4) {
              const storyDef = getStoryStep(step - 1);
              if (storyDef) {
                missions.unshift(createStoryMission(storyDef, 100 + step));
              }
            }
            gameState.setMissions(missions);
            gameState.setStationTab('trade');
            // Story: complete delivery if on step 4 (return to station)
            if (gameState.getStoryStep() === 4) {
              const missions = gameState.missions;
              const storyM = missions.find(m => m.id === 104);
              if (storyM && !storyM.completed) {
                gameState.completeMission(104);
                gameState.advanceStory();
              }
            }
            // Sync mined goods after market closes (only wrap once)
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

      // Track kills for missions and reputation
      const origUpdate = sceneManager.update.bind(sceneManager);
      let prevEnemyCount = sceneManager.enemies.length;
      sceneManager.update = function(dt: number, elapsed: number) {
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
                // Story progression
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

      playerShip.flightModel.reset(new THREE.Vector3(0, 100, 300));

      // Spawn enemies
      sceneManager.spawnEnemies(4);

      engine.start();
      soundManager.startEngine();
      soundManager.startMusic(currentSys.id);

      // Load saved progress
      const saved = loadGame();
      if (saved) {
        gameState.loadProgress(saved.credits, saved.cargoUsed, saved.missionProgress || {});
        console.log('[KOSM] Save loaded:', saved.credits, 'Cr');
      } else {
        console.log('[KOSM] New game — no save found');
      }

      console.log('[KOSM] Ready. Click to lock mouse, Esc to release.');

      const starPos = starSystem.getStarPosition();
      startHUDSync(engine, starPos, playerShip, universe);
    }

    function startHUDSync(
      eng: Engine,
      starPos: THREE.Vector3,
      ship: ReturnType<typeof eng.getSceneManager>['getPlayerShip'],
      univ: Universe
    ) {
      let lastSave = Date.now();
      let lastFrame = Date.now();
      const sync = () => {
        if (destroyed || !ship) return;
        const fm = ship.flightModel;
        const shipPos = fm.state.position;

        // Calculate dt for this frame
        const now = Date.now();
        const dt = Math.min((now - lastFrame) / 1000, 0.1);
        lastFrame = now;

        // Shield regen: +1/sec after 3s of no damage
        const lastDmg = (gameState as any).lastDamageTime || 0;
        let shield = gameState.player.shield;
        if (now - lastDmg > 3000 && shield < 100) {
          shield = Math.min(100, shield + dt * 1);
        }

        gameState.updatePlayer({
          speed: fm.state.velocity.length(),
          throttle: fm.state.throttle,
          boostEnergy: fm.state.boostEnergy,
          shield,
          flightMode: fm.state.mode,
          distanceToStar: shipPos.distanceTo(starPos),
          starName: univ.getCurrentSystem().name,
          fps: eng.getFps(),
          cargoUsed: gameState.cargoUsed,
          cargoMax: gameState.cargoMax,
          targetDist: (ship as any).targetDistance || 0,
          targetHealth: (ship as any).targetHealth || 0,
        });
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

        // Enemies
        const radarRange = gameState.getUpgradeLevel('scanner') === 1 ? 500 :
                           gameState.getUpgradeLevel('scanner') === 2 ? 800 :
                           gameState.getUpgradeLevel('scanner') === 3 ? 1200 : 2000;
        for (const e of eng.getSceneManager().enemies) {
          const rel = e.flightModel.state.position.clone().sub(shipPos);
          const dist = rel.length();
          const scale = Math.min(dist / radarRange, 1.0);
          const fwd = new THREE.Vector3(0,0,1).applyQuaternion(fm.state.orientation);
          const rgt = new THREE.Vector3(1,0,0).applyQuaternion(fm.state.orientation);
          const up = new THREE.Vector3(0,1,0).applyQuaternion(fm.state.orientation);
          blips.push({
            x: Math.max(-1, Math.min(1, rel.dot(rgt) / Math.max(dist, 0.01) * scale)),
            y: Math.max(-1, Math.min(1, rel.dot(fwd) / Math.max(dist, 0.01) * scale)),
            height: Math.max(-1, Math.min(1, rel.dot(up) / Math.max(dist, 0.01) * scale)),
            health: e.health / e.maxHealth,
            type: 'enemy',
          });
        }

        // Station
        const st = eng.getSceneManager().getStation();
        if (st) {
          const rel = st.position.clone().sub(shipPos);
          const dist = rel.length();
          const scale = Math.min(dist / radarRange, 1.0);
          const fwd = new THREE.Vector3(0,0,1).applyQuaternion(fm.state.orientation);
          const rgt = new THREE.Vector3(1,0,0).applyQuaternion(fm.state.orientation);
          const up = new THREE.Vector3(0,1,0).applyQuaternion(fm.state.orientation);
          blips.push({
            x: Math.max(-1, Math.min(1, rel.dot(rgt) / Math.max(dist, 0.01) * scale)),
            y: Math.max(-1, Math.min(1, rel.dot(fwd) / Math.max(dist, 0.01) * scale)),
            height: Math.max(-1, Math.min(1, rel.dot(up) / Math.max(dist, 0.01) * scale)),
            health: 1,
            type: 'station',
          });
        }
        gameState.setRadarBlips(blips);

        hudSyncRef.current = requestAnimationFrame(sync);
      };
      hudSyncRef.current = requestAnimationFrame(sync);
    }

    init();

    return () => {
      destroyed = true;
      cancelAnimationFrame(hudSyncRef.current);
      if (engine) {
        engine.stop();
        engineRef.current = null;
      }
      initDoneRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Клик по canvas → захват мыши для управления кораблём
  const handleClick = () => {
    soundManager.resume();
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!document.pointerLockElement) {
      canvas.requestPointerLock();
    }
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        id="game-canvas"
        tabIndex={0}
        autoFocus
        onClick={handleClick}
      />
      {/* Подсказка пока мышь не захвачена — кликабельна */}
      {!pointerLocked && (
        <div
          onClick={handleClick}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#4af',
            fontSize: '18px',
            fontFamily: '"Courier New", monospace',
            zIndex: 20,
            textAlign: 'center',
            textShadow: '0 0 20px rgba(68,170,255,0.6)',
            opacity: 0.8,
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🖱️</div>
          CLICK TO FLY
        </div>
      )}
    </>
  );
}
