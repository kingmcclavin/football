import { Rng, clamp } from '../core/rng';
import { emptyStats, type Player, type Pos, type RatingKey, type Ratings } from '../core/types';
import { FIRST_NAMES, LAST_NAMES, collegeName } from '../data/names';

const ALL_KEYS: RatingKey[] = ['spd', 'acc', 'str', 'awr', 'thp', 'tha', 'cth', 'car', 'elu', 'rte', 'blk', 'prs', 'tak', 'cov', 'kpw', 'kac'];

export const OVR_WEIGHTS: Record<Pos, Partial<Record<RatingKey, number>>> = {
  QB: { tha: 0.34, thp: 0.22, awr: 0.24, spd: 0.05, acc: 0.05, elu: 0.05, car: 0.05 },
  RB: { spd: 0.22, acc: 0.18, elu: 0.2, car: 0.15, str: 0.1, cth: 0.1, awr: 0.05 },
  WR: { spd: 0.25, cth: 0.3, rte: 0.25, acc: 0.12, awr: 0.08 },
  TE: { cth: 0.25, blk: 0.25, rte: 0.15, str: 0.15, spd: 0.1, awr: 0.1 },
  OL: { blk: 0.5, str: 0.3, awr: 0.15, acc: 0.05 },
  DL: { prs: 0.4, str: 0.25, tak: 0.2, acc: 0.1, awr: 0.05 },
  LB: { tak: 0.3, cov: 0.15, prs: 0.15, spd: 0.15, awr: 0.15, str: 0.1 },
  DB: { cov: 0.4, spd: 0.25, acc: 0.1, awr: 0.15, tak: 0.1 },
  K: { kpw: 0.5, kac: 0.5 },
};

/** [value for a ~70 overall player, how strongly the attribute scales with quality] */
type Profile = Partial<Record<RatingKey, [number, number]>>;
const PROFILES: Record<Pos, Profile> = {
  QB: { spd: [62, 0.4], acc: [65, 0.4], str: [55, 0.2], awr: [70, 1], thp: [72, 0.9], tha: [70, 1], cth: [40, 0.1], car: [65, 0.5], elu: [55, 0.4], tak: [25, 0], blk: [25, 0] },
  RB: { spd: [80, 0.7], acc: [78, 0.7], str: [65, 0.5], awr: [65, 0.6], cth: [62, 0.6], car: [70, 0.8], elu: [72, 1], rte: [55, 0.5], blk: [45, 0.3], tak: [35, 0], thp: [35, 0] },
  WR: { spd: [84, 0.7], acc: [80, 0.7], str: [55, 0.3], awr: [66, 0.6], cth: [72, 1], car: [62, 0.4], elu: [65, 0.6], rte: [70, 1], blk: [40, 0.2], tak: [30, 0], thp: [30, 0] },
  TE: { spd: [70, 0.5], acc: [68, 0.5], str: [72, 0.6], awr: [66, 0.6], cth: [68, 1], car: [64, 0.4], elu: [52, 0.4], rte: [60, 0.8], blk: [66, 1], tak: [35, 0] },
  OL: { spd: [50, 0.2], acc: [58, 0.4], str: [78, 0.8], awr: [66, 0.8], blk: [72, 1], cth: [20, 0], elu: [25, 0], tak: [40, 0], car: [30, 0] },
  DL: { spd: [64, 0.4], acc: [68, 0.6], str: [78, 0.8], awr: [64, 0.6], prs: [72, 1], tak: [70, 0.9], cov: [30, 0.1], cth: [25, 0], blk: [40, 0] },
  LB: { spd: [75, 0.7], acc: [72, 0.6], str: [70, 0.6], awr: [68, 0.9], prs: [60, 0.8], tak: [72, 1], cov: [62, 0.8], cth: [45, 0.3] },
  DB: { spd: [85, 0.7], acc: [82, 0.6], str: [55, 0.3], awr: [68, 0.8], cov: [72, 1], tak: [60, 0.7], cth: [55, 0.5], prs: [35, 0.2] },
  K: { kpw: [74, 1], kac: [72, 1], spd: [50, 0], acc: [50, 0], str: [45, 0], awr: [55, 0.3], tak: [20, 0] },
};

export function calcOvr(pos: Pos, r: Ratings): number {
  const w = OVR_WEIGHTS[pos];
  let s = 0;
  for (const k of Object.keys(w) as RatingKey[]) s += (w[k] ?? 0) * r[k];
  return Math.round(clamp(s, 1, 99));
}

const NUM_RANGES: Record<Pos, [number, number][]> = {
  QB: [[1, 19]], RB: [[20, 49]], WR: [[1, 19], [80, 89]], TE: [[80, 89], [40, 49]], OL: [[50, 79]],
  DL: [[90, 99], [50, 79]], LB: [[40, 59]], DB: [[20, 49]], K: [[1, 19]],
};

let nextId = 1;
export function setNextPlayerId(n: number) {
  nextId = n;
}
export function getNextPlayerId() {
  return nextId;
}

function genRatings(rng: Rng, pos: Pos, q: number): Ratings {
  const prof = PROFILES[pos];
  const r = {} as Ratings;
  for (const k of ALL_KEYS) {
    const p = prof[k] ?? [30, 0];
    r[k] = Math.round(clamp(p[0] + p[1] * (q - 70) + rng.normal(0, 5), 10, 99));
  }
  // Nudge key attributes so the overall lands close to the intended quality.
  for (let i = 0; i < 3; i++) {
    const diff = q - calcOvr(pos, r);
    if (Math.abs(diff) < 1) break;
    for (const k of Object.keys(OVR_WEIGHTS[pos]) as RatingKey[]) r[k] = Math.round(clamp(r[k] + diff, 10, 99));
  }
  return r;
}

export function salaryFor(pos: Pos, ovr: number, age: number): number {
  const max: Record<Pos, number> = { QB: 45, WR: 26, DL: 26, DB: 20, OL: 18, LB: 16, RB: 12, TE: 13, K: 5 };
  const t = clamp((ovr - 52) / 44, 0, 1);
  let s = 0.75 + Math.pow(t, 2.6) * max[pos] * 1.3;
  if (age >= 31) s *= 0.85;
  if (age >= 34) s *= 0.75;
  return Math.round(s * 10) / 10;
}

export function playerValue(p: Player): number {
  const posW: Record<Pos, number> = { QB: 1.6, WR: 1.05, DL: 1.05, DB: 0.95, OL: 0.85, LB: 0.85, RB: 0.8, TE: 0.75, K: 0.35 };
  const eff = p.ovr + (p.age <= 25 ? (p.pot - p.ovr) * 0.35 : 0);
  let ageF = 1;
  if (p.age >= 30) ageF = Math.max(0.25, 1 - (p.age - 29) * 0.13);
  if (p.age <= 24) ageF = 1.08;
  return Math.max(1, Math.pow(Math.max(0, eff - 45), 2) * 0.05 * posW[p.pos] * ageF);
}

export interface GenOpts {
  pos: Pos;
  q: number;
  age: number;
  teamId: number;
  pot?: number;
}

export function generatePlayer(rng: Rng, o: GenOpts, usedNames?: Set<string>): Player {
  let first = rng.pick(FIRST_NAMES);
  let last = rng.pick(LAST_NAMES);
  for (let i = 0; usedNames && usedNames.has(first + ' ' + last) && i < 20; i++) {
    first = rng.pick(FIRST_NAMES);
    last = rng.pick(LAST_NAMES);
  }
  usedNames?.add(first + ' ' + last);
  const r = genRatings(rng, o.pos, o.q);
  const ovr = calcOvr(o.pos, r);
  const youth = clamp((28 - o.age) / 6, 0, 1);
  const pot = o.pot ?? Math.round(clamp(ovr + youth * rng.range(0, 22) + rng.range(0, 3), ovr, 99));
  const ranges = NUM_RANGES[o.pos];
  const rg = rng.pick(ranges);
  const p: Player = {
    id: nextId++,
    first,
    last,
    pos: o.pos,
    age: o.age,
    num: rng.int(rg[0], rg[1]),
    r,
    pot,
    ovr,
    morale: rng.int(60, 85),
    cond: 100,
    injury: null,
    contract: { salary: salaryFor(o.pos, ovr, o.age), years: rng.int(1, 4) },
    teamId: o.teamId,
    xp: 0,
    look: {
      skin: rng.int(0, 4),
      hair: rng.int(0, 4),
      hairColor: rng.int(0, 3),
      beard: rng.chance(0.3),
      visor: rng.chance(0.25),
    },
    season: emptyStats(),
    history: [],
    draft: null,
    awards: [],
    rookie: false,
    college: collegeName(() => rng.next()),
  };
  return p;
}

export function refreshOvr(p: Player) {
  p.ovr = calcOvr(p.pos, p.r);
  if (p.pot < p.ovr) p.pot = p.ovr;
}

export const ROSTER_TEMPLATE: Record<Pos, number> = { QB: 2, RB: 2, WR: 4, TE: 2, OL: 6, DL: 5, LB: 4, DB: 6, K: 1 };
export const STARTERS: Record<Pos, number> = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, DB: 4, K: 1 };
export const MAX_ROSTER = 40;
export const MIN_ROSTER = 26;

export function fullName(p: Player) {
  return p.first + ' ' + p.last;
}
export function shortName(p: Player) {
  return p.first[0] + '. ' + p.last;
}

/** Letter grade for potential, as shown to the user (fuzzed unless scouted). */
export function potGrade(pot: number): string {
  if (pot >= 90) return 'A+';
  if (pot >= 85) return 'A';
  if (pot >= 80) return 'B+';
  if (pot >= 75) return 'B';
  if (pot >= 70) return 'C+';
  if (pot >= 65) return 'C';
  if (pot >= 58) return 'D';
  return 'F';
}

export function starsFor(ovr: number): number {
  return clamp(Math.round((ovr - 45) / 10), 1, 5);
}
