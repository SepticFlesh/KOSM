import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import { initSharedGame, type GameContext } from '../game/bootstrap';
import { attachMultiplayer, startMPHUDSync, type MPContext } from '../modes/MultiplayerMode';
import { WSClient } from '../network/wsClient';
import { ChatPanel } from './ChatPanel';
import { PlayerList, type PlayerInfo } from './PlayerList';
import { soundManager } from '../audio/SoundManager';
import { loadGame } from '../utils/saveLoad';
import { gameState } from '../ui/store/gameStore';

// Server URL — override via .env
const WS_URL = import.meta.env?.VITE_WS_URL as string || 'ws://localhost:3001/ws';
const GITHUB_CLIENT_ID = import.meta.env?.VITE_GITHUB_CLIENT_ID as string || 'Ov23liVSfVq6Idg7NLgM';

/**
 * MPGameView — full multiplayer mode.
 * Connects to WebSocket server, syncs input, renders remote players.
 */
export function MPGameView({ mobile }: { mobile?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const ctxRef = useRef<GameContext | null>(null);
  const mpRef = useRef<MPContext | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const stopHudRef = useRef<(() => void) | null>(null);
  const initDoneRef = useRef(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [authState, setAuthState] = useState<'connecting' | 'authenticated' | 'error'>('connecting');
  const [authError, setAuthError] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ playerName: string; text: string; timestamp: number }>>([]);
  const [playerList, setPlayerList] = useState<PlayerInfo[]>([]);
  const wsRef = useRef<WSClient | null>(null);
  const mobileLockedRef = useRef({ locked: false });
  const playerIdRef = useRef('');

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
    let wsClient: WSClient | null = null;

    async function init() {
      // Get or request auth token
      let token = localStorage.getItem('kosm_mp_token');

      if (!token) {
        // Open GitHub OAuth popup
        const width = 600, height = 700;
        const left = window.screenX + (window.innerWidth - width) / 2;
        const top = window.screenY + (window.innerHeight - height) / 2;
        const popup = window.open(
          `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=read:user`,
          'github-oauth',
          `width=${width},height=${height},left=${left},top=${top}`
        );

        // Wait for auth message from popup
        token = await new Promise<string | null>((resolve) => {
          const handler = (e: MessageEvent) => {
            if (e.data?.type === 'kosm_auth' && e.data?.token) {
              window.removeEventListener('message', handler);
              resolve(e.data.token);
            }
          };
          window.addEventListener('message', handler);
          // Timeout after 2 minutes
          setTimeout(() => {
            window.removeEventListener('message', handler);
            resolve(null);
          }, 120000);
          // Check if popup closed
          const checkClosed = setInterval(() => {
            if (popup?.closed) {
              clearInterval(checkClosed);
              window.removeEventListener('message', handler);
              resolve(null);
            }
          }, 500);
        });

        if (token) {
          localStorage.setItem('kosm_mp_token', token);
          playerIdRef.current = localStorage.getItem('kosm_mp_player_id') || '';
        } else {
          setAuthState('error');
          setAuthError('GitHub auth cancelled or timed out');
          return;
        }
      }

      // Connect WebSocket
      wsClient = new WSClient();
      wsRef.current = wsClient;
      wsClient.connect(WS_URL, token);

      // Handle chat + trade messages
      wsClient.onMessage((msg) => {
        if (msg.type === 'chat_broadcast') {
          setChatMessages(prev => [...prev.slice(-99), msg.payload]);
        }
        if (msg.type === 'trade_menu') {
          gameState.openTrade(msg.payload.goods);
          gameState.playerCredits = msg.payload.credits;
        }
        if (msg.type === 'missions') {
          gameState.setMissions(msg.payload.missions);
        }
        if (msg.type === 'world_snapshot') {
          const myId = playerIdRef.current;
          const list: PlayerInfo[] = msg.payload.entities
            .filter((e: any) => e.ownerId && e.ownerId !== myId)
            .map((e: any) => ({
              id: e.id,
              name: `Player_${e.id.slice(0, 4)}`,
              distance: 0,
              health: e.health,
              shield: e.shield,
            }));
          setPlayerList(list);
        }
      });

      // Wait for auth_ok
      await new Promise<void>((resolve, reject) => {
        const unsub = wsClient!.onMessage((msg) => {
          if (msg.type === 'auth_ok') {
            playerIdRef.current = msg.payload.playerId;
            localStorage.setItem('kosm_mp_player_id', msg.payload.playerId);
            setAuthState('authenticated');
            unsub();
            resolve();
          } else if (msg.type === 'auth_error') {
            setAuthError(msg.payload.reason);
            setAuthState('error');
            unsub();
            reject(new Error(msg.payload.reason));
          }
        });
        setTimeout(() => {
          unsub();
          if (authState !== 'authenticated') {
            setAuthError('Connection timeout');
            setAuthState('error');
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      });

      if (destroyed) return;

      // Init shared game
      const ctx = await initSharedGame(canvas!, 'multiplayer', mobile ?? false);
      if (destroyed) return;

      ctxRef.current = ctx;
      engineRef.current = ctx.engine;

      // Attach MP networking
      const { mpCtx, cleanup } = attachMultiplayer(
        ctx.engine, ctx.universe, ctx.playerShip,
        wsClient!, playerIdRef.current,
      );
      mpRef.current = mpCtx;
      cleanupRef.current = cleanup;

      // Start MP HUD sync
      const starSystem = ctx.engine.getSceneManager().getStarSystem();
      const starPos = starSystem?.getStarPosition() ?? new THREE.Vector3();
      stopHudRef.current = startMPHUDSync(ctx.engine, starPos, ctx.playerShip, ctx.universe);

      // Music
      soundManager.startMusic(ctx.universe.getCurrentSystem().id);

      // Load saved credits/cargo
      const saved = loadGame();
      if (saved) {
        gameState.loadProgress(saved.credits, saved.cargoUsed, saved.missionProgress || {});
      }

      console.log('[MP] Multiplayer ready. Player:', playerIdRef.current);
    }

    init().catch((err) => {
      console.error('[MP] Init failed:', err);
      if (!authError) {
        setAuthError(err.message || 'Connection failed');
        setAuthState('error');
      }
    });

    return () => {
      destroyed = true;
      stopHudRef.current?.();
      cleanupRef.current?.();
      wsClient?.disconnect();
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

  // Auth error screen
  if (authState === 'error') {
    return (
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,5,15,0.95)', color: '#f44', fontFamily: '"Courier New", monospace',
        zIndex: 50,
      }}>
        <div style={{ fontSize: 24, marginBottom: 16 }}>Connection Error</div>
        <div style={{ color: '#f88', marginBottom: 24, fontSize: 14 }}>{authError}</div>
        <button onClick={() => window.location.reload()} style={{
          background: '#522', color: '#f44', border: '1px solid #f44',
          padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
        }}>Retry</button>
      </div>
    );
  }

  // Connecting screen
  if (authState === 'connecting') {
    return (
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,5,15,0.95)', color: '#fa4', fontFamily: '"Courier New", monospace',
        zIndex: 50,
      }}>
        <div style={{ fontSize: 24, marginBottom: 16 }}>Connecting...</div>
        <div style={{ color: '#f84', fontSize: 14 }}>Authenticating via GitHub</div>
        {!localStorage.getItem('kosm_mp_token') && (
          <div style={{ color: '#f84', fontSize: 12, marginTop: 8 }}>A popup window should open — please allow it</div>
        )}
      </div>
    );
  }

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
      <PlayerList players={playerList} visible={authState === 'authenticated'} />
      <ChatPanel
        messages={chatMessages}
        onSend={(text) => wsRef.current?.send({ type: 'chat_message', payload: { text } })}
        visible={authState === 'authenticated'}
      />
    </>
  );
}
