import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { Universe } from '../world/Universe';
import type { ShipController } from '../gameplay/ShipController';
import type { WSClient } from '../network/wsClient';
import { InputSync } from '../network/inputSync';
import { EntityInterpolator } from '../network/entityInterpolation';
import { RemotePlayer } from '../gameplay/RemotePlayer';
import type { WorldSnapshot, ServerMessage } from '../network/protocol';
import { soundManager } from '../audio/SoundManager';
import { gameState } from '../ui/store/gameStore';

export interface MPContext {
  ws: WSClient;
  inputSync: InputSync;
  interpolator: EntityInterpolator;
  remotePlayers: Map<string, RemotePlayer>;
  playerId: string;
}

/**
 * Multiplayer mode — навешивает сетевые колбэки на корабль,
 * управляет RemotePlayers, обрабатывает серверные снапшоты.
 */
export function attachMultiplayer(
  engine: Engine,
  universe: Universe,
  playerShip: ShipController,
  ws: WSClient,
  playerId: string,
): { mpCtx: MPContext; cleanup: () => void } {
  const scene = engine.getScene();
  const sceneManager = engine.getSceneManager();
  const inputSync = new InputSync(ws, playerShip.flightModel);
  const interpolator = new EntityInterpolator();
  const remotePlayers = new Map<string, RemotePlayer>();
  let fireActive = false;
  let mineActive = false;

  // Track fire/mine state from weapon system
  const origFire = playerShip.weaponSystem.fire.bind(playerShip.weaponSystem);
  playerShip.weaponSystem.fire = function (...args: any[]) {
    fireActive = true;
    setTimeout(() => { fireActive = false; }, 100);
    return (origFire as any).apply(playerShip.weaponSystem, args);
  };

  // FTL Jump — send to server
  playerShip.onJumpRequest = () => {
    const nextIdx = (universe.currentSystemIndex + 1) % universe.systems.length;
    universe.jumpTo(nextIdx);
    ws.send({ type: 'jump_request', payload: { targetSystem: nextIdx } });
  };

  // Trade — запросить рынок с сервера (Phase E)
  playerShip.onTradeRequest = () => {
    console.log('[MP] Trade — not yet implemented');
  };

  // Mining — запросить с сервера (Phase E)
  playerShip.onMineRequest = () => {
    mineActive = true;
  };

  // Handle server messages
  const unsub = ws.onMessage((msg: ServerMessage) => {
    switch (msg.type) {
      case 'world_snapshot': {
        const snap = msg.payload as WorldSnapshot;
        // Reconcile local player
        const myState = inputSync.getPlayerState(playerId, snap);
        if (myState) {
          inputSync.reconcile(myState);
        }

        // Feed interpolator
        const remoteEntities = snap.entities.filter(e => e.id !== playerId);
        interpolator.addSnapshot(remoteEntities, snap.timestamp / 1000);

        // Update remote entities (players + NPCs)
        const activeIds = new Set(remoteEntities.map(e => e.id));
        for (const e of remoteEntities) {
          const interp = interpolator.getState(e.id);
          if (!interp) continue;

          let rp = remotePlayers.get(e.id);
          if (!rp) {
            const label = e.ownerId
              ? `Player_${e.id.slice(0, 4)}`
              : (e.npcType || 'NPC');
            rp = new RemotePlayer(scene, e.id, label);
            // Color NPCs red
            if (!e.ownerId && rp.mesh.children[0] instanceof THREE.Mesh) {
              (rp.mesh.children[0] as THREE.Mesh).material = new THREE.MeshStandardMaterial({
                color: 0xaa2222, roughness: 0.5, metalness: 0.6,
              });
            }
            remotePlayers.set(e.id, rp);
          }

          rp.setTarget(
            new THREE.Vector3(interp.position.x, interp.position.y, interp.position.z),
            new THREE.Quaternion(interp.orientation.x, interp.orientation.y, interp.orientation.z, interp.orientation.w),
            interp.health,
            interp.shield,
          );
        }

        // Remove disconnected entities
        for (const [id, rp] of remotePlayers) {
          if (!activeIds.has(id)) {
            rp.dispose();
            remotePlayers.delete(id);
          }
        }
        interpolator.cleanup(activeIds);
        break;
      }

      case 'system_switch': {
        const { systemSeed } = msg.payload;
        console.log('[MP] System switch to', systemSeed);
        playerShip.inputEnabled = false;
        sceneManager.startWarp(systemSeed, playerShip);
        setTimeout(() => { playerShip.inputEnabled = true; }, 5500);
        gameState.jumpFlashTime = Date.now();
        soundManager.startMusic(systemSeed);
        break;
      }

      case 'combat_event': {
        console.log('[MP] Combat:', msg.payload);
        break;
      }
    }
  });

  // Per-frame update: send input, update remote player meshes
  const updateInterval = setInterval(() => {
    inputSync.update(1 / 60, fireActive, mineActive);
    mineActive = false;
  }, 1000 / 60);

  const cleanup = () => {
    unsub();
    clearInterval(updateInterval);
    for (const [, rp] of remotePlayers) {
      rp.dispose();
    }
    remotePlayers.clear();
  };

  return {
    mpCtx: { ws, inputSync, interpolator, remotePlayers, playerId },
    cleanup,
  };
}

/**
 * Запускает HUD sync для MP.
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

    hudSyncRef = requestAnimationFrame(sync);
  };

  hudSyncRef = requestAnimationFrame(sync);

  return () => {
    destroyed = true;
    cancelAnimationFrame(hudSyncRef);
  };
}
