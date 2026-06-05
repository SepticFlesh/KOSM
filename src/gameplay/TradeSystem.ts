import { GOODS, ECONOMY_MODIFIERS } from '../data/goods';
import type { EconomyType } from '../data/goods';

/**
 * Simple trade system — generates prices based on station economy.
 */
export class TradeSystem {
  private economy: EconomyType;
  private rng: () => number;

  constructor(seed: number = 42) {
    const types: EconomyType[] = ['agriculture', 'mining', 'industrial', 'hightech', 'military', 'trading'];
    // Simple seeded RNG
    let s = seed;
    this.rng = () => {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) | 0;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    this.economy = types[Math.floor(this.rng() * types.length)];
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
