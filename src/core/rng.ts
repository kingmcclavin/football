// Small seeded PRNG (mulberry32). All simulation randomness flows through an Rng
// so games and seasons can be reproduced from a seed in tests.
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  get state(): number {
    return this.s;
  }
  set state(v: number) {
    this.s = v >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(a + (b - a + 1) * this.next());
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Approximately normal via sum of uniforms. */
  normal(mean = 0, sd = 1): number {
    const u = this.next() + this.next() + this.next() + this.next() - 2;
    return mean + sd * u * 1.732;
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}
