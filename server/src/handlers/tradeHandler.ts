import type { PlayerSession } from '../wsServer.js';
import type { ServerMessage } from '../protocol/messages.js';
import type { EconomySystem } from '../systems/EconomySystem.js';
import {
  getPlayer, updatePlayerCredits, updatePlayerCargo,
  getPlayerCargo, upsertPlayerCargo,
  type PlayerRow, type CargoRow,
} from '../db.js';

export interface TradeHandlerDeps {
  economy: EconomySystem;
  getPlayerSystem: (playerId: string) => number;
}

type ReplyFn = (msg: ServerMessage) => void;

export function createTradeHandler(deps: TradeHandlerDeps) {
  const { economy, getPlayerSystem } = deps;

  function handleBuy(session: PlayerSession, goodId: string, quantity: number, reply: ReplyFn): void {
    const player = getPlayer(session.playerId);
    if (!player) { reply({ type: 'error', payload: { code: 'TRADE', message: 'Player not found' } }); return; }
    const cargo = getPlayerCargo(session.playerId);

    const result = economy.buyFromStation(
      getPlayerSystem(session.playerId),
      goodId, quantity,
      player.credits, player.cargo_used, player.cargo_capacity,
    );

    if (result.success) {
      updatePlayerCredits(session.playerId, result.newCredits!);
      updatePlayerCargo(session.playerId, result.newCargoUsed!);
      const currentQty = cargo.find(c => c.good_id === goodId)?.quantity || 0;
      upsertPlayerCargo(session.playerId, goodId, currentQty + quantity);
    }

    reply(result.success
      ? {
          type: 'trade_menu',
          payload: {
            goods: economy.getMarket(getPlayerSystem(session.playerId), getPlayerCargo(session.playerId)).goods,
            credits: result.newCredits!,
          },
        }
      : { type: 'error', payload: { code: 'TRADE', message: result.error || 'Trade failed' } });
  }

  function handleSell(session: PlayerSession, goodId: string, quantity: number, reply: ReplyFn): void {
    const player = getPlayer(session.playerId);
    if (!player) { reply({ type: 'error', payload: { code: 'TRADE', message: 'Player not found' } }); return; }
    const cargo = getPlayerCargo(session.playerId);
    const currentQty = cargo.find(c => c.good_id === goodId)?.quantity || 0;

    if (currentQty < quantity) {
      reply({ type: 'error', payload: { code: 'TRADE', message: 'Not enough cargo' } });
      return;
    }

    const result = economy.sellToStation(
      getPlayerSystem(session.playerId),
      goodId, quantity,
      player.credits, player.cargo_used,
    );

    if (result.success) {
      updatePlayerCredits(session.playerId, result.newCredits!);
      updatePlayerCargo(session.playerId, result.newCargoUsed!);
      upsertPlayerCargo(session.playerId, goodId, currentQty - quantity);
    }

    reply(result.success
      ? {
          type: 'trade_menu',
          payload: {
            goods: economy.getMarket(getPlayerSystem(session.playerId), getPlayerCargo(session.playerId)).goods,
            credits: result.newCredits!,
          },
        }
      : { type: 'error', payload: { code: 'TRADE', message: result.error || 'Sell failed' } });
  }

  return { handleBuy, handleSell };
}
