// Statistical play-by-play simulator used for CPU games (and when the user sims).
// It drives the same rules engine as the playable game so clock, downs,
// scoring and overtime behave identically.
import { Rng, clamp } from '../core/rng';
import type { Player, Pos, Weather } from '../core/types';
import { applyResult, applyRunoff, callTimeout, fgDistance, newGame, other, type GameState, type Side } from '../game/rules';
import { decideOffense, fgMakeProb, maxFgRange, wantsOnside, wantsTwoPoint } from '../game/ai';
import { BoxCollector } from './boxscore';
import type { BoxScore, Career } from './career';
import { available, unitRatings, type Units } from './depth';
import { shortName } from './players';

interface SideCtx {
  teamId: number;
  u: Units;
  qb: Player[];
  rb: Player[];
  wr: Player[];
  te: Player[];
  dl: Player[];
  lb: Player[];
  db: Player[];
  k: Player[];
  boost: number;
  passBias: number;
  aggression: number;
}

function ctxFor(c: Career, teamId: number, boost: number): SideCtx {
  const t = c.teams[teamId];
  const pm = new Map(c.players.map((p) => [p.id, p] as const));
  const used = new Set<number>();
  const g = (pos: Pos, n: number) => available(c, t, pos, n, pm, used);
  const u = unitRatings(c, teamId);
  let passBias = t.passBias;
  let aggression = t.aggression;
  if (teamId === c.userTeam) {
    passBias = c.strategy.off === 'pass' ? 0.66 : c.strategy.off === 'run' ? 0.4 : 0.53;
    aggression = c.strategy.def === 'aggressive' ? 0.7 : c.strategy.def === 'conservative' ? 0.3 : 0.5;
  }
  return { teamId, u, qb: g('QB', 1), rb: g('RB', 2), wr: g('WR', 4), te: g('TE', 2), dl: g('DL', 4), lb: g('LB', 3), db: g('DB', 4), k: g('K', 1), boost, passBias, aggression };
}

function pickW(rng: Rng, ps: Player[], w: number[]): Player | null {
  const items = ps.slice(0, w.length);
  if (!items.length) return null;
  return rng.weighted(items, items.map((p, i) => w[i] * (0.6 + p.ovr / 100)));
}

export interface SimOptions {
  playoff?: string;
  week: number;
  weather: Weather;
  quarterLength: number;
  homeBoost?: number;
  awayBoost?: number;
}

export function simulateGame(c: Career, homeId: number, awayId: number, gameId: number, rng: Rng, o: SimOptions): BoxScore {
  const box = new BoxCollector(homeId, awayId);
  const g = newGame({ quarterLength: o.quarterLength, playoff: !!o.playoff, openingKicker: rng.chance(0.5) ? 0 : 1 });
  continueStatSim(c, g, box, rng, o);
  return box.finish(gameId, c.year, o.week, g, o.weather, false, o.playoff);
}

/** Runs the statistical simulator from any game state until the final whistle. */
export function continueStatSim(c: Career, g: GameState, box: BoxCollector, rng: Rng, o: SimOptions) {
  const sides: [SideCtx, SideCtx] = [ctxFor(c, box.homeId, 1.5 + (o.homeBoost ?? 0)), ctxFor(c, box.awayId, o.awayBoost ?? 0)];
  const weather = o.weather;
  let guard = 0;
  while (g.phase !== 'final' && guard++ < 600) {
    const off = g.possession;
    const O = sides[off];
    const D = sides[other(off)];
    if (g.phase === 'kickoff' || g.phase === 'freekick') {
      simKick(g, O, D, rng, box, weather);
      continue;
    }
    if (g.phase === 'pat') {
      const two = wantsTwoPoint(g, rng, O.aggression);
      const k = O.k[0];
      if (two) {
        const p = clamp(0.47 + (O.u.off - D.u.def) * 0.008, 0.3, 0.65);
        const ok = rng.chance(p);
        applyResult(g, { kind: 'pat', points: ok ? 2 : 0 });
        if (ok) box.points(g, off, 2);
      } else {
        const ok = rng.chance(fgMakeProb(33, k?.r.kpw ?? 60, k?.r.kac ?? 60, weather) + 0.02);
        if (k) box.add(k.id, off, { xpA: 1, xpM: ok ? 1 : 0 });
        applyResult(g, { kind: 'pat', points: ok ? 1 : 0 });
        if (ok) box.points(g, off, 1);
      }
      continue;
    }
    // scrimmage
    if (aiTimeouts(g)) continue;
    if (applyRunoff(g)) continue;
    const k = O.k[0];
    const decision = decideOffense(g, { passBias: O.passBias, aggression: O.aggression, kickRange: maxFgRange(k?.r.kpw ?? 60, k?.r.kac ?? 60) }, rng);
    const los = g.ballOn;
    box.team[off].plays++;
    if (g.down === 3) box.team[off].thirdAtt++;
    const downBefore = g.down;
    const toGoBefore = g.toGo;
    if (decision === 'kneel') {
      applyResult(g, { kind: 'scrimmage', endX: los - 1, incomplete: false, outOfBounds: false, turnover: false, offTd: false, defTd: false, safety: false, touchback: false, elapsed: 2, kneel: true });
      continue;
    }
    if (decision === 'spike') {
      const qb = O.qb[0];
      if (qb) box.add(qb.id, off, { pAtt: 1 });
      applyResult(g, { kind: 'scrimmage', endX: los, incomplete: true, outOfBounds: false, turnover: false, offTd: false, defTd: false, safety: false, touchback: false, elapsed: 1, spike: true });
      continue;
    }
    if (decision === 'fg') {
      const dist = fgDistance(los);
      const ok = rng.chance(fgMakeProb(dist, k?.r.kpw ?? 60, k?.r.kac ?? 60, weather));
      if (k) box.add(k.id, off, { fgA: 1, fgM: ok ? 1 : 0, fgLng: ok ? dist : 0 });
      if (ok) {
        box.points(g, off, 3);
        box.key(g, `${k ? shortName(k) : 'Kicker'} ${dist}-yd field goal (${c.teams[O.teamId].abbr})`);
      }
      applyResult(g, { kind: 'fg', good: ok, elapsed: 5 });
      continue;
    }
    if (decision === 'punt') {
      const kp = k?.r.kpw ?? 60;
      let d = 38 + (kp - 60) * 0.2 + rng.normal(0, 5);
      const landing = los + d;
      let recv: number;
      if (landing >= 100) {
        recv = 20;
        d = 100 - los - 20 + 20;
      } else {
        const fair = landing > 88 || rng.chance(0.35);
        const ret = fair ? 0 : Math.max(0, rng.normal(8, 6));
        recv = clamp(100 - landing + ret, 1, 99);
      }
      if (k) box.add(k.id, off, { punts: 1, puntYds: Math.round(Math.min(d, 100 - los)) });
      recv = Math.round(recv);
      applyResult(g, { kind: 'punt', recvBallOn: recv, returnTd: false, kickingRecovers: false, outOfBounds: false, elapsed: 7 });
      continue;
    }
    const res = decision === 'pass' ? simPass(g, O, D, rng, box, c, weather) : simRun(g, O, D, rng, box, c, weather);
    applyResult(g, res);
    if (res.offTd) box.points(g, off, 6);
    if (res.defTd) box.points(g, other(off), 6);
    if (res.safety) box.points(g, other(off), 2);
    if (res.turnover) box.team[off].turnovers++;
    const gained = res.endX - los;
    if (!res.turnover && !res.offTd && gained >= toGoBefore) {
      box.team[off].firstDowns++;
      if (downBefore === 3) box.team[off].thirdConv++;
    } else if (res.offTd) {
      box.team[off].firstDowns++;
      if (downBefore === 3) box.team[off].thirdConv++;
    }
    box.team[off].top += res.elapsed + 25 * (g.quarterLength / 900);
  }
}

function aiTimeouts(g: GameState): boolean {
  // defense trailing late burns timeouts to save clock
  const def = other(g.possession);
  const diff = g.score[def] - g.score[g.possession];
  const scale = g.quarterLength / 900;
  if (g.clockRunning && g.quarter >= 4 && g.clock < 150 * scale && diff < 0 && diff >= -16 && g.timeouts[def] > 0) {
    callTimeout(g, def);
    return false;
  }
  const off = g.possession;
  const od = g.score[off] - g.score[def];
  if (g.clockRunning && (g.quarter === 2 || g.quarter >= 4) && g.clock < 60 * scale && od <= 0 && g.timeouts[off] > 0) callTimeout(g, off);
  return false;
}

function simKick(g: GameState, K: SideCtx, R: SideCtx, rng: Rng, box: BoxCollector, weather: string) {
  const kicker = g.possession;
  const free = g.phase === 'freekick';
  if (!free && wantsOnside(g)) {
    const rec = rng.chance(0.12);
    applyResult(g, { kind: 'kickoff', recvBallOn: 55, returnTd: false, kickingRecovers: rec, outOfBounds: false, elapsed: 3, kickBallOn: 45 });
    box.key(g, rec ? `${'Onside kick recovered'}` : 'Onside kick fails');
    return;
  }
  const kp = K.k[0]?.r.kpw ?? 60;
  const tbChance = free ? 0.05 : clamp(0.45 + (kp - 70) * 0.012 - (weather === 'wind' ? 0.1 : 0), 0.15, 0.85);
  if (rng.chance(tbChance)) {
    applyResult(g, { kind: 'kickoff', recvBallOn: 30, returnTd: false, kickingRecovers: false, outOfBounds: false, elapsed: 0 });
    return;
  }
  const returner = [...R.rb, ...R.wr].sort((a, b) => b.r.spd - a.r.spd)[0];
  const start = free ? rng.range(15, 30) : rng.range(-4, 6);
  let ret = Math.max(5, rng.normal(23, 7) + ((returner?.r.spd ?? 80) - 85) * 0.3);
  const td = rng.chance(0.006);
  if (rng.chance(0.03)) ret += rng.range(15, 45);
  const spot = td ? 100 : Math.round(clamp(start + ret, 5, 99));
  if (returner) box.add(returner.id, other(kicker), { krYds: Math.round(spot - Math.max(start, 0)), krTd: td ? 1 : 0 });
  if (td) {
    box.points(g, other(kicker), 6);
    box.key(g, `${returner ? shortName(returner) : 'Returner'} kickoff return touchdown`);
  }
  applyResult(g, { kind: 'kickoff', recvBallOn: spot, returnTd: td, kickingRecovers: false, outOfBounds: false, elapsed: 6 });
}

function tackler(rng: Rng, D: SideCtx, run: boolean): Player | null {
  const pool = [...D.dl, ...D.lb, ...D.db];
  const w = pool.map((p) => (p.pos === 'LB' ? 1.6 : p.pos === 'DB' ? (run ? 0.7 : 1.3) : run ? 1.0 : 0.5));
  return pool.length ? rng.weighted(pool, w) : null;
}

function simPass(g: GameState, O: SideCtx, D: SideCtx, rng: Rng, box: BoxCollector, c: Career, weather: string) {
  const off = g.possession;
  const def = other(off);
  const los = g.ballOn;
  const qb = O.qb[0];
  const uo = O.u;
  const ud = D.u;
  const b = O.boost - D.boost;
  const base = { kind: 'scrimmage' as const, incomplete: false, outOfBounds: false, turnover: false, offTd: false, defTd: false, safety: false, touchback: false };
  // sack
  const sackP = clamp(0.065 + (ud.dlRush - uo.olBlk) * 0.0028 - b * 0.003, 0.025, 0.14);
  if (rng.chance(sackP)) {
    const loss = Math.round(rng.range(3, 10));
    void 0;
    const sacker = rng.weighted([...D.dl, ...D.lb], [...D.dl.map((p) => p.r.prs), ...D.lb.map((p) => p.r.prs * 0.4)]);
    if (sacker) box.add(sacker.id, def, { sacks: 1, tkl: 1 });
    if (qb) box.add(qb.id, off, { sacked: 1 });
    box.team[def].sacks++;
    // strip sack
    if (rng.chance(0.08)) {
      if (qb) box.add(qb.id, off, { fum: 1 });
      if (sacker) box.add(sacker.id, def, { ff: 1 });
      if (rng.chance(0.5)) {
        return { ...base, endX: los - loss, turnover: true, elapsed: 5 };
      }
    }
    const endX = los - loss;
    if (endX <= 0) return { ...base, endX, safety: true, elapsed: 5 };
    return { ...base, endX, elapsed: 5 };
  }
  // target depth
  const toGoal = 100 - los;
  const depthCat = rng.weighted(['short', 'medium', 'deep'], [0.56, 0.3, toGoal > 20 ? 0.14 : 0.03]);
  let air = depthCat === 'short' ? rng.range(-2, 9) : depthCat === 'medium' ? rng.range(10, 19) : rng.range(20, 45);
  air = Math.min(air, toGoal + 8);
  const sep = (uo.wrSep - ud.dbCov) * 0.006;
  let comp = 0.69 + (uo.qbAcc - 72) * 0.005 + sep + b * 0.005 - (depthCat === 'deep' ? 0.28 : depthCat === 'medium' ? 0.1 : -0.06);
  if (weather === 'rain' || weather === 'snow') comp -= 0.04;
  if (weather === 'wind') comp -= depthCat === 'deep' ? 0.08 : 0.02;
  comp = clamp(comp, 0.2, 0.86);
  const intP = clamp(0.022 - (uo.qbAcc - 72) * 0.0006 - sep * 0.08 + (depthCat === 'deep' ? 0.018 : 0) - b * 0.001, 0.006, 0.06);
  const target = pickW(rng, [...O.wr.slice(0, 3), ...O.te.slice(0, 1), ...O.rb.slice(0, 1), ...O.wr.slice(3), ...O.te.slice(1), ...O.rb.slice(1)], [1.25, 1.05, 0.7, 0.85, 0.65, 0.2, 0.15, 0.2]);
  if (qb) box.add(qb.id, off, { pAtt: 1 });
  if (target) box.add(target.id, off, { tgt: 1 });
  const r = rng.next();
  const elapsedInc = 4;
  if (r < intP) {
    const picker = rng.weighted([...D.db, ...D.lb], [...D.db.map((p) => p.r.cov), ...D.lb.map((p) => p.r.cov * 0.3)]);
    if (qb) box.add(qb.id, off, { pInt: 1 });
    if (picker) box.add(picker.id, def, { dInt: 1 });
    const spot = los + air;
    const retTd = rng.chance(0.06);
    if (retTd) {
      if (picker) box.add(picker.id, def, { defTd: 1 });
      box.key(g, `${picker ? shortName(picker) : 'Defender'} pick-six (${c.teams[D.teamId].abbr})`);
      return { ...base, endX: 0, turnover: true, defTd: true, elapsed: 7 };
    }
    const ret = Math.max(0, rng.normal(9, 8));
    const endX = spot - ret;
    if (endX >= 100) return { ...base, endX: 100, turnover: true, touchback: true, elapsed: 5 };
    box.key(g, `${picker ? shortName(picker) : 'Defender'} intercepts ${qb ? shortName(qb) : 'the QB'}`);
    return { ...base, endX: Math.max(1, endX), turnover: true, elapsed: 6 };
  }
  if (r < intP + comp) {
    let yac = Math.pow(rng.next(), 2) * 8 + ((target?.r.spd ?? 80) - 82) * 0.05 + (depthCat === 'short' ? 1.5 : 0);
    if (rng.chance(0.025 + (uo.wrSep - ud.dbCov) * 0.001)) yac += rng.range(10, 45);
    let gain = Math.round(air + Math.max(0, yac));
    let td = false;
    if (los + gain >= 100) {
      gain = Math.round(100 - los);
      td = true;
    }
    if (los + gain <= 0) gain = Math.round(1 - los);
    if (qb) box.add(qb.id, off, { pCmp: 1, pYds: gain, pLng: gain, pTd: td ? 1 : 0 });
    if (target) box.add(target.id, off, { rec: 1, recYds: gain, recLng: gain, recTd: td ? 1 : 0 });
    box.team[off].passYds += gain;
    box.team[off].yds += gain;
    if (td) box.key(g, `${target ? shortName(target) : 'Receiver'} ${gain}-yd TD catch from ${qb ? shortName(qb) : 'QB'}`);
    else {
      const tk = tackler(rng, D, false);
      if (tk) box.add(tk.id, def, { tkl: 1 });
      // fumble after the catch
      if (rng.chance(0.005) && target) {
        box.add(target.id, off, { fum: 1 });
        if (tk) box.add(tk.id, def, { ff: 1, fr: 1 });
        return { ...base, endX: los + gain, turnover: true, elapsed: 6 };
      }
    }
    if (gain >= 25 && !td) box.key(g, `${qb ? shortName(qb) : 'QB'} hits ${target ? shortName(target) : 'receiver'} for ${gain} yards`);
    const oob = !td && rng.chance(0.18);
    return { ...base, endX: los + gain, offTd: td, outOfBounds: oob, elapsed: td ? 6 : 6 };
  }
  // incomplete: sometimes a pass defended
  if (rng.chance(0.3)) {
    const pd = pickW(rng, D.db, [1, 1, 0.7, 0.7]);
    if (pd) box.add(pd.id, def, { pd: 1 });
  }
  return { ...base, endX: los, incomplete: true, elapsed: elapsedInc };
}

function simRun(g: GameState, O: SideCtx, D: SideCtx, rng: Rng, box: BoxCollector, c: Career, weather: string) {
  const off = g.possession;
  const def = other(off);
  const los = g.ballOn;
  const qbRun = rng.chance(0.08) || (g.toGo <= 1 && rng.chance(0.25));
  const carrier = qbRun ? O.qb[0] : rng.chance(0.82) ? O.rb[0] ?? O.rb[1] : O.rb[1] ?? O.rb[0];
  const uo = O.u;
  const ud = D.u;
  const b = O.boost - D.boost;
  const base = { kind: 'scrimmage' as const, incomplete: false, outOfBounds: false, turnover: false, offTd: false, defTd: false, safety: false, touchback: false };
  const mean = 4.1 + (uo.olBlk - ud.runD) * 0.06 + ((carrier ? (carrier.r.elu + carrier.r.spd) / 2 : 70) - 75) * 0.04 + b * 0.05;
  let gain = rng.normal(mean, 3.3);
  if (rng.chance(0.08)) gain = -rng.range(1, 4);
  if (rng.chance(0.03 + (uo.rbElu - 75) * 0.0008)) gain += rng.range(12, 55);
  if (weather === 'snow') gain -= 0.4;
  gain = Math.round(gain);
  if (carrier) box.add(carrier.id, off, { rAtt: 1 });
  let td = false;
  if (los + gain >= 100) {
    gain = Math.round(100 - los);
    td = true;
  }
  if (los + gain <= 0) {
    if (carrier) box.add(carrier.id, off, { rYds: gain });
    return { ...base, endX: los + gain, safety: true, elapsed: 5 };
  }
  if (carrier) box.add(carrier.id, off, { rYds: gain, rLng: gain, rTd: td ? 1 : 0 });
  box.team[off].rushYds += gain;
  box.team[off].yds += gain;
  if (td) {
    box.key(g, `${carrier ? shortName(carrier) : 'Runner'} ${gain}-yd TD run`);
    return { ...base, endX: 100, offTd: true, elapsed: 6 };
  }
  const tk = tackler(rng, D, true);
  if (tk) box.add(tk.id, def, { tkl: 1 });
  const fumP = (0.006 + (70 - (carrier?.r.car ?? 70)) * 0.0002) * (weather === 'rain' || weather === 'snow' ? 1.4 : 1);
  if (rng.chance(clamp(fumP, 0.002, 0.03))) {
    if (carrier) box.add(carrier.id, off, { fum: 1 });
    if (rng.chance(0.55)) {
      if (tk) box.add(tk.id, def, { ff: 1, fr: 1 });
      box.key(g, `${carrier ? shortName(carrier) : 'Runner'} fumbles, ${c.teams[D.teamId].abbr} recover`);
      return { ...base, endX: los + gain, turnover: true, elapsed: 6 };
    }
  }
  if (gain >= 20) box.key(g, `${carrier ? shortName(carrier) : 'Runner'} breaks off a ${gain}-yd run`);
  return { ...base, endX: los + gain, outOfBounds: rng.chance(0.1), elapsed: 6 };
}

export type { Side };
