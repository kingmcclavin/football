import { Rng, clamp } from '../core/rng';
import { POSITIONS, type DraftPick, type Player, type Pos } from '../core/types';
import { addNews, capSpace, playerMap, SALARY_CAP, teamName, type Career } from './career';
import { MAX_ROSTER, MIN_ROSTER, STARTERS, fullName, playerValue, salaryFor } from './players';
import { autoDepth } from './depth';

export interface Demand {
  salary: number;
  years: number;
}

export function contractDemand(c: Career, p: Player, teamId: number): Demand {
  let s = salaryFor(p.pos, p.ovr, p.age);
  if (p.age <= 25 && p.pot > p.ovr + 5) s *= 1.12;
  if (teamId === p.teamId) {
    if (p.morale >= 75) s *= 0.9;
    else if (p.morale < 40) s *= 1.18;
  } else {
    const prestige = c.teams[teamId].prestige;
    s *= 1.12 - prestige / 500;
  }
  const years = p.age <= 26 ? 4 : p.age <= 29 ? 3 : p.age <= 32 ? 2 : 1;
  return { salary: Math.max(0.75, Math.round(s * 10) / 10), years };
}

/** Will a player re-sign with his current team at all? */
export function willResign(c: Career, p: Player): boolean {
  if (p.teamId < 0) return true;
  if (p.morale < 25) return false;
  const t = c.teams[p.teamId];
  if (p.ovr >= 82 && t.prestige < 25 && p.morale < 55) return false;
  return true;
}

/** Will a free agent sign with this team? */
export function faInterest(c: Career, p: Player, teamId: number): number {
  const t = c.teams[teamId];
  let interest = 50 + (t.prestige - 50) * 0.6;
  if (teamId === c.userTeam) interest += (c.coach.reputation - 40) * 0.3 + (c.fans - 50) * 0.2;
  if (p.ovr < 70) interest += 25;
  return clamp(interest, 5, 100);
}

export function rosterCount(c: Career, teamId: number) {
  return c.teams[teamId].roster.length;
}

export function signPlayer(c: Career, p: Player, teamId: number, d: Demand): string | null {
  const t = c.teams[teamId];
  if (t.roster.length >= MAX_ROSTER) return `Roster is full (${MAX_ROSTER}).`;
  if (capSpace(c, teamId) < d.salary) return 'Not enough cap space.';
  if (p.teamId >= 0 && p.teamId !== teamId) {
    const old = c.teams[p.teamId];
    old.roster = old.roster.filter((id) => id !== p.id);
  }
  p.teamId = teamId;
  p.contract = { salary: d.salary, years: d.years };
  p.morale = clamp(p.morale + 10, 0, 100);
  if (!t.roster.includes(p.id)) t.roster.push(p.id);
  autoDepth(c, t, teamId === c.userTeam);
  return null;
}

export function releasePlayer(c: Career, p: Player) {
  const t = c.teams[p.teamId];
  if (!t) return;
  t.deadCap = Math.round((t.deadCap + p.contract.salary * 0.5) * 10) / 10;
  t.roster = t.roster.filter((id) => id !== p.id);
  for (const pos of POSITIONS) t.depth[pos] = (t.depth[pos] ?? []).filter((id) => id !== p.id);
  p.teamId = -1;
  p.contract = { salary: salaryFor(p.pos, p.ovr, p.age), years: 1 };
  p.morale = 50;
}

export function positionNeeds(c: Career, teamId: number, pm: Map<number, Player>): Record<Pos, number> {
  const t = c.teams[teamId];
  const need = {} as Record<Pos, number>;
  for (const pos of POSITIONS) {
    const ps = t.roster.map((id) => pm.get(id)!).filter((p) => p && p.pos === pos);
    const healthy = ps.filter((p) => !p.injury).length;
    const best = ps.length ? Math.max(...ps.map((p) => p.ovr)) : 0;
    need[pos] = Math.max(0, STARTERS[pos] + (pos === 'K' ? 0 : 1) - healthy) * 10 + (best < 65 ? 5 : 0);
  }
  return need;
}

/** In-season AI roster upkeep: cover injuries, respect roster limits. */
export function aiWeeklyMoves(c: Career, rng: Rng, pm: Map<number, Player>) {
  const fas = c.players.filter((p) => p.teamId === -1);
  for (const t of c.teams) {
    if (t.id === c.userTeam) continue;
    const need = positionNeeds(c, t.id, pm);
    for (const pos of POSITIONS) {
      const ps = t.roster.map((id) => pm.get(id)!).filter((p) => p && p.pos === pos && !p.injury);
      if (ps.length >= STARTERS[pos] && t.roster.length >= MIN_ROSTER) continue;
      if (need[pos] <= 0) continue;
      const cand = fas.filter((p) => p.pos === pos && p.teamId === -1).sort((a, b) => b.ovr - a.ovr)[0];
      if (!cand) continue;
      if (t.roster.length >= MAX_ROSTER) {
        const cut = t.roster.map((id) => pm.get(id)!).filter((p) => p && p.pos !== pos).sort((a, b) => playerValue(a) - playerValue(b))[0];
        if (cut) releasePlayer(c, cut);
      }
      const d = { salary: Math.min(contractDemand(c, cand, t.id).salary, 2), years: 1 };
      if (capSpace(c, t.id, pm) >= d.salary && !signPlayer(c, cand, t.id, d)) {
        if (rng.chance(0.4)) addNews(c, `${t.abbr} signed free agent ${cand.pos} ${fullName(cand)}.`);
      }
    }
  }
}

// ------------------------------------------------------------------ trades

export function pickValue(c: Career, pick: DraftPick): number {
  const t = c.teams[pick.origTeam];
  const games = t.rec.w + t.rec.l + t.rec.t;
  const winPct = games ? (t.rec.w + t.rec.t * 0.5) / games : 0.5;
  const yearsOut = pick.year - c.year - (c.phase === 'offseason' ? 0 : 1);
  const slotQuality = 1 - winPct * 0.7;
  const base = pick.round === 1 ? 55 : pick.round === 2 ? 22 : 9;
  return base * (0.65 + slotQuality * 0.7) * (yearsOut > 0 ? 0.85 : 1);
}

export interface TradeOffer {
  give: number[]; // player ids from the user
  get: number[]; // player ids from the AI
  givePicks: DraftPick[];
  getPicks: DraftPick[];
  partner: number;
}

export function evaluateTrade(c: Career, o: TradeOffer): { ok: boolean; reason: string; giveV: number; getV: number } {
  const pm = playerMap(c);
  const giveP = o.give.map((id) => pm.get(id)!);
  const getP = o.get.map((id) => pm.get(id)!);
  const giveV = giveP.reduce((s, p) => s + playerValue(p), 0) + o.givePicks.reduce((s, p) => s + pickValue(c, p), 0);
  const getV = getP.reduce((s, p) => s + playerValue(p), 0) + o.getPicks.reduce((s, p) => s + pickValue(c, p), 0);
  if (!giveP.length && !getP.length && !o.givePicks.length && !o.getPicks.length) return { ok: false, reason: 'Add players or picks to the trade.', giveV, getV };
  // cap checks after the trade
  const userIn = getP.reduce((s, p) => s + p.contract.salary, 0);
  const userOut = giveP.reduce((s, p) => s + p.contract.salary, 0);
  if (capSpace(c, c.userTeam, pm) - userIn + userOut < 0) return { ok: false, reason: 'You would be over the salary cap.', giveV, getV };
  if (capSpace(c, o.partner, pm) - userOut + userIn < 0) return { ok: false, reason: `${c.teams[o.partner].abbr} would be over the cap.`, giveV, getV };
  const userRoster = c.teams[c.userTeam].roster.length - giveP.length + getP.length;
  const theirRoster = c.teams[o.partner].roster.length - getP.length + giveP.length;
  if (userRoster > MAX_ROSTER || theirRoster > MAX_ROSTER) return { ok: false, reason: 'A roster would exceed 40 players.', giveV, getV };
  if (userRoster < MIN_ROSTER - 4 || theirRoster < MIN_ROSTER - 4) return { ok: false, reason: 'A roster would be too small.', giveV, getV };
  // AI wants a premium, more for its stars
  const premium = 1.1 + (c.difficulty === 'legend' ? 0.15 : c.difficulty === 'allpro' ? 0.08 : c.difficulty === 'rookie' ? -0.05 : 0);
  if (giveV < getV * premium) return { ok: false, reason: `${c.teams[o.partner].abbr} want more value in return.`, giveV, getV };
  return { ok: true, reason: 'Deal accepted!', giveV, getV };
}

export function executeTrade(c: Career, o: TradeOffer) {
  const pm = playerMap(c);
  const user = c.teams[c.userTeam];
  const them = c.teams[o.partner];
  for (const id of o.give) {
    const p = pm.get(id)!;
    user.roster = user.roster.filter((x) => x !== id);
    them.roster.push(id);
    p.teamId = them.id;
    p.morale = clamp(p.morale - 5, 0, 100);
  }
  for (const id of o.get) {
    const p = pm.get(id)!;
    them.roster = them.roster.filter((x) => x !== id);
    user.roster.push(id);
    p.teamId = user.id;
  }
  for (const pk of o.givePicks) {
    const real = c.picks.find((x) => x.year === pk.year && x.round === pk.round && x.origTeam === pk.origTeam);
    if (real) real.owner = them.id;
  }
  for (const pk of o.getPicks) {
    const real = c.picks.find((x) => x.year === pk.year && x.round === pk.round && x.origTeam === pk.origTeam);
    if (real) real.owner = user.id;
  }
  autoDepth(c, user, true);
  autoDepth(c, them);
  const names = (ids: number[]) => ids.map((id) => fullName(pm.get(id)!)).join(', ');
  addNews(c, `TRADE: ${user.abbr} send ${names(o.give) || 'picks'} to ${them.abbr} for ${names(o.get) || 'picks'}.`);
}

export function capAfterSigning(c: Career, salary: number) {
  return Math.round((capSpace(c, c.userTeam) - salary) * 10) / 10;
}

export { SALARY_CAP, teamName };
