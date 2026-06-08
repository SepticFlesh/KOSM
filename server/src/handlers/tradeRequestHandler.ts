import type { ServerMessage, MissionDef } from '../protocol/messages.js';
import type { EconomySystem } from '../systems/EconomySystem.js';
import type { ServerMissionSystem } from '../systems/MissionSystem.js';
import { getPlayer, getPlayerCargo } from '../db.js';

export interface TradeRequestHandlerDeps {
  economy: EconomySystem;
  missions: ServerMissionSystem;
  playerMissions: Map<string, MissionDef[]>;
  getPlayerSystem: (playerId: string) => number;
}

export function createTradeRequestHandler(deps: TradeRequestHandlerDeps) {
  const { economy, missions, playerMissions, getPlayerSystem } = deps;

  /** Called when player opens trade menu — generates missions & market data */
  function onTradeRequest(playerId: string, broadcast: (msg: ServerMessage) => void): void {
    const systemSeed = getPlayerSystem(playerId);
    const newMissions = missions.generateMissions(systemSeed);
    const existing = playerMissions.get(playerId) || [];
    const all = [...existing.filter(m => !m.completed), ...newMissions].slice(0, 6);
    playerMissions.set(playerId, all);

    const player = getPlayer(playerId);
    if (!player) return;
    const cargo = getPlayerCargo(playerId);
    const market = economy.getMarket(systemSeed, cargo);

    broadcast({ type: 'trade_menu', payload: { goods: market.goods, credits: player.credits } });
    broadcast({ type: 'missions', payload: { missions: all } });
  }

  return { onTradeRequest };
}
