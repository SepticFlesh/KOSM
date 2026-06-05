export interface EconomyEvent {
  id: string;
  title: string;
  description: string;
  affects: string[]; // товары на которые влияет
  priceMod: number; // множитель цены (1.3 = +30%)
}

const EVENT_POOL: EconomyEvent[] = [
  { id: 'pirate_raid', title: 'Налёт пиратов', description: 'Пираты атакуют торговые пути', affects: ['lasers', 'missiles', 'fuel'], priceMod: 1.5 },
  { id: 'surplus_food', title: 'Избыток продовольствия', description: 'Рекордный урожай', affects: ['water', 'grain', 'meat', 'fish'], priceMod: 0.6 },
  { id: 'famine', title: 'Голод', description: 'Нехватка продовольствия', affects: ['water', 'grain', 'meat', 'fish'], priceMod: 2.0 },
  { id: 'tech_boom', title: 'Технологический бум', description: 'Спрос на электронику', affects: ['chips', 'droids', 'parts'], priceMod: 1.8 },
  { id: 'war', title: 'Военный конфликт', description: 'Флот нуждается в снабжении', affects: ['lasers', 'missiles', 'fuel', 'medkit'], priceMod: 1.6 },
  { id: 'mineral_rush', title: 'Минеральная лихорадка', description: 'Шахтёры нашли богатые залежи', affects: ['iron', 'titanium', 'uranium', 'gold'], priceMod: 0.7 },
  { id: 'luxury_demand', title: 'Спрос на роскошь', description: 'Элита скупает драгоценности', affects: ['gems', 'spice', 'booze'], priceMod: 1.7 },
  { id: 'medicine_shortage', title: 'Эпидемия', description: 'Нехватка медикаментов', affects: ['medkit', 'vaccine'], priceMod: 2.2 },
];

/** Generate 1-2 random events for a system */
export function generateEvents(seed: number): EconomyEvent[] {
  const s = seed * 7919 + 104729;
  const count = 1 + ((s % 3) > 0 ? 1 : 0); // 1 or 2 events
  const events: EconomyEvent[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const idx = (s + i * 31337) % EVENT_POOL.length;
    const ev = EVENT_POOL[idx];
    if (!used.has(ev.id)) {
      used.add(ev.id);
      events.push(ev);
    }
  }
  return events;
}

/** Apply event modifiers to goods prices */
export function applyEvents(goods: Array<{ id: string; price: number; name: string }>, events: EconomyEvent[]): Array<{ id: string; name: string; price: number; playerQty: number; stationQty: number }> {
  return goods.map(g => {
    let mod = 1.0;
    for (const ev of events) {
      if (ev.affects.includes(g.id)) mod *= ev.priceMod;
    }
    return { ...g, price: Math.round(g.price * mod), playerQty: 0, stationQty: g.stationQty || (5 + Math.floor(Math.random() * 20)) };
  });
}
