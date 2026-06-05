export interface TradeGood {
  id: string;
  name: string;
  category: 'food' | 'minerals' | 'tech' | 'weapons' | 'medicine' | 'luxury';
  basePrice: number; // credits per ton
  description: string;
}

export const GOODS: TradeGood[] = [
  { id: 'water',    name: 'Вода',           category: 'food',     basePrice: 10,   description: 'Питьевая вода' },
  { id: 'grain',    name: 'Зерно',          category: 'food',     basePrice: 18,   description: 'Продовольственное зерно' },
  { id: 'meat',     name: 'Мясо',           category: 'food',     basePrice: 35,   description: 'Замороженное мясо' },
  { id: 'fish',     name: 'Рыба',           category: 'food',     basePrice: 30,   description: 'Свежая рыба' },
  { id: 'iron',     name: 'Железная руда',  category: 'minerals', basePrice: 25,   description: 'Необработанная руда' },
  { id: 'titanium', name: 'Титан',          category: 'minerals', basePrice: 80,   description: 'Лёгкий прочный металл' },
  { id: 'uranium',  name: 'Уран',           category: 'minerals', basePrice: 200,  description: 'Радиоактивный элемент' },
  { id: 'gold',     name: 'Золото',         category: 'minerals', basePrice: 350,  description: 'Драгоценный металл' },
  { id: 'chips',    name: 'Микрочипы',      category: 'tech',     basePrice: 150,  description: 'Компьютерные компоненты' },
  { id: 'droids',   name: 'Дроиды',         category: 'tech',     basePrice: 400,  description: 'Роботы-помощники' },
  { id: 'lasers',   name: 'Лазерное оружие',category: 'weapons',  basePrice: 500,  description: 'Энергетическое оружие' },
  { id: 'missiles', name: 'Ракеты',         category: 'weapons',  basePrice: 650,  description: 'Самонаводящиеся ракеты' },
  { id: 'medkit',   name: 'Аптечки',        category: 'medicine', basePrice: 55,   description: 'Медицинские наборы' },
  { id: 'vaccine',  name: 'Вакцины',        category: 'medicine', basePrice: 120,  description: 'Редкие вакцины' },
  { id: 'spice',    name: 'Специи',         category: 'luxury',   basePrice: 180,  description: 'Экзотические специи' },
  { id: 'gems',     name: 'Драгоценности',  category: 'luxury',   basePrice: 450,  description: 'Редкие камни' },
  { id: 'fuel',     name: 'Топливо',        category: 'minerals', basePrice: 40,   description: 'Реактивное топливо' },
  { id: 'plast',    name: 'Пластик',        category: 'tech',     basePrice: 30,   description: 'Синтетические полимеры' },
  { id: 'parts',    name: 'Запчасти',       category: 'tech',     basePrice: 90,   description: 'Механические детали' },
  { id: 'booze',    name: 'Алкоголь',       category: 'luxury',   basePrice: 100,  description: 'Напитки со всех миров' },
];

export type EconomyType = 'agriculture' | 'mining' | 'industrial' | 'hightech' | 'military' | 'trading';

// Price modifiers per economy type
export const ECONOMY_MODIFIERS: Record<EconomyType, Partial<Record<string, number>>> = {
  agriculture: { grain: 0.6, meat: 0.7, water: 0.5, chips: 1.5, droids: 1.8, fuel: 1.3 },
  mining:      { iron: 0.5, titanium: 0.6, uranium: 0.7, gold: 0.8, food: 1.5, medkit: 1.3 },
  industrial:  { parts: 0.6, plast: 0.7, lasers: 0.9, grain: 1.4, gems: 1.5 },
  hightech:    { chips: 0.5, droids: 0.6, lasers: 0.7, iron: 1.6, water: 1.4 },
  military:    { lasers: 0.6, missiles: 0.5, fuel: 0.8, spice: 1.5, booze: 1.4 },
  trading:     { gold: 0.8, gems: 0.8, spice: 0.9, iron: 1.2, grain: 1.3 },
};
