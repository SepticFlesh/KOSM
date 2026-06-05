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
