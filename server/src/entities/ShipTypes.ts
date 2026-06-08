/**
 * Civilian ship types for NPC traffic.
 */

export interface ShipTypeDef {
  id: string;
  name: string;
  role: 'trader' | 'transport' | 'pirate' | 'shuttle' | 'liner' | 'patrol';
  mass: number;
  thrust: number;
  rotationalSpeed: number;
  maxSpeedAssist: number;
  hullStrength: number;
  color: { r: number; g: number; b: number };
}

export const SHIP_TYPES: ShipTypeDef[] = [
  // --- Trade ships ---
  { id: 'trader_light', name: 'Лёгкий торговец', role: 'trader', mass: 40, thrust: 200, rotationalSpeed: 3, maxSpeedAssist: 80, hullStrength: 60, color: {r:0.9, g:0.7, b:0.2} },
  { id: 'trader_medium', name: 'Средний торговец', role: 'trader', mass: 80, thrust: 150, rotationalSpeed: 2, maxSpeedAssist: 60, hullStrength: 120, color: {r:0.8, g:0.6, b:0.1} },
  { id: 'trader_heavy', name: 'Тяжёлый транспорт', role: 'trader', mass: 150, thrust: 100, rotationalSpeed: 1.5, maxSpeedAssist: 45, hullStrength: 200, color: {r:0.7, g:0.5, b:0.1} },

  // --- Transport ships ---
  { id: 'shuttle', name: 'Пассажирский челнок', role: 'shuttle', mass: 25, thrust: 350, rotationalSpeed: 5, maxSpeedAssist: 120, hullStrength: 40, color: {r:0.3, g:0.7, b:0.9} },
  { id: 'liner', name: 'Частный лайнер', role: 'liner', mass: 60, thrust: 250, rotationalSpeed: 3.5, maxSpeedAssist: 100, hullStrength: 80, color: {r:0.5, g:0.5, b:0.9} },
  { id: 'transport', name: 'Грузовой челнок', role: 'transport', mass: 50, thrust: 200, rotationalSpeed: 3, maxSpeedAssist: 70, hullStrength: 90, color: {r:0.4, g:0.6, b:0.8} },

  // --- Pirates ---
  { id: 'pirate_light', name: 'Лёгкий пират', role: 'pirate', mass: 20, thrust: 400, rotationalSpeed: 5, maxSpeedAssist: 200, hullStrength: 100, color: {r:0.9, g:0.2, b:0.1} },

  // --- Patrol ---
  { id: 'patrol', name: 'Патрульный корабль', role: 'patrol', mass: 25, thrust: 450, rotationalSpeed: 6, maxSpeedAssist: 180, hullStrength: 150, color: {r:0.2, g:0.3, b:0.9} },
];

export function getShipType(id: string): ShipTypeDef {
  return SHIP_TYPES.find(s => s.id === id) || SHIP_TYPES[0];
}

export function getShipsByRole(role: string): ShipTypeDef[] {
  return SHIP_TYPES.filter(s => s.role === role);
}
