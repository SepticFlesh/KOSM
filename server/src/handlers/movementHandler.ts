import type { PlayerSession } from '../wsServer.js';
import type { ServerMessage, InputPayload, MissionDef } from '../protocol/messages.js';
import type { GameLoop } from '../gameLoop.js';
import type { ServerMissionSystem } from '../systems/MissionSystem.js';
import { getPlayer, updatePlayerCredits, upsertPlayerMission } from '../db.js';

export interface MovementHandlerDeps {
  gameLoop: GameLoop;
  missions: ServerMissionSystem;
  playerMissions: Map<string, MissionDef[]>;
}

type ReplyFn = (msg: ServerMessage) => void;

export function createMovementHandler(deps: MovementHandlerDeps) {
  const { gameLoop, missions, playerMissions } = deps;

  function handleInput(session: PlayerSession, payload: InputPayload): void {
    gameLoop.handleInput(session, payload);
  }

  function handleJump(session: PlayerSession, targetSystem: number, reply: ReplyFn): void {
    gameLoop.handleJumpRequest(session, targetSystem);

    // Complete deliver missions on jump
    const pms = playerMissions.get(session.playerId) || [];
    for (const m of pms) {
      if (m.type === 'deliver' && !m.completed) {
        const result = missions.completeDelivery(pms, m.id);
        if (result.success) {
          const player = getPlayer(session.playerId);
          if (player) {
            const newCredits = player.credits + (result.reward || 0);
            updatePlayerCredits(session.playerId, newCredits);
            upsertPlayerMission(session.playerId, m);
            reply({ type: 'player_state', payload: { playerId: session.playerId, credits: newCredits } as any });
            reply({ type: 'missions', payload: { missions: pms } });
          }
        }
      }
    }
  }

  return { handleInput, handleJump };
}
