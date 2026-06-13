import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { Universe } from '../world/Universe';
import type { ShipController } from '../gameplay/ShipController';
import type { WSClient } from '../network/wsClient';
import { InputSync } from '../network/inputSync';
import { EntityInterpolator } from '../network/entityInterpolation';
import { RemotePlayer, type ShipVisualType } from '../gameplay/RemotePlayer';
import type { WorldSnapshot, ServerMessage } from '../network/protocol';
import { soundManager } from '../audio/SoundManager';
import { gameState } from '../ui/store/gameStore';
import { createHUDSync } from './hudSync.js';
import type { BlipEntity } from './hudSync.js';

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

  // Weapon fire → notify server via callback (no monkey-patching)
  playerShip.onFire = (muzzlePos: THREE.Vector3, dir: THREE.Vector3) => {
    if (!ws.connected) return;
    ws.send({
      type: 'fire_bolt',
      payload: {
        pos: { x: muzzlePos.x, y: muzzlePos.y, z: muzzlePos.z },
        dir: { x: dir.x, y: dir.y, z: dir.z },
      },
    });
  };

  // FTL Jump — send to server
  playerShip.onJumpRequest = () => {
    const nextIdx = (universe.currentSystemIndex + 1) % universe.systems.length;
    universe.jumpTo(nextIdx);
    ws.send({ type: 'jump_request', payload: { targetSystem: nextIdx } });
  };

  // Trade — запросить рынок с сервера
  playerShip.onTradeRequest = () => {
    ws.send({ type: 'trade_request', payload: {} });
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
        // Cache for radar/map
        (window as any).__kosmMPEntities = snap.entities.filter(e => e.id !== playerId).map(e => ({ id:e.id, px:e.position.x, py:e.position.y, pz:e.position.z, health:e.health, isNPC:!e.ownerId, isPlayer:!!e.ownerId, npcType:(e as any).npcType||'enemy' }));
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
            const isNPC = !e.ownerId;
            const label = isNPC ? (e.npcType || 'NPC') : `Player_${e.id.slice(0, 4)}`;
            const nt = (e as any).npcType || '';
            const vtype: ShipVisualType = (nt === 'trader' || nt === 'shuttle' || nt === 'transport' || nt === 'liner') ? 'trader' : nt === 'pirate' ? 'pirate' : 'default';
            rp = new RemotePlayer(scene, e.id, label, vtype);
            rp.isNPC = isNPC;
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
 * Делегирует в shared createHUDSync с MP-специфичными параметрами.
 */
export function startMPHUDSync(
  engine: Engine,
  starPos: THREE.Vector3,
  playerShip: ShipController,
  universe: Universe,
): () => void {
  return createHUDSync({
    engine,
    starPos,
    playerShip,
    universe,
    source: 'mp',
    getEntities: (): BlipEntity[] => {
      const mpEnts: any[] = (window as any).__kosmMPEntities || [];
      return mpEnts.map((e: any) => ({
        px: e.px, py: e.py, pz: e.pz,
        health: e.health,
        type: (e.isPlayer ? 'player' : 'enemy') as BlipEntity['type'],
        npcType: e.npcType || 'enemy',
        isPlayer: !!e.isPlayer,
      }));
    },
  });
}
