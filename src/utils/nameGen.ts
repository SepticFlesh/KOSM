const PREFIXES = ['Нов', 'Астр', 'Вег', 'Сир', 'Пол', 'Альт', 'Риг', 'Про', 'Ден', 'Кеп', 'Ор', 'Цент', 'Лир', 'Фен', 'Зар', 'Тор', 'Косм', 'Гел', 'Некс', 'Тер'];
const SUFFIXES = ['а', 'ия', 'он', 'ус', 'ис', 'ар', 'ан', 'ос', 'икс', 'ен', 'окс', 'ура', 'ион', 'ей', 'ия'];

export function generateName(seed: number): string {
  const s1 = PREFIXES[seed % PREFIXES.length];
  const s2 = SUFFIXES[(seed * 7 + 3) % SUFFIXES.length];
  return s1 + s2;
}

export function generateStationName(seed: number): string {
  const types = ['Орбитальная', 'Космическая', 'Торговая', 'Военная', 'Научная'];
  const bases = ['Станция', 'База', 'Док', 'Аванпост', 'Форт', 'Узел'];
  const s1 = types[seed % types.length];
  const s2 = bases[(seed * 3) % bases.length];
  return `${s1} ${s2} ${generateName(seed + 100).toUpperCase()}`;
}

