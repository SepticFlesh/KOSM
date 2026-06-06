export interface SystemInfo {
  id: number;
  name: string;
  seed: number;
  color: string; // star color hex
  economyType: string;
  description: string;
}

import { generateName } from '../utils/nameGen';

const ECONOMY_TYPES = ['Аграрная', 'Горнодобывающая', 'Индустриальная', 'Высокотехнологичная', 'Военная', 'Торговая'];

export class Universe {
  public systems: SystemInfo[] = [];
  public currentSystemIndex = 0;

  constructor(count: number = 32) {
    for (let i = 0; i < count; i++) {
      const hue = (i / count) * 0.3 + Math.random() * 0.08; // yellow to orange
      this.systems.push({
        id: i,
        name: generateName(100 + i * 137),
        seed: 100 + i * 137,
        color: `hsl(${Math.round(hue * 360)}, 90%, 70%)`,
        economyType: ECONOMY_TYPES[i % ECONOMY_TYPES.length],
        description: `${ECONOMY_TYPES[i % ECONOMY_TYPES.length]} система. Население: ${(1 + Math.random() * 10).toFixed(1)} млн.`,
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
