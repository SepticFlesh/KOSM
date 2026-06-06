import { GOODS, ECONOMY_MODIFIERS, ECONOMY_TYPES } from '../data/goods';
import type { EconomyType } from '../data/goods';
import { mulberry32 } from '../utils/rng';

/**
 * Simple trade system — generates prices based on station economy.
 */
export class TradeSystem {
  private economy: EconomyType;
  private rng: () => number;

  constructor(seed: number = 42) {
    this.rng = mulberry32(seed);
    this.economy = ECONOMY_TYPES[Math.floor(this.rng() * ECONOMY_TYPES.length)];
  }

  getEconomy(): EconomyType { return this.economy; }

  /** Generate market prices for all goods */
  generateMarket() {
    const modifiers = ECONOMY_MODIFIERS[this.economy];
    return GOODS.map(g => {
      // Base modifier from economy
      let mod = (modifiers as any)[g.id] || 1.0;
      // Random fluctuation ±15%
      mod *= 0.85 + this.rng() * 0.3;
      const price = Math.round(g.basePrice * mod);
      return {
        id: g.id,
        name: g.name,
        price: Math.max(1, price),
        playerQty: 0,
        stationQty: 5 + Math.floor(this.rng() * 20),
      };
    });
  }
}
