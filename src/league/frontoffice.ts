import { clamp } from '../core/rng';
import { addNews, careerRng, payroll, playerMap, saveRng, teamPlayers, type Career, type Facilities, type Staff } from './career';
import { bumpRatings } from './season';
import { fullName } from './players';
import { unitRatings } from './depth';

export const FACILITY_INFO: Record<keyof Facilities, { name: string; desc: string }> = {
  stadium: { name: 'Stadium', desc: 'Bigger crowds: more ticket revenue and stronger home-field advantage.' },
  training: { name: 'Training Facility', desc: 'Faster player development from practice XP.' },
  rehab: { name: 'Rehab Center', desc: 'Shorter injury recovery times.' },
};

export function facilityCost(level: number) {
  return [0, 8, 14, 22, 32][level] ?? 999; // $M to go from level -> level+1
}

export function upgradeFacility(c: Career, k: keyof Facilities): string | null {
  const lvl = c.facilities[k];
  if (lvl >= 5) return 'Already at maximum level.';
  const cost = facilityCost(lvl);
  if (c.cash < cost) return `Need $${cost}M (you have $${c.cash.toFixed(1)}M).`;
  c.cash -= cost;
  c.seasonExpenses += cost;
  c.facilities[k]++;
  addNews(c, `${FACILITY_INFO[k].name} upgraded to level ${c.facilities[k]}.`);
  return null;
}

/** Ticket revenue for a home game, in $M. */
export function homeGameRevenue(c: Career): number {
  const t = c.teams[c.userTeam];
  const capacity = 52000 + c.facilities.stadium * 8000;
  const winPct = t.rec.w + t.rec.l ? t.rec.w / (t.rec.w + t.rec.l) : 0.5;
  const fill = clamp(0.55 + c.fans / 250 + winPct * 0.15, 0.4, 1);
  const price = 95 + c.facilities.stadium * 12;
  // the club keeps about half of the gate after the league's revenue sharing
  return Math.round(((capacity * fill * price * 0.5) / 1e6) * 10) / 10;
}

export function weeklyExpenses(c: Career): number {
  const staff = c.staff.reduce((s, x) => s + x.salary, 0);
  const upkeep = (c.facilities.stadium + c.facilities.training + c.facilities.rehab) * 0.08;
  return (staff + upkeep) / 16;
}

/** Revenue and costs from the club's perspective. Player salaries are paid by the league cap system. */
export function recordWeekFinances(c: Career, home: boolean) {
  let rev = 1.6 + c.fans * 0.012; // TV share + merchandise per week
  if (home) rev += homeGameRevenue(c);
  const exp = weeklyExpenses(c) + payroll(c, c.userTeam) * 0.012;
  c.cash = Math.round((c.cash + rev - exp) * 10) / 10;
  c.seasonRevenue += rev;
  c.seasonExpenses += exp;
}

export function hireStaff(c: Career, s: Staff): string | null {
  const cur = c.staff.find((x) => x.role === s.role);
  const buyout = cur ? cur.salary * Math.max(0, cur.years - 1) * 0.5 : 0;
  const signing = s.salary * 0.5;
  if (c.cash < buyout + signing) return `Need $${(buyout + signing).toFixed(1)}M for the buyout and signing.`;
  c.cash -= buyout + signing;
  c.seasonExpenses += buyout + signing;
  c.staff = c.staff.filter((x) => x.role !== s.role);
  c.staff.push({ ...s, years: Math.max(2, s.years) });
  c.staffPool = c.staffPool.filter((x) => x.id !== s.id);
  if (cur) c.staffPool.push({ ...cur, years: 2 });
  addNews(c, `Hired ${s.name} (${'★'.repeat(s.rating)}) as ${s.role}.`);
  return null;
}

/** Spend coaching credits on a single player's development. */
export function trainPlayer(c: Career, pid: number): string | null {
  const cost = 2;
  if (c.cc < cost) return 'Need 2 coaching credits.';
  const pm = playerMap(c);
  const p = pm.get(pid);
  if (!p) return 'Player not found.';
  if (p.ovr >= p.pot) return `${fullName(p)} has reached his potential.`;
  c.cc -= cost;
  const rng = careerRng(c);
  bumpRatings(p, rng, 2);
  saveRng(c, rng);
  return null;
}

export function teamBuilding(c: Career): string | null {
  if (c.cc < 2) return 'Need 2 coaching credits.';
  c.cc -= 2;
  for (const p of teamPlayers(c, c.userTeam)) p.morale = clamp(p.morale + 8, 0, 100);
  addNews(c, 'Team-building retreat boosted morale across the roster.');
  return null;
}

export function teamMorale(c: Career, teamId = c.userTeam): number {
  const ps = teamPlayers(c, teamId);
  return ps.length ? Math.round(ps.reduce((s, p) => s + p.morale, 0) / ps.length) : 50;
}

/** Owner expectations are based on the roster the coach was given. */
export function expectedWins(c: Career): number {
  const ranks = c.teams.map((t) => ({ id: t.id, ovr: unitRatings(c, t.id).ovr })).sort((a, b) => b.ovr - a.ovr);
  const rank = ranks.findIndex((r) => r.id === c.userTeam);
  return Math.round((12.5 - (rank / 31) * 9) * 10) / 10;
}

export interface Evaluation {
  expected: number;
  wins: number;
  delta: number;
  playoff: string;
  securityChange: number;
  reputationChange: number;
  fired: boolean;
  notes: string[];
}

export function evaluateCoach(c: Career, playoffResult: string, preseasonExpected: number): Evaluation {
  const t = c.teams[c.userTeam];
  const wins = t.rec.w + t.rec.t * 0.5;
  const expected = preseasonExpected;
  const delta = wins - expected;
  let sec = delta * 7;
  let rep = delta * 2.5;
  const notes: string[] = [];
  const bonus: Record<string, [number, number]> = { none: [-4, 0], WC: [6, 3], DIV: [10, 5], CONF: [16, 8], FINAL: [22, 12], CHAMP: [35, 20] };
  const [bs, br] = bonus[playoffResult] ?? [0, 0];
  sec += bs;
  rep += br;
  const profit = c.seasonRevenue - c.seasonExpenses;
  if (profit < -10) {
    sec -= 6;
    notes.push('The owner is unhappy about the team losing money.');
  } else if (profit > 15) {
    sec += 3;
    notes.push('The owner is pleased with the profits.');
  }
  if (c.fans < 30) {
    sec -= 5;
    notes.push('Fan support has collapsed.');
  } else if (c.fans > 75) sec += 3;
  if (delta >= 2) notes.push('You beat expectations.');
  if (delta <= -3) notes.push('The team badly underachieved.');
  sec = Math.round(sec);
  rep = Math.round(rep);
  c.coach.security = clamp(c.coach.security + sec, 0, 100);
  c.coach.reputation = clamp(c.coach.reputation + rep, 0, 100);
  // first-year grace period
  const fired = c.coach.security <= 12 && c.coach.seasonsWithTeam >= 1;
  return { expected, wins, delta, playoff: playoffResult, securityChange: sec, reputationChange: rep, fired, notes };
}

/** Teams willing to hire the coach (after a firing or as a voluntary move). */
export function jobOpenings(c: Career, fired: boolean): number[] {
  const rng = careerRng(c);
  const ranked = c.teams.filter((t) => t.id !== c.userTeam).map((t) => ({ id: t.id, ovr: unitRatings(c, t.id).ovr, pct: t.rec.w / Math.max(1, t.rec.w + t.rec.l) }));
  ranked.sort((a, b) => a.pct - b.pct || a.ovr - b.ovr);
  // bad teams fire their coaches; a strong reputation opens better jobs
  const poolSize = fired ? 8 : Math.round(4 + c.coach.reputation / 12);
  const pool = ranked.slice(0, Math.min(ranked.length, poolSize));
  rng.shuffle(pool);
  saveRng(c, rng);
  return pool.slice(0, fired ? 2 : c.coach.reputation >= 55 ? 3 : 0).map((x) => x.id);
}
