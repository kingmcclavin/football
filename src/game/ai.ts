// Situational coaching AI shared by the interactive match and the statistical sim.
import { Rng, clamp } from '../core/rng';
import { fgDistance, other, runoffSeconds, type GameState } from './rules';
import { DEF_CALLS, PLAYS, type DefCall, type PlayDef } from './playbook';

export type OffDecision = 'run' | 'pass' | 'punt' | 'fg' | 'kneel' | 'spike';

export interface Tendencies {
  passBias: number; // 0..1
  aggression: number; // 0..1
  kickRange: number; // max comfortable FG distance
}

export function maxFgRange(kpw: number, kac: number) {
  return Math.round(40 + (kpw - 50) * 0.42 + (kac - 50) * 0.08);
}

export function fgMakeProb(dist: number, kpw: number, kac: number, weather: string): number {
  const range = maxFgRange(kpw, kac) + 6;
  let p = 0.995 - Math.max(0, dist - 25) * (0.0075 + (90 - kac) * 0.0002);
  if (dist > range - 6) p -= (dist - (range - 6)) * 0.07;
  if (weather === 'wind') p -= 0.06;
  if (weather === 'snow' || weather === 'rain') p -= 0.03;
  return clamp(p, 0.02, 0.995);
}

export function shouldKneel(g: GameState): boolean {
  const off = g.possession;
  const lead = g.score[off] - g.score[other(off)];
  if (lead <= 0) return false;
  if (g.quarter < 4 && !(g.quarter === 2 && g.clock < 25 && g.ballOn < 60)) return false;
  if (g.quarter === 2) return true;
  const defTo = g.timeouts[other(off)];
  const downsLeft = 4 - g.down + 1;
  const kneelRun = runoffSeconds(g, 'kneel');
  const burn = Math.max(0, downsLeft - defTo) * kneelRun + downsLeft * 2;
  return g.clock <= burn && g.ot === null;
}

export function decideOffense(g: GameState, t: Tendencies, rng: Rng): OffDecision {
  const off = g.possession;
  const diff = g.score[off] - g.score[other(off)];
  const scale = g.quarterLength / 900;
  const late = g.quarter >= 4 && g.clock < 240 * scale;
  const halfEnd = g.quarter === 2 && g.clock < 20 * scale + 3;
  const dist = fgDistance(g.ballOn);
  const inRange = dist <= t.kickRange;
  if (shouldKneel(g)) return 'kneel';
  // last-second field goals
  if ((halfEnd || (g.quarter >= 4 && g.clock < 12 * scale + 3 && diff >= -3 && diff <= 0)) && inRange) return 'fg';
  if (g.ot && inRange && g.down >= 3 && g.score[off] === g.score[other(off)] && dist < t.kickRange - 8) return 'fg';
  if (g.down === 4) {
    const desperate = late && diff < 0 && !(inRange && diff >= -3);
    if (desperate) return passOrRun(g, t, rng, true);
    const goShort = g.toGo <= 1.5 && g.ballOn >= 35 && rng.chance(0.25 + t.aggression * 0.5);
    const goMid = g.toGo <= 3 && g.ballOn >= 55 && !inRange && rng.chance(0.3 + t.aggression * 0.4);
    if (goShort || goMid) return passOrRun(g, t, rng, false);
    if (inRange) return 'fg';
    if (g.ballOn >= 62 && g.toGo <= 5 && rng.chance(t.aggression * 0.6)) return passOrRun(g, t, rng, false);
    return 'punt';
  }
  // spike to stop the clock in a two-minute drill
  if (g.clockRunning && (g.quarter === 2 || g.quarter >= 4) && g.clock < 22 * scale + 2 && g.clock > 2 && g.down < 4 && diff <= 0 && g.timeouts[off] === 0) return 'spike';
  return passOrRun(g, t, rng, late && diff < 0);
}

function passOrRun(g: GameState, t: Tendencies, rng: Rng, mustPass: boolean): OffDecision {
  const off = g.possession;
  const diff = g.score[off] - g.score[other(off)];
  let p = t.passBias;
  if (g.down >= 2 && g.toGo >= 7) p += 0.22;
  else if (g.toGo <= 2) p -= 0.25;
  if (g.down === 1) p -= 0.08;
  if (g.down === 3 && g.toGo >= 4) p += 0.2;
  const scale = g.quarterLength / 900;
  if (g.quarter >= 4 && g.clock < 300 * scale) {
    if (diff < 0) p += 0.3;
    if (diff > 0) p -= 0.3;
  }
  if (g.quarter === 2 && g.clock < 120 * scale) p += 0.2;
  if (mustPass) p = 0.95;
  return rng.chance(clamp(p, 0.08, 0.95)) ? 'pass' : 'run';
}

/** Picks an actual play from the playbook for the physics sim. */
export function pickPlay(g: GameState, kind: OffDecision, rng: Rng): PlayDef {
  if (kind === 'kneel') return PLAYS.find((p) => p.id === 'kneel')!;
  if (kind === 'spike') return PLAYS.find((p) => p.id === 'spike')!;
  const toGoal = 100 - g.ballOn;
  if (kind === 'run') {
    if (g.toGo <= 1 && (toGoal <= 3 || rng.chance(0.4))) return rng.pick(PLAYS.filter((p) => p.id === 'sneak' || p.id === 'goalline'));
    const runs = PLAYS.filter((p) => p.cat === 'run' && p.id !== 'sneak' && p.id !== 'goalline');
    return rng.pick(runs);
  }
  const scale = g.quarterLength / 900;
  if ((g.quarter === 2 || g.quarter >= 4) && g.clock < 8 * scale + 3 && toGoal > 35) return PLAYS.find((p) => p.id === 'hailmary')!;
  let w = { short: 0.45, medium: 0.3, deep: 0.13, screen: 0.06, pa: 0.06 };
  if (g.toGo >= 10) w = { short: 0.3, medium: 0.38, deep: 0.2, screen: 0.06, pa: 0.06 };
  if (g.toGo <= 4) w = { short: 0.6, medium: 0.18, deep: 0.08, screen: 0.06, pa: 0.08 };
  if (toGoal < 15) w = { short: 0.55, medium: 0.35, deep: 0.0, screen: 0.05, pa: 0.05 };
  const cats = Object.keys(w) as (keyof typeof w)[];
  const cat = rng.weighted(cats, cats.map((k) => w[k]));
  const pool = PLAYS.filter((p) => p.cat === cat);
  return rng.pick(pool);
}

/** Defensive coordinator: reads down, distance and situation. */
export function pickDefense(g: GameState, aggression: number, style: 'balanced' | 'aggressive' | 'conservative', rng: Rng): DefCall {
  const off = g.possession;
  const diff = g.score[off] - g.score[other(off)];
  const toGoal = 100 - g.ballOn;
  const scale = g.quarterLength / 900;
  const by = (id: string) => DEF_CALLS.find((d) => d.id === id)!;
  const blitzW = style === 'aggressive' ? 1.8 : style === 'conservative' ? 0.4 : 1;
  if (toGoal <= 3 || (g.toGo <= 1 && g.down >= 3)) return rng.chance(0.7) ? by('goal') : by('runstuff');
  // prevent when protecting a lead late
  if (g.quarter >= 4 && g.clock < 120 * scale && diff < 0 && diff >= -8 && g.toGo > 5) return rng.chance(0.65) ? by('c4') : by('c3');
  const w: Record<string, number> = { c2: 1, c3: 1.2, c1: 0.9, m2: 0.6, c4: 0.3, zblitz: 0.5 * blitzW, c0: 0.25 * blitzW * (0.5 + aggression), runstuff: 0.5, goal: 0, c34: 0.6 };
  if (g.toGo >= 8) {
    w.c4 += 0.6;
    w.c2 += 0.4;
    w.runstuff = 0.1;
  } else if (g.toGo <= 3) {
    w.runstuff += 0.9;
    w.c1 += 0.4;
    w.c0 += 0.2 * blitzW;
  }
  if (g.down === 3 && g.toGo >= 5) {
    w.zblitz += 0.5 * blitzW;
    w.c0 += 0.25 * blitzW;
  }
  const ids = Object.keys(w);
  return by(rng.weighted(ids, ids.map((k) => w[k])));
}

export function wantsTwoPoint(g: GameState, rng: Rng, aggression: number): boolean {
  const off = g.possession;
  const diff = g.score[off] - g.score[other(off)]; // after the TD
  const late = g.quarter >= 4 && g.clock < 600 * (g.quarterLength / 900);
  if (late && [-2, -5, -10, 1, 5, -13, 12].includes(diff)) return true;
  if (g.quarter >= 4 && g.clock < 120 && diff === -1) return true;
  return rng.chance(0.03 + aggression * 0.04);
}

export function wantsOnside(g: GameState): boolean {
  const k = g.possession;
  const diff = g.score[k] - g.score[other(k)];
  return g.quarter >= 4 && g.clock < 150 * (g.quarterLength / 900) && diff < 0 && diff >= -16;
}
