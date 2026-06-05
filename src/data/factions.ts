export interface FactionDef {
  id: string;
  name: string;
  color: string;
  description: string;
}

export const FACTIONS: FactionDef[] = [
  { id: 'federation', name: 'Федерация', color: '#4488ff', description: 'Объединённые миры. Закон и порядок.' },
  { id: 'miners', name: 'Гильдия Шахтёров', color: '#ff8800', description: 'Добывающие колонии. Ценят ресурсы.' },
  { id: 'traders', name: 'Торговый Союз', color: '#ffcc00', description: 'Купцы и перевозчики. Деньги решают всё.' },
  { id: 'pirates', name: 'Пиратский Картель', color: '#ff2222', description: 'Вне закона. Сила есть — ума не надо.' },
];
