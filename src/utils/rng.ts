/**
 * Mulberry32 PRNG — returns a function that produces numbers in [0, 1).
 * Fast, high-quality, deterministic from seed.
 */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) | 0;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Seed-based генератор псевдослучайных чисел (ГПСЧ).
 * Использует алгоритм mulberry32.
 * Гарантирует одинаковую последовательность для одного и того же seed.
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /**
   * Следующее число в диапазоне [0, 1)
   */
  next(): number {
    // Mulberry32: быстрый и качественный ГПСЧ
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Целое число в диапазоне [0, max)
   */
  nextInt(): number {
    return Math.floor(this.next() * 2147483648);
  }

  /**
   * Число в диапазоне [min, max)
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Целое число в диапазоне [min, max]
   */
  intRange(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Случайный элемент массива
   */
  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }

  /**
   * Получить текущее состояние (для сохранения)
   */
  getState(): number {
    return this.state;
  }
}

/**
 * Fast 2D hash function for procedural generation.
 * Returns a value in [0, 1).
 */
export function hash2D(x: number, y: number, seed: number = 0): number {
  let h = x * 374761393 + y * 668265263 + seed;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}
