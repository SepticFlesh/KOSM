export interface UpgradeDef {
  id: string;
  name: string;
  category: 'weapon' | 'shield' | 'engine' | 'scanner';
  levels: { level: number; cost: number; value: number; description: string }[];
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'laser_damage',
    name: 'Лазерное оружие',
    category: 'weapon',
    levels: [
      { level: 1, cost: 0, value: 25, description: 'Стандартный лазер' },
      { level: 2, cost: 500, value: 35, description: 'Усиленный лазер +40%' },
      { level: 3, cost: 1500, value: 50, description: 'Боевой лазер +100%' },
      { level: 4, cost: 4000, value: 75, description: 'Военный лазер +200%' },
    ],
  },
  {
    id: 'shields',
    name: 'Щиты',
    category: 'shield',
    levels: [
      { level: 1, cost: 0, value: 100, description: 'Базовые щиты' },
      { level: 2, cost: 600, value: 150, description: 'Усиленные щиты +50%' },
      { level: 3, cost: 1800, value: 225, description: 'Военные щиты +125%' },
      { level: 4, cost: 5000, value: 350, description: 'Продвинутые щиты +250%' },
    ],
  },
  {
    id: 'engine',
    name: 'Двигатели',
    category: 'engine',
    levels: [
      { level: 1, cost: 0, value: 30, description: 'Стандартный двигатель' },
      { level: 2, cost: 700, value: 40, description: 'Форсированный двигатель +33%' },
      { level: 3, cost: 2000, value: 55, description: 'Гоночный двигатель +83%' },
      { level: 4, cost: 5500, value: 75, description: 'Военный двигатель +150%' },
    ],
  },
  {
    id: 'scanner',
    name: 'Сканер',
    category: 'scanner',
    levels: [
      { level: 1, cost: 0, value: 500, description: 'Базовый сканер' },
      { level: 2, cost: 400, value: 800, description: 'Улучшенный сканер' },
      { level: 3, cost: 1200, value: 1200, description: 'Дальний сканер' },
      { level: 4, cost: 3000, value: 2000, description: 'Военный сканер' },
    ],
  },
];
