import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Engine } from '../engine/Engine';
import { initSharedGame, type GameContext } from '../game/bootstrap';
import { attachMultiplayer, startMPHUDSync } from '../modes/MultiplayerMode';
import { soundManager } from '../audio/SoundManager';
import { loadGame } from '../utils/saveLoad';
import { gameState } from '../ui/store/gameStore';

/**
 * MPGameView — multiplayer mode wrapper.
 * Инициализирует общий мир + MP-заглушку.
 */
export function MPGameView({ mobile }: { mobile?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const ctxRef = useRef<GameContext | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const stopHudRef = useRef<(() => void) | null>(null);
  const initDoneRef = useRef(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const mobileLockedRef = useRef({ locked: false });

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
      const ctx = await initSharedGame(canvas!, 'multiplayer', mobile ?? false);
      if (destroyed) return;
      ctxRef.current = ctx;
      engineRef.current = ctx.engine;

      // Attach MP callbacks
      cleanupRef.current = attachMultiplayer(ctx.engine, ctx.universe, ctx.playerShip);

      // Start MP HUD sync
      const starSystem = ctx.engine.getSceneManager().getStarSystem();
      const starPos = starSystem?.getStarPosition() ?? new THREE.Vector3();
      stopHudRef.current = startMPHUDSync(ctx.engine, starPos, ctx.playerShip, ctx.universe);

      // Start music
      const currentSys = ctx.universe.getCurrentSystem();
      soundManager.startMusic(currentSys.id);

      // Load saved credits/cargo (shared with SP via localStorage)
      const saved = loadGame();
      if (saved) {
        gameState.loadProgress(saved.credits, saved.cargoUsed, saved.missionProgress || {});
      }

      console.log('[MP] Multiplayer mode ready (stub)');
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
      {!pointerLocked && (
        <div
          onClick={handleClick}
          onTouchEnd={handleClick}
          style={{
            position: 'absolute', top: mobile ? '15%' : '10%', left: '50%',
            transform: 'translate(-50%, -50%)', color: '#fa4',
            fontSize: mobile ? '22px' : '18px',
            fontFamily: '"Courier New", monospace', zIndex: 20, textAlign: 'center',
            textShadow: '0 0 20px rgba(255,170,68,0.6)', opacity: 0.8, cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: mobile ? '40px' : '32px', marginBottom: '8px' }}>🌐</div>
          {mobile ? 'TAP TO FLY' : 'CLICK TO FLY'}
        </div>
      )}
    </>
  );
}
