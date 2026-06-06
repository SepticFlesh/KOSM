/**
 * Server-side economy — market prices, station inventory, trading.
 * Prices are deterministic from system seed + time bucket.
 * Fluctuations every 5 minutes.
 */

interface MarketEntry {
  goodId: string;
  name: string;
  basePrice: number;
  price: number;
  stationQty: number;
}

interface EconomyModifiers {
  [economyType: string]: Partial<Record<string, number>>;
}

// Economy modifiers per economy type (same as client)
const MODIFIERS: EconomyModifiers = {
  agriculture: { water: 0.5, grain: 0.6, meat: 0.7, fish: 0.6, chips: 1.5, droids: 1.8, fuel: 1.3 },
  mining: { iron: 0.5, titanium: 0.6, uranium: 0.7, gold: 0.8, grain: 1.5, medkit: 1.3 },
  industrial: { parts: 0.6, plast: 0.7, lasers: 0.9, grain: 1.4, gems: 1.5 },
  hightech: { chips: 0.5, droids: 0.6, lasers: 0.7, iron: 1.6, water: 1.4 },
  military: { lasers: 0.6, missiles: 0.5, fuel: 0.8, spice: 1.5, booze: 1.4 },
  trading: { gold: 0.9, gems: 0.9, spice: 0.8, missiles: 1.3, lasers: 1.3 },
};

const ALL_GOODS: Array<{ id: string; name: string; basePrice: number }> = [
  { id: 'water', name: 'Вода', basePrice: 10 },
  { id: 'grain', name: 'Зерно', basePrice: 18 },
  { id: 'meat', name: 'Мясо', basePrice: 35 },
  { id: 'fish', name: 'Рыба', basePrice: 30 },
  { id: 'iron', name: 'Железная руда', basePrice: 25 },
  { id: 'titanium', name: 'Титан', basePrice: 80 },
  { id: 'uranium', name: 'Уран', basePrice: 200 },
  { id: 'gold', name: 'Золото', basePrice: 350 },
  { id: 'chips', name: 'Микрочипы', basePrice: 150 },
  { id: 'droids', name: 'Дроиды', basePrice: 400 },
  { id: 'lasers', name: 'Лазерное оружие', basePrice: 500 },
  { id: 'missiles', name: 'Ракеты', basePrice: 650 },
  { id: 'medkit', name: 'Аптечки', basePrice: 55 },
  { id: 'vaccine', name: 'Вакцины', basePrice: 120 },
  { id: 'spice', name: 'Специи', basePrice: 180 },
  { id: 'gems', name: 'Драгоценности', basePrice: 450 },
  { id: 'fuel', name: 'Топливо', basePrice: 40 },
  { id: 'plast', name: 'Пластик', basePrice: 30 },
  { id: 'parts', name: 'Запчасти', basePrice: 90 },
  { id: 'booze', name: 'Алкоголь', basePrice: 100 },
];

const ECONOMY_TYPES = ['agriculture', 'mining', 'industrial', 'hightech', 'military', 'trading'];

// Simple mulberry32 for deterministic prices
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) | 0;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class EconomySystem {
  private markets = new Map<number, MarketEntry[]>();
  private lastTick = Date.now();
  private tickInterval = 5 * 60 * 1000; // 5 minutes

  getMarket(systemSeed: number, playerCargo: Array<{ goodId: string; quantity: number }> = []): { goods: MarketEntry[] } {
    // Generate per time-bucket for stability
    const bucket = Math.floor(Date.now() / this.tickInterval);
    const seed = systemSeed * 1000 + bucket;

    if (!this.markets.has(systemSeed) || Date.now() - this.lastTick > this.tickInterval) {
      this.generateMarket(systemSeed, seed);
      this.lastTick = Date.now();
    }

    const goods = this.markets.get(systemSeed) || [];
    // Merge with player cargo quantities
    const merged = goods.map(g => {
      const pc = playerCargo.find(c => c.goodId === g.goodId);
      return { ...g, playerQty: pc?.quantity || 0 };
    });
    return { goods: merged };
  }

  private generateMarket(systemSeed: number, timeSeed: number): void {
    const economyType = ECONOMY_TYPES[systemSeed % ECONOMY_TYPES.length];
    const modifiers = MODIFIERS[economyType] || {};
    const rng = mulberry32(timeSeed);

    const goods: MarketEntry[] = ALL_GOODS.map(g => {
      let mod = modifiers[g.id] || 1.0;
      mod *= 0.85 + rng() * 0.3; // ±15% random
      const price = Math.round(g.basePrice * mod);
      return {
        goodId: g.id,
        name: g.name,
        basePrice: g.basePrice,
        price: Math.max(1, price),
        stationQty: 5 + Math.floor(rng() * 20),
      };
    });

    this.markets.set(systemSeed, goods);
  }

  /** Player buys from station */
  buyFromStation(
    systemSeed: number, goodId: string, qty: number,
    playerCredits: number, playerCargoUsed: number, playerCargoMax: number,
  ): { success: boolean; newCredits?: number; newCargoUsed?: number; error?: string } {
    const goods = this.markets.get(systemSeed);
    if (!goods) return { success: false, error: 'Market not available' };

    const item = goods.find(g => g.goodId === goodId);
    if (!item) return { success: false, error: 'Good not found' };
    if (item.stationQty < qty) return { success: false, error: 'Not enough stock' };

    const cost = item.price * qty;
    if (playerCredits < cost) return { success: false, error: 'Not enough credits' };
    if (playerCargoUsed + qty > playerCargoMax) return { success: false, error: 'Cargo full' };

    item.stationQty -= qty;
    return { success: true, newCredits: playerCredits - cost, newCargoUsed: playerCargoUsed + qty };
  }

  /** Player sells to station */
  sellToStation(
    systemSeed: number, goodId: string, qty: number,
    playerCredits: number, playerCargoUsed: number,
  ): { success: boolean; newCredits?: number; newCargoUsed?: number; error?: string } {
    const goods = this.markets.get(systemSeed);
    if (!goods) return { success: false, error: 'Market not available' };

    const item = goods.find(g => g.goodId === goodId);
    if (!item) return { success: false, error: 'Good not found' };
    if (qty < 1) return { success: false, error: 'Nothing to sell' };

    const revenue = Math.floor(item.price * qty * 0.8); // 80% of market price
    item.stationQty += qty;
    return { success: true, newCredits: playerCredits + revenue, newCargoUsed: Math.max(0, playerCargoUsed - qty) };
  }
}
