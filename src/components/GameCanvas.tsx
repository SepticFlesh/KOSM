import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Engine } from '../engine/Engine';
import { ShipController } from '../gameplay/ShipController';
import { initSharedGame, type GameContext } from '../game/bootstrap';
import { attachSinglePlayer, startSPHUDSync } from '../modes/SinglePlayerMode';
import { soundManager } from '../audio/SoundManager';
import { loadGame } from '../utils/saveLoad';
import { gameState } from '../ui/store/gameStore';
import { SystemMapOverlay } from './SystemMapOverlay';

/**
 * GameCanvas — Single Player mode.
 * Инициализирует мир через bootstrap, навешивает SP-колбэки, запускает HUD.
 */
export function GameCanvas({ mobile }: { mobile?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const ctxRef = useRef<GameContext | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const stopHudRef = useRef<(() => void) | null>(null);
  const initDoneRef = useRef(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const mobileLockedRef = useRef({ locked: false });
  const playerShipRef = useRef<ShipController | null>(null);

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

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('touchstart', ts, { passive: false });
    canvas.addEventListener('touchmove', tm, { passive: false });
    canvas.addEventListener('touchend', te);
    canvas.addEventListener('touchcancel', te);

    const interval = setInterval(() => {
      const ship = playerShipRef.current;
      if (!ship) return;
      ship.getTouchThrottle = () => throttleVal;
      ship.getTouchFiring = () => firing.v;
      ship.getTouchDX = () => tdX;
      ship.getTouchDY = () => tdY;
      ship.getTouchBoost = () => boostActive;
    }, 200);

    return () => {
      canvas.removeEventListener('touchstart', ts);
      canvas.removeEventListener('touchmove', tm);
      canvas.removeEventListener('touchend', te);
      canvas.removeEventListener('touchcancel', te);
      clearInterval(interval);
    };
  }, [mobile]);

  // Pointer lock tracking
  useEffect(() => {
    const onChange = () => {
      setPointerLocked(document.pointerLockElement === canvasRef.current);
    };
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  // Main init
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || initDoneRef.current) return;
    initDoneRef.current = true;
    canvas.focus();

    let destroyed = false;

    async function init() {
      const ctx = await initSharedGame(canvas!, 'single-player', mobile ?? false);
      if (destroyed) return;

      ctxRef.current = ctx;
      engineRef.current = ctx.engine;
      playerShipRef.current = ctx.playerShip;

      // Attach SP systems: trade, missions, mining, story, save/load
      cleanupRef.current = attachSinglePlayer(ctx.engine, ctx.universe, ctx.playerShip);

      // Start SP HUD sync (radar, map, autosave, shield regen)
      const starSystem = ctx.engine.getSceneManager().getStarSystem();
      const starPos = starSystem?.getStarPosition() ?? new THREE.Vector3();
      stopHudRef.current = startSPHUDSync(ctx.engine, starPos, ctx.playerShip, ctx.universe);

      // Start music
      const currentSys = ctx.universe.getCurrentSystem();
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
    }

    init();

    return () => {
      destroyed = true;
      stopHudRef.current?.();
      cleanupRef.current?.();
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
      }
      initDoneRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    soundManager.resume();
    if (mobile) {
      setPointerLocked(true);
      mobileLockedRef.current.locked = true;
      return;
    }
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
        onTouchEnd={handleClick}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
      />
      {/* Mobile zone backgrounds */}
      {mobile && pointerLocked && (
        <>
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '25%', height: '25%', background: 'rgba(68,170,255,0.06)', zIndex: 14, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 0, left: '25%', width: '50%', height: '25%', background: 'rgba(255,50,0,0.06)', zIndex: 14, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '25%', height: '25%', background: 'rgba(255,170,0,0.06)', zIndex: 14, pointerEvents: 'none' }} />
        </>
      )}
      <SystemMapOverlay visible={true} />
      {!pointerLocked && (
        <div
          onClick={handleClick}
          onTouchEnd={handleClick}
          style={{
            position: 'absolute', top: mobile ? '15%' : '10%', left: '50%',
            transform: 'translate(-50%, -50%)', color: '#4af',
            fontSize: mobile ? '22px' : '18px',
            fontFamily: '"Courier New", monospace', zIndex: 20, textAlign: 'center',
            textShadow: '0 0 20px rgba(68,170,255,0.6)', opacity: 0.8, cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: mobile ? '40px' : '32px', marginBottom: '8px' }}>🖱️</div>
          {mobile ? 'TAP TO FLY' : 'CLICK TO FLY'}
        </div>
      )}
    </>
  );
}
