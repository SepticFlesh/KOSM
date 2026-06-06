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
export function GameCanvas({ mobile }: { mobile?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const inputRef = useRef<any>(null);
  const hudSyncRef = useRef<number>(0);
  const initDoneRef = useRef(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const mobileLockedRef = useRef({ locked: false });
  const playerShipRef = useRef<any>(null);

  // Touch controls: top 3/4 = rotate, bottom 1/4 = buttons
  useEffect(() => {
    if (!mobile) return;
    const activeTouches: Record<number, { sx: number; sy: number; startY: number; zone: string; throttleStart: number }> = {};
    let throttleVal = 0.3;
    const firing = { v: false };
    let tdX = 0, tdY = 0;
    let boostActive = false;

    const zone = (x: number, y: number) => {
      if (y < window.innerHeight * 0.75) return 'rotate';
      const w = window.innerWidth;
      const s = Math.floor(x / (w / 4));
      if (s === 0) return 'boost';
      if (s === 1 || s === 2) return 'fire';
      return 'gas';
    };

    const ts = (e: TouchEvent) => {
      if (!mobileLockedRef.current.locked) return;
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const z = zone(t.clientX, t.clientY);
        activeTouches[t.identifier] = { sx: t.clientX, sy: t.clientY, startY: t.clientY, zone: z, throttleStart: throttleVal };
        if (z === 'boost') boostActive = true;
        if (z === 'fire') firing.v = true;
      }
    };
    const tm = (e: TouchEvent) => {
      if (!mobileLockedRef.current.locked) return;
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const prev = activeTouches[t.identifier];
        if (!prev) continue;
        if (prev.zone === 'rotate') {
          tdX = (t.clientX - prev.sx) * 0.12;
          tdY = (t.clientY - prev.sy) * 0.12;
        }
        if (prev.zone === 'gas') {
          // Drag up = increase, down = decrease
          throttleVal = Math.max(0, Math.min(1, prev.throttleStart - (t.clientY - prev.startY) * 0.008));
        }
        activeTouches[t.identifier] = { ...prev };
      }
    };
    const te = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const prev = activeTouches[e.changedTouches[i].identifier];
        if (prev?.zone === 'boost') boostActive = false;
        if (prev?.zone === 'fire') firing.v = false;
        if (prev?.zone === 'rotate') { tdX = 0; tdY = 0; }
        delete activeTouches[e.changedTouches[i].identifier];
      }
    };

    window.addEventListener('touchstart', ts, { passive: false });
    window.addEventListener('touchmove', tm, { passive: false });
    window.addEventListener('touchend', te);
    window.addEventListener('touchcancel', te);

    const interval = setInterval(() => {
      const ship = playerShipRef.current;
      if (!ship) return;
      (ship as any).getTouchThrottle = () => throttleVal;
      (ship as any).getTouchFiring = () => firing.v;
      (ship as any).getTouchDX = () => tdX;
      (ship as any).getTouchDY = () => tdY;
      (ship as any).getTouchBoost = () => boostActive;
    }, 200);

    return () => {
      window.removeEventListener('touchstart', ts);
      window.removeEventListener('touchmove', tm);
      window.removeEventListener('touchend', te);
      window.removeEventListener('touchcancel', te);
      clearInterval(interval);
    };
  }, [mobile]);


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
      sceneManager.createStation(new THREE.Vector3(600, 50, -400));
      sceneManager.spawnAsteroids(30);

      const camera = engine.getCamera();
      const playerShip = sceneManager.createPlayerShip(camera);
      playerShip.attachInput(engine.getInput());
      inputRef.current = engine.getInput();
      playerShipRef.current = playerShip;
      if (mobile) playerShip.mobileMode = true;

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
          playerShip.inputEnabled = false;
          sceneManager.startWarp(nextSys.seed, playerShip);
          setTimeout(() => { playerShip.inputEnabled = true; }, 5500);
          // Clear trade cache
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

      // Mining
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
          else minedGoods.push({ id: type.toLowerCase(), name: type, price: type === 'Золото' ? 350 : type === 'Уран' ? 200 : type === 'Титан' ? 80 : 25, playerQty: ore, stationQty: 0 });
          console.log(`[Mining] +${ore}t ${type}, cargo: ${gameState.cargoUsed}/${gameState.cargoMax}`);
          gameState.changeReputation('miners', 2);
        }
      };

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

      playerShip.flightModel.reset(new THREE.Vector3(600, 250, -800));

      // Spawn enemies
      sceneManager.spawnEnemies(4);

      // Ensure HUD state exists before engine starts
      if (!(window as any).__kosmHUD) {
        (window as any).__kosmHUD = { speed: 0, throttle: 0, boostEnergy: 100, shield: 100, hull: 100, flightMode: 'flight_assist', distanceToStar: 0, starName: 'Нова', fps: 60, cargoUsed: 0, cargoMax: 20, targetDist: 0 };
      }

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
      startHUDSync(engine, starPos, playerShip as any, universe);
    }

    function startHUDSync(
      eng: Engine,
      starPos: THREE.Vector3,
      ship: any,
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

        // Update global HUD ref (bypasses React state for performance)
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
            starName: univ.getCurrentSystem().name,
            fps: eng.getFps(),
            cargoUsed: gameState.cargoUsed,
            cargoMax: gameState.cargoMax,
            targetDist: (ship as any).targetDistance || 0,
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

        // Enemies
        const radarRange = gameState.getUpgradeLevel('scanner') === 1 ? 5000 :
                           gameState.getUpgradeLevel('scanner') === 2 ? 15000 :
                           gameState.getUpgradeLevel('scanner') === 3 ? 40000 : 80000;
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
        (window as any).__kosmRadarBlips = blips;

        // Map data
        if (Math.floor(Date.now() / 500) !== Math.floor((Date.now() - 100) / 500)) {
          const mapObjects: any[] = [];
          mapObjects.push({ x: 0, z: 0, r: 6, color: '#fa4', label: 'Star' });
          const ss = eng.getSceneManager().getStarSystem();
          if (ss) {
            for (const p of ss.getPlanets()) {
              const pos = p.getPosition();
              mapObjects.push({ x: pos.x, z: pos.z, r: 3, color: '#6af', label: `P` });
            }
          }
          const st = eng.getSceneManager().getStation();
          if (st) mapObjects.push({ x: st.position.x, z: st.position.z, r: 4, color: '#4f4', label: 'Station' });
          const enems = eng.getSceneManager().enemies;
          for (const e of enems) {
            mapObjects.push({ x: e.flightModel.state.position.x, z: e.flightModel.state.position.z, r: 2, color: '#f44' });
          }
          mapObjects.push({
            x: shipPos.x, z: shipPos.z, r: 3, color: '#fff', isPlayer: true,
            angle: Math.atan2(
              new THREE.Vector3(1,0,0).applyQuaternion(fm.state.orientation).z,
              new THREE.Vector3(0,0,1).applyQuaternion(fm.state.orientation).z
            ),
          });
          gameState.setMapData({ objects: mapObjects, range: 150000 });
        }

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
  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    soundManager.resume();
    const canvas = canvasRef.current;
    if (!canvas) return;
    // On mobile, just enable controls
    if (mobile) {
      setPointerLocked(true);
      mobileLockedRef.current.locked = true;
      return;
    }
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
        onTouchEnd={handleClick}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
      />
      {/* Mobile zone backgrounds (subtle, no labels) */}
      {mobile && pointerLocked && (
        <>
          <div style={{ position:'absolute',bottom:0,left:0,width:'25%',height:'25%',background:'rgba(68,170,255,0.06)',zIndex:14,pointerEvents:'none'}} />
          <div style={{ position:'absolute',bottom:0,left:'25%',width:'50%',height:'25%',background:'rgba(255,50,0,0.06)',zIndex:14,pointerEvents:'none'}} />
          <div style={{ position:'absolute',bottom:0,right:0,width:'25%',height:'25%',background:'rgba(255,170,0,0.06)',zIndex:14,pointerEvents:'none'}} />
        </>
      )}
      {!pointerLocked && (
        <div
          onClick={handleClick}
          onTouchEnd={handleClick}
          style={{
            position: 'absolute',
            top: mobile ? '15%' : '10%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#4af',
            fontSize: mobile ? '22px' : '18px',
            fontFamily: '"Courier New", monospace',
            zIndex: 20,
            textAlign: 'center',
            textShadow: '0 0 20px rgba(68,170,255,0.6)',
            opacity: 0.8,
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: mobile ? '40px' : '32px', marginBottom: '8px' }}>🖱️</div>
          {mobile ? 'TAP TO FLY' : 'CLICK TO FLY'}
        </div>
      )}
    </>
  );
}
