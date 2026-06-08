import type { PlayerSession } from '../wsServer.js';
import type { ServerMessage, MissionDef } from '../protocol/messages.js';
import type { GameLoop } from '../gameLoop.js';
import type { ServerMissionSystem } from '../systems/MissionSystem.js';
import { getPlayer, updatePlayerCredits, upsertPlayerMission, changeReputation } from '../db.js';

export interface CombatHandlerDeps {
  gameLoop: GameLoop;
  missions: ServerMissionSystem;
  playerMissions: Map<string, MissionDef[]>;
  playerKills: Map<string, number>;
}

export function createCombatHandler(deps: CombatHandlerDeps) {
  const { gameLoop, missions, playerMissions, playerKills } = deps;

  function handleFireBolt(session: PlayerSession, payload: { pos: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } }): void {
    gameLoop.handleFireBolt(session, payload);
  }

  /** Called by gameLoop when a player gets a kill */
  function onKill(playerId: string, killCount: number, broadcast: (msg: ServerMessage) => void): void {
    const pms = playerMissions.get(playerId) || [];
    const prevKills = playerKills.get(playerId) || 0;
    playerKills.set(playerId, prevKills + killCount);

    const { completed } = missions.updateKillProgress(pms, killCount);
    for (const m of completed) {
      const player = getPlayer(playerId);
      if (player) {
        const newCredits = player.credits + m.reward;
        updatePlayerCredits(playerId, newCredits);
        upsertPlayerMission(playerId, m);
        changeReputation(playerId, 'federation', 10);
        broadcast({ type: 'missions', payload: { missions: pms } });
      }
    }
  }

  return { handleFireBolt, onKill };
}
