export interface SystemInfo {
  id: number;
  name: string;
  seed: number;
  color: string; // star color hex
  economyType: string;
  description: string;
}

import { generateName } from '../utils/nameGen';
import { ECONOMY_RU_NAMES, ECONOMY_TYPES } from '../data/goods';

export class Universe {
  public systems: SystemInfo[] = [];
  public currentSystemIndex = 0;

  constructor(count: number = 32) {
    for (let i = 0; i < count; i++) {
      const hue = (i / count) * 0.3 + Math.random() * 0.08; // yellow to orange
      const econKey = ECONOMY_TYPES[i % ECONOMY_TYPES.length];
      const ruName = ECONOMY_RU_NAMES[econKey];
      this.systems.push({
        id: i,
        name: generateName(100 + i * 137),
        seed: 100 + i * 137,
        color: `hsl(${Math.round(hue * 360)}, 90%, 70%)`,
        economyType: ruName,
        description: `${ruName} система. Население: ${(1 + Math.random() * 10).toFixed(1)} млн.`,
      });
    }
  }

  getCurrentSystem(): SystemInfo {
    return this.systems[this.currentSystemIndex];
  }

  jumpTo(index: number): SystemInfo | null {
    if (index < 0 || index >= this.systems.length) return null;
    this.currentSystemIndex = index;
    return this.systems[this.currentSystemIndex];
  }

  getSystemList(): SystemInfo[] {
    return this.systems;
  }
}
