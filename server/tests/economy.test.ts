import { describe, it, expect } from 'vitest';
import { EconomySystem } from '../src/systems/EconomySystem.js';

describe('EconomySystem', () => {
  it('should generate a market for a system seed', () => {
    const economy = new EconomySystem();
    const market = economy.getMarket(0);

    expect(market.goods.length).toBeGreaterThan(0);
    expect(market.goods[0]).toHaveProperty('goodId');
    expect(market.goods[0]).toHaveProperty('name');
    expect(market.goods[0]).toHaveProperty('price');
    expect(market.goods[0]).toHaveProperty('playerQty');
    expect(market.goods[0]).toHaveProperty('stationQty');
  });

  it('should produce different prices for different systems', () => {
    const economy = new EconomySystem();
    const market1 = economy.getMarket(0);
    const market2 = economy.getMarket(5);

    // Different economy types → different price modifiers
    const prices1 = market1.goods.map(g => g.price);
    const prices2 = market2.goods.map(g => g.price);

    // At least some prices should differ
    const anyDiff = prices1.some((p, i) => p !== prices2[i]);
    expect(anyDiff).toBe(true);
  });

  it('should allow buying when player has enough credits and cargo', () => {
    const economy = new EconomySystem();
    economy.getMarket(0); // populate market cache
    const result = economy.buyFromStation(0, 'water', 2, 1000, 0, 20);

    expect(result.success).toBe(true);
    expect(result.newCredits!).toBeLessThan(1000);
    expect(result.newCargoUsed!).toBe(2);
  });

  it('should reject buying when not enough credits', () => {
    const economy = new EconomySystem();
    economy.getMarket(0);
    const result = economy.buyFromStation(0, 'gold', 10, 50, 0, 20);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not enough credits');
  });

  it('should reject buying when cargo full', () => {
    const economy = new EconomySystem();
    economy.getMarket(0);
    const result = economy.buyFromStation(0, 'water', 5, 1000, 19, 20);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cargo full');
  });

  it('should reject buying when not enough stock', () => {
    const economy = new EconomySystem();
    economy.getMarket(0);
    const result = economy.buyFromStation(0, 'water', 9999, 100000, 0, 100);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not enough stock');
  });

  it('should allow selling cargo', () => {
    const economy = new EconomySystem();
    economy.getMarket(0);
    const result = economy.sellToStation(0, 'water', 3, 500, 5);

    expect(result.success).toBe(true);
    expect(result.newCredits!).toBeGreaterThan(500);
    expect(result.newCargoUsed!).toBe(2);
  });

  it('should return same market within the same time bucket', () => {
    const economy = new EconomySystem();
    const market1 = economy.getMarket(0);
    const market2 = economy.getMarket(0);

    expect(market1.goods[0].price).toBe(market2.goods[0].price);
  });

  it('should merge player cargo quantities into market', () => {
    const economy = new EconomySystem();
    const playerCargo = [{ goodId: 'water', quantity: 3 }];
    const market = economy.getMarket(0, playerCargo);

    const waterGood = market.goods.find(g => g.goodId === 'water');
    expect(waterGood).toBeDefined();
    expect(waterGood!.playerQty).toBe(3);
  });
});
