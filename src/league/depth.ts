import { POSITIONS, type Player, type Pos, type Ratings, type Team } from '../core/types';
import type { Career } from './career';
import { STARTERS, calcOvr } from './players';
import type { Lineup, SimPlayer } from '../game/sim';
import { Rng } from '../core/rng';

/** Rebuild a team's depth chart: keeps a user's manual order where valid, then fills by overall. */
export function autoDepth(c: Career, t: Team, keepOrder = false) {
  const pm = new Map(c.players.map((p) => [p.id, p] as const));
  const roster = t.roster.map((id) => pm.get(id)!).filter(Boolean);
  for (const pos of POSITIONS) {
    const group = roster.filter((p) => p.pos === pos);
    const prev = keepOrder ? (t.depth[pos] ?? []).filter((id) => group.some((p) => p.id === id)) : [];
    const rest = group.filter((p) => !prev.includes(p.id)).sort((a, b) => b.ovr - a.ovr);
    t.depth[pos] = [...prev, ...rest.map((p) => p.id)];
  }
}

const FALLBACK: Record<Pos, Pos[]> = {
  QB: ['RB', 'WR'], RB: ['WR', 'TE', 'DB'], WR: ['TE', 'RB', 'DB'], TE: ['WR', 'OL', 'RB'], OL: ['DL', 'TE'],
  DL: ['LB', 'OL'], LB: ['DL', 'DB'], DB: ['LB', 'WR'], K: ['QB', 'WR'],
};

/** Players available for a game at a position, healthy first in depth order, with fallbacks. */
export function available(c: Career, t: Team, pos: Pos, count: number, pm: Map<number, Player>, used: Set<number>): Player[] {
  const out: Player[] = [];
  const take = (p: Pos) => {
    for (const id of t.depth[p] ?? []) {
      if (out.length >= count) return;
      const pl = pm.get(id);
      if (!pl || pl.injury || used.has(id)) continue;
      out.push(pl);
      used.add(id);
    }
  };
  take(pos);
  for (const f of FALLBACK[pos]) if (out.length < count) take(f);
  return out;
}

/** Fill-in body when a team is completely out of players at a spot. */
function replacement(pos: Pos, teamId: number, k: number): Player {
  const base = 45;
  const r: Ratings = { spd: 60, acc: 60, str: 60, awr: 45, thp: 50, tha: 45, cth: 45, car: 50, elu: 45, rte: 45, blk: 50, prs: 45, tak: 50, cov: 45, kpw: 50, kac: 50 };
  return {
    id: -1000 - k, first: 'Practice', last: 'Squad', pos, age: 24, num: 99 - k, r, pot: base, ovr: calcOvr(pos, r), morale: 50, cond: 100, injury: null,
    contract: { salary: 0.75, years: 1 }, teamId, xp: 0, look: { skin: k % 5, hair: 0, hairColor: 0, beard: false, visor: false },
    season: {} as never, history: [], draft: null, awards: [], rookie: false,
  };
}

export interface GameRoster {
  lineup: Lineup;
  starters: Player[];
  all: Player[];
}

/** Effective in-game ratings: condition, morale, coaching and home field all matter. */
export function effective(p: Player, mod: number): Ratings {
  const condF = 0.9 + 0.1 * (p.cond / 100);
  const moraleF = 0.975 + 0.05 * (p.morale / 100);
  const f = condF * moraleF;
  const r = { ...p.r };
  for (const k of Object.keys(r) as (keyof Ratings)[]) r[k] = Math.max(1, Math.min(99, Math.round(r[k] * f + mod)));
  return r;
}

export function buildGameRoster(c: Career, teamId: number, mods: { off: number; def: number }): GameRoster {
  const t = c.teams[teamId];
  const pm = new Map(c.players.map((p) => [p.id, p] as const));
  const used = new Set<number>();
  const counts: Record<Pos, number> = { QB: 2, RB: 2, WR: 4, TE: 2, OL: 6, DL: 5, LB: 4, DB: 6, K: 1 };
  const group: Partial<Record<Pos, Player[]>> = {};
  let k = 0;
  // fill starters for every position first so fallbacks don't steal starters
  for (const pos of POSITIONS) group[pos] = available(c, t, pos, STARTERS[pos], pm, used);
  for (const pos of POSITIONS) {
    const extra = available(c, t, pos, counts[pos] - (group[pos]?.length ?? 0), pm, used);
    group[pos] = [...(group[pos] ?? []), ...extra];
    while (group[pos]!.length < STARTERS[pos]) group[pos]!.push(replacement(pos, teamId, k++));
  }
  const offPos: Pos[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'K'];
  const toSim = (p: Player, pos: Pos): SimPlayer => ({
    pid: p.id, pos: p.pos, num: p.num, name: p.last, look: p.look,
    r: effective(p, offPos.includes(pos) ? mods.off : mods.def),
  });
  const L = (pos: Pos) => (group[pos] ?? []).map((p) => toSim(p, pos));
  const lineup: Lineup = { qb: L('QB'), rb: L('RB'), wr: L('WR'), te: L('TE'), ol: L('OL'), dl: L('DL'), lb: L('LB'), db: L('DB'), k: L('K') };
  const starters: Player[] = [];
  for (const pos of POSITIONS) starters.push(...(group[pos] ?? []).slice(0, STARTERS[pos]));
  const all = POSITIONS.flatMap((pos) => group[pos] ?? []);
  return { lineup, starters, all };
}

/** Unit ratings used by the statistical simulator and team screens. */
export function unitRatings(c: Career, teamId: number) {
  const t = c.teams[teamId];
  const pm = new Map(c.players.map((p) => [p.id, p] as const));
  const used = new Set<number>();
  const grp = (pos: Pos, n: number) => available(c, t, pos, n, pm, used);
  const avg = (ps: Player[], n: number, w?: (p: Player) => number) => {
    if (!ps.length) return 40;
    let s = 0;
    for (const p of ps) s += w ? w(p) : p.ovr;
    return (s + 40 * Math.max(0, n - ps.length)) / Math.max(n, ps.length);
  };
  const qb = grp('QB', 1);
  const rb = grp('RB', 1);
  const wr = grp('WR', 3);
  const te = grp('TE', 1);
  const ol = grp('OL', 5);
  const dl = grp('DL', 4);
  const lb = grp('LB', 3);
  const db = grp('DB', 4);
  const k = grp('K', 1);
  const u = {
    qb: avg(qb, 1), rb: avg(rb, 1), wr: avg(wr, 3), te: avg(te, 1), ol: avg(ol, 5), dl: avg(dl, 4), lb: avg(lb, 3), db: avg(db, 4), k: avg(k, 1),
    qbAcc: avg(qb, 1, (p) => p.r.tha), qbPow: avg(qb, 1, (p) => p.r.thp), rbElu: avg(rb, 1, (p) => (p.r.elu + p.r.spd) / 2),
    wrSep: avg(wr, 3, (p) => (p.r.spd + p.r.rte + p.r.cth) / 3), dbCov: avg(db, 4, (p) => (p.r.cov + p.r.spd) / 2), dlRush: avg(dl, 4, (p) => (p.r.prs + p.r.str) / 2),
    olBlk: avg(ol, 5, (p) => (p.r.blk + p.r.str) / 2), kPow: avg(k, 1, (p) => p.r.kpw), kAcc: avg(k, 1, (p) => p.r.kac), runD: avg([...dl, ...lb], 7, (p) => (p.r.tak + p.r.str) / 2),
    off: 0, def: 0, ovr: 0,
  };
  u.off = Math.round(u.qb * 0.34 + u.wr * 0.2 + u.ol * 0.2 + u.rb * 0.12 + u.te * 0.08 + u.k * 0.06);
  u.def = Math.round(u.dl * 0.36 + u.lb * 0.28 + u.db * 0.36);
  u.ovr = Math.round((u.off + u.def) / 2);
  return u;
}
export type Units = ReturnType<typeof unitRatings>;

export function pickWeather(t: Team, week: number, rng: Rng): 'clear' | 'rain' | 'snow' | 'wind' | 'dome' {
  if (t.dome) return 'dome';
  const late = week >= 12;
  const r = rng.next();
  if (t.climate === 'cold' && late && r < 0.25) return 'snow';
  if (r < 0.14) return 'rain';
  if (r < 0.22) return 'wind';
  return 'clear';
}
