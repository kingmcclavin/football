import { Rng, clamp } from '../core/rng';
import { POSITIONS, emptyStats, emptyTeamSeason, type Player, type Pos } from '../core/types';
import {
  addNews, careerRng, generateStaffPool, playerMap, saveRng, teamName, teamPlayers,
  type Career, type SeasonAwards, type SeasonSummary,
} from './career';
import { MAX_ROSTER, ROSTER_TEMPLATE, STARTERS, fullName, generatePlayer, playerValue, refreshOvr, salaryFor, setNextPlayerId } from './players';
import { autoDepth } from './depth';
import { buildSchedule } from './schedule';
import { divisionStandings, recordText } from './standings';
import { updateSeasonRecords, careerTotal } from './records';
import { unlock } from './achievements';
import { evaluateCoach, expectedWins, jobOpenings } from './frontoffice';
import { contractDemand, faInterest, positionNeeds, releasePlayer, signPlayer, willResign } from './transactions';

// ------------------------------------------------------------------ awards

function offScore(p: Player) {
  const s = p.season;
  return s.pYds / 25 + s.pTd * 4 - s.pInt * 3 + s.rYds / 10 + s.rTd * 6 + s.recYds / 10 + s.recTd * 6 - s.fum * 2;
}
function defScore(p: Player) {
  const s = p.season;
  return s.sacks * 4 + s.dInt * 5 + s.tkl * 0.6 + s.ff * 3 + s.pd * 1 + s.defTd * 6 + s.fr * 2;
}

export function computeAwards(c: Career): SeasonAwards {
  const active = c.players.filter((p) => p.teamId >= 0 && p.season.gp > 0);
  const winF = (p: Player) => 1 + (c.teams[p.teamId].rec.w - 8) * 0.04;
  const best = (ps: Player[], f: (p: Player) => number) => ps.reduce<Player | null>((b, p) => (!b || f(p) > f(b) ? p : b), null);
  const mvp = best(active.filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.pos)), (p) => offScore(p) * winF(p) * (p.pos === 'QB' ? 1.1 : 1));
  const opoy = best(active.filter((p) => ['RB', 'WR', 'TE', 'QB'].includes(p.pos) && p !== mvp), offScore);
  const dpoy = best(active.filter((p) => ['DL', 'LB', 'DB'].includes(p.pos)), defScore);
  const oroy = best(active.filter((p) => p.rookie && ['QB', 'RB', 'WR', 'TE', 'OL'].includes(p.pos)), offScore);
  const droy = best(active.filter((p) => p.rookie && ['DL', 'LB', 'DB'].includes(p.pos)), defScore);
  // coach of the year: most improved record
  let coy = 0;
  let bestImp = -99;
  for (const t of c.teams) {
    const prev = t.history[t.history.length - 1];
    const imp = t.rec.w - (prev ? prev.w : 8) + t.rec.w * 0.3;
    if (imp > bestImp) {
      bestImp = imp;
      coy = t.id;
    }
  }
  const tag = (p: Player | null) => (p ? `${fullName(p)} (${p.pos}, ${c.teams[p.teamId].abbr})` : '-');
  const a: SeasonAwards = {
    year: c.year, mvp: mvp?.id, opoy: opoy?.id, dpoy: dpoy?.id, oroy: oroy?.id, droy: droy?.id, coy,
    names: { MVP: tag(mvp), 'Offensive POY': tag(opoy), 'Defensive POY': tag(dpoy), 'Off. Rookie': tag(oroy), 'Def. Rookie': tag(droy), 'Coach of the Year': teamName(c.teams[coy]) },
  };
  const label: Record<string, string> = { mvp: 'MVP', opoy: 'OPOY', dpoy: 'DPOY', oroy: 'OROY', droy: 'DROY' };
  for (const k of Object.keys(label)) {
    const id = (a as unknown as Record<string, number | undefined>)[k];
    const p = active.find((x) => x.id === id);
    if (p) p.awards.push(`${c.year} ${label[k]}`);
  }
  return a;
}

export function userPlayoffResult(c: Career): string {
  const u = c.userTeam;
  if (c.playoffs?.champion === u) return 'CHAMP';
  const lost = c.schedule.find((g) => g.playoff && g.played && (g.home === u || g.away === u) && (g.home === u ? g.hs < g.as : g.as < g.hs));
  if (lost) return lost.playoff!;
  return 'none';
}

const PLAYOFF_TEXT: Record<string, string> = { none: 'Missed playoffs', WC: 'Lost in Wild Card', DIV: 'Lost in Divisional Round', CONF: 'Lost Conference Championship', FINAL: 'Lost Gridiron Bowl', CHAMP: 'Gridiron Bowl Champions' };

/** Runs once when the season ends: awards, records, evaluation and archiving. */
export function seasonReview(c: Career): SeasonSummary {
  const t = c.teams[c.userTeam];
  const awards = computeAwards(c);
  c.awards.push(awards);
  const broken = updateSeasonRecords(c);
  const playoff = userPlayoffResult(c);
  // achievements
  if (t.rec.w > t.rec.l) unlock(c, 'winning_season');
  if (divisionStandings(c, t.conf, t.div)[0] === t.id) unlock(c, 'division');
  if (playoff === 'CHAMP') {
    unlock(c, 'champion');
    c.coach.titles++;
    if (c.coach.titles >= 3) unlock(c, 'dynasty');
  }
  if (t.rec.l === 0 && t.rec.t === 0) unlock(c, 'undefeated');
  if (c.coach.history.length + 1 >= 10) unlock(c, 'ten_seasons');
  if (awards.mvp && c.players.find((p) => p.id === awards.mvp)?.teamId === c.userTeam) unlock(c, 'mvp');
  // CC rewards for results
  c.cc += { none: 1, WC: 2, DIV: 3, CONF: 4, FINAL: 5, CHAMP: 8 }[playoff] ?? 1;
  const evaluation = evaluateCoach(c, playoff, c.expected);
  c.coach.seasonsWithTeam++;
  c.coach.history.push({ year: c.year, teamId: c.userTeam, w: t.rec.w, l: t.rec.l, t: t.rec.t, result: PLAYOFF_TEXT[playoff] });
  for (const tm of c.teams) {
    const res = c.playoffs?.champion === tm.id ? 'Champion' : c.playoffs?.seeds.some((s) => s.includes(tm.id)) ? 'Playoffs' : '';
    tm.history.push({ year: c.year, w: tm.rec.w, l: tm.rec.l, t: tm.rec.t, result: res });
    // prestige drifts with results
    tm.prestige = Math.round(clamp(tm.prestige * 0.85 + (tm.rec.w / 16) * 100 * 0.15 + (res === 'Champion' ? 8 : res ? 3 : 0), 5, 99));
  }
  c.ledger.push({ year: c.year, revenue: Math.round(c.seasonRevenue * 10) / 10, expenses: Math.round(c.seasonExpenses * 10) / 10 });
  // fan support follows results
  c.fans = Math.round(clamp(c.fans + (t.rec.w - 8) * 2 + ({ none: -3, WC: 2, DIV: 4, CONF: 6, FINAL: 8, CHAMP: 12 }[playoff] ?? 0), 5, 100));
  if (evaluation.fired) {
    c.coach.fired = true;
    c.jobOffers = jobOpenings(c, true);
    addNews(c, `${c.coach.name} has been fired by the ${teamName(t)}.`);
  } else {
    c.jobOffers = jobOpenings(c, false);
  }
  const summary: SeasonSummary = {
    year: c.year,
    record: recordText(t),
    playoff: PLAYOFF_TEXT[playoff],
    awards,
    evaluation,
    recordsBroken: broken,
    retirements: [],
    progression: [],
    finances: { revenue: Math.round(c.seasonRevenue * 10) / 10, expenses: Math.round(c.seasonExpenses * 10) / 10 },
    champion: c.playoffs?.champion ?? -1,
  };
  c.summary = summary;
  // last-place lookup for next year's schedule
  for (let conf = 0; conf < 2; conf++) for (let d = 0; d < 4; d++) divisionStandings(c, conf, d).forEach((id, i) => (c.lastPlace[id] = i));
  buildDraft(c);
  return summary;
}

// ------------------------------------------------------------------ progression & retirement

function progress(c: Career, p: Player, rng: Rng) {
  const a = p.age;
  let base = a <= 23 ? 3.6 : a <= 25 ? 2.6 : a <= 27 ? 1.2 : a <= 29 ? 0 : a <= 31 ? -1.6 : a <= 33 ? -3 : -4.6;
  base += clamp((p.xp - 16) / 8, -1.5, 2);
  if (p.teamId === c.userTeam) {
    base += (c.facilities.training - 1) * 0.35;
    const role = ['QB', 'RB', 'WR', 'TE', 'OL', 'K'].includes(p.pos) ? 'OC' : 'DC';
    base += ((c.staff.find((s) => s.role === role)?.rating ?? 2) - 3) * 0.4;
  }
  let delta = Math.round(base + rng.normal(0, 1.6));
  if (delta > 0 && p.ovr + delta > p.pot) delta = Math.max(0, p.pot - p.ovr) + (rng.chance(0.08) ? 1 : 0);
  const keys = Object.keys(p.r) as (keyof Player['r'])[];
  for (const k of keys) {
    let d = delta * rng.range(0.6, 1.3);
    if ((k === 'spd' || k === 'acc') && a >= 29) d -= rng.range(0.5, 2);
    if (k === 'awr' && a >= 28) d += 1;
    p.r[k] = Math.round(clamp(p.r[k] + d, 10, 99));
  }
  refreshOvr(p);
  p.xp = 0;
}

function retireChance(p: Player): number {
  if (p.pos === 'K') return p.age >= 39 ? 0.6 : p.age >= 36 ? 0.15 : 0.01;
  if (p.age >= 37) return 0.85;
  if (p.age >= 34) return 0.3 + (p.age - 34) * 0.18;
  if (p.age >= 31 && p.ovr < 62) return 0.35;
  if (p.age >= 29 && p.ovr < 52) return 0.3;
  return 0.005;
}

function hofScore(p: Player): number {
  let s = 0;
  for (const h of p.history) if (h.ovr >= 82) s += h.ovr >= 90 ? 3 : 1.5;
  s += p.awards.filter((x) => x.includes('MVP')).length * 6 + p.awards.filter((x) => x.includes('POY')).length * 4;
  s += careerTotal(p, 'pTd') / 40 + careerTotal(p, 'rYds') / 3000 + careerTotal(p, 'recYds') / 3500 + careerTotal(p, 'sacks') / 30 + careerTotal(p, 'dInt') / 12;
  return s;
}

/** Archive stats, age everyone, develop, retire and expire contracts. */
export function processOffseason(c: Career) {
  const rng = careerRng(c);
  const summary = c.summary!;
  const userIds = new Set(c.teams[c.userTeam].roster);
  for (const p of c.players) {
    if (p.teamId === -2 || p.teamId === -3) continue;
    if (p.season.gp > 0 || p.teamId >= 0) p.history.push({ year: c.year, teamId: p.teamId, ovr: p.ovr, stats: p.season });
    p.season = emptyStats();
    p.rookie = false;
    p.age++;
    const before = p.ovr;
    progress(c, p, rng);
    if (userIds.has(p.id) && Math.abs(p.ovr - before) >= 3) summary.progression.push({ name: fullName(p), pos: p.pos, from: before, to: p.ovr });
    p.cond = 100;
    if (p.injury && p.injury.weeks <= 8) p.injury = null;
    else if (p.injury) p.injury.weeks = Math.max(1, p.injury.weeks - 8);
    p.morale = Math.round(clamp(p.morale * 0.7 + 20, 30, 90));
  }
  // retirements
  for (const p of c.players) {
    if (p.teamId < -1) continue;
    if (!rng.chance(retireChance(p))) continue;
    const wasUser = p.teamId === c.userTeam || p.history.some((h) => h.teamId === c.userTeam);
    if (p.teamId >= 0) {
      const t = c.teams[p.teamId];
      t.roster = t.roster.filter((id) => id !== p.id);
    }
    if (p.teamId === c.userTeam) summary.retirements.push(`${p.pos} ${fullName(p)} (age ${p.age}, ${p.ovr} OVR)`);
    p.teamId = -2;
    p.retiredYear = c.year;
    const score = hofScore(p);
    if (score >= 14) {
      p.hof = true;
      const teamsPlayed = [...new Set(p.history.map((h) => c.teams[h.teamId]?.abbr).filter(Boolean))];
      c.hof.push({ name: fullName(p), pos: p.pos, years: `${p.history[0]?.year ?? c.year}-${c.year}`, team: teamsPlayed.join('/'), inducted: c.year + 1, summary: hofLine(p) });
      addNews(c, `${fullName(p)} will be inducted into the Hall of Fame.`);
      if (wasUser) unlock(c, 'hof');
    }
  }
  // drop retired non-HOF players to keep saves small
  c.players = c.players.filter((p) => p.teamId !== -2 || p.hof);
  // contracts
  for (const p of c.players) if (p.teamId >= 0 || p.teamId === -1) p.contract.years--;
  // AI teams handle their own expiring deals now
  const pm = playerMap(c);
  for (const t of c.teams) {
    if (t.id === c.userTeam) continue;
    for (const id of [...t.roster]) {
      const p = pm.get(id)!;
      if (p.contract.years > 0) continue;
      const keep = willResign(c, p) && playerValue(p) > 6 && p.age < 33 && rng.chance(0.75);
      if (keep) p.contract = contractDemand(c, p, t.id);
      else releasePlayer(c, p);
    }
    t.deadCap = 0;
  }
  c.teams[c.userTeam].deadCap = 0;
  c.resignDecisions = {};
  // free agents left over from last year age out
  for (const p of c.players) if (p.teamId === -1 && p.contract.years <= 0) p.contract = { salary: salaryFor(p.pos, p.ovr, p.age), years: 1 };
  c.offStep = 'resign';
  saveRng(c, rng);
}

function hofLine(p: Player): string {
  const bits: string[] = [];
  const pt = careerTotal(p, 'pYds');
  if (pt > 5000) bits.push(`${pt.toLocaleString()} pass yds`);
  const ry = careerTotal(p, 'rYds');
  if (ry > 2000) bits.push(`${ry.toLocaleString()} rush yds`);
  const rc = careerTotal(p, 'recYds');
  if (rc > 2000) bits.push(`${rc.toLocaleString()} rec yds`);
  const sk = careerTotal(p, 'sacks');
  if (sk > 20) bits.push(`${sk} sacks`);
  const it = careerTotal(p, 'dInt');
  if (it > 10) bits.push(`${it} INT`);
  const aw = p.awards.length;
  if (aw) bits.push(`${aw} award${aw > 1 ? 's' : ''}`);
  return bits.join(', ') || 'Longtime standout';
}

export function userExpiring(c: Career): Player[] {
  return teamPlayers(c, c.userTeam).filter((p) => p.contract.years <= 0);
}

export function finishResign(c: Career): string | null {
  const pm = playerMap(c);
  for (const p of userExpiring(c)) {
    const dec = c.resignDecisions[p.id] ?? 'release';
    if (dec === 'keep' && willResign(c, p)) p.contract = contractDemand(c, p, c.userTeam);
    else {
      releasePlayer(c, p);
      c.teams[c.userTeam].deadCap = 0;
    }
  }
  void pm;
  c.offStep = 'draft';
  return null;
}

// ------------------------------------------------------------------ draft

export const DRAFT_ROUNDS = 3;

export function buildDraft(c: Career) {
  const rng = careerRng(c);
  setNextPlayerId(Math.max(c.nextPlayerId, ...c.players.map((p) => p.id + 1)));
  const used = new Set(c.players.map((p) => p.first + ' ' + p.last));
  const draftYear = c.year + 1;
  c.draftClass = [];
  const posW: Pos[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K'];
  const weights = [1.4, 1.6, 3, 1.4, 4.2, 3.6, 2.4, 3.6, 0.6];
  for (let i = 0; i < 130; i++) {
    const pos = rng.weighted(posW, weights);
    const tier = rng.next();
    const q = tier < 0.06 ? rng.range(70, 79) : tier < 0.25 ? rng.range(62, 71) : tier < 0.6 ? rng.range(55, 64) : rng.range(46, 57);
    const age = rng.int(21, 23);
    const p = generatePlayer(rng, { pos, q, age, teamId: -3 }, used);
    p.pot = Math.round(clamp(p.ovr + rng.range(3, 26) * (tier < 0.25 ? 1.1 : 0.9), p.ovr, 97));
    p.contract = { salary: 0.75, years: 0 };
    p.scouted = false;
    p.rookie = true;
    c.players.push(p);
    c.draftClass.push(p.id);
  }
  c.nextPlayerId = Math.max(c.nextPlayerId, ...c.draftClass.map((id) => id + 1));
  // order: non-playoff teams by record (worst first), then playoff teams by round lost
  const elimRound = (id: number): number => {
    if (c.playoffs?.champion === id) return 5;
    const g = c.schedule.find((x) => x.playoff && x.played && (x.home === id || x.away === id) && (x.home === id ? x.hs < x.as : x.as < x.hs));
    if (!g) return c.playoffs?.seeds.some((s) => s.includes(id)) ? 1 : 0;
    return { WC: 1, DIV: 2, CONF: 3, FINAL: 4 }[g.playoff!] ?? 0;
  };
  const order = [...c.teams].sort((a, b) => {
    const ra = elimRound(a.id);
    const rb = elimRound(b.id);
    if (ra !== rb) return ra - rb;
    const pa = (a.rec.w + a.rec.t * 0.5) / 16;
    const pb = (b.rec.w + b.rec.t * 0.5) / 16;
    return pa - pb || a.rec.pf - a.rec.pa - (b.rec.pf - b.rec.pa);
  });
  c.draftOrder = [];
  for (let r = 1; r <= DRAFT_ROUNDS; r++) {
    order.forEach((t, i) => {
      const pick = c.picks.find((p) => p.year === draftYear && p.round === r && p.origTeam === t.id);
      c.draftOrder.push({ round: r, pick: i + 1, team: pick ? pick.owner : t.id });
    });
  }
  c.draftPos = 0;
  c.scoutPoints = 6 + c.facilities.training + (c.staff.find((s) => s.role === 'ST')?.rating ?? 1);
  saveRng(c, rng);
}

export function scoutProspect(c: Career, pid: number): string | null {
  const p = c.players.find((x) => x.id === pid);
  if (!p) return 'Unknown prospect';
  if (p.scouted) return null;
  if (c.scoutPoints <= 0) return 'No scouting points left this year.';
  c.scoutPoints--;
  p.scouted = true;
  return null;
}

/** The overall/potential range a team sees for a prospect. */
export function prospectView(p: Player): { ovr: string; pot: string } {
  if (p.scouted) return { ovr: String(p.ovr), pot: String(p.pot) };
  const fuzz = ((p.id * 7919) % 7) - 3;
  const lo = p.ovr + fuzz - 4;
  return { ovr: `${lo}-${lo + 8}`, pot: `${Math.max(p.ovr, p.pot + fuzz * 2 - 5)}-${p.pot + fuzz * 2 + 5}` };
}

function rookieDeal(round: number, pick: number) {
  if (round === 1) return { salary: Math.round((7.5 - (pick - 1) * 0.19) * 10) / 10, years: 4 };
  if (round === 2) return { salary: 1.3, years: 3 };
  return { salary: 0.9, years: 3 };
}

export function makePick(c: Career, pid: number) {
  const slot = c.draftOrder[c.draftPos];
  const p = c.players.find((x) => x.id === pid);
  if (!slot || !p || p.teamId !== -3) return;
  const t = c.teams[slot.team];
  p.teamId = t.id;
  p.contract = rookieDeal(slot.round, slot.pick);
  p.draft = { year: c.year + 1, round: slot.round, pick: slot.pick, teamId: t.id };
  p.morale = 75;
  t.roster.push(p.id);
  slot.pid = p.id;
  c.draftClass = c.draftClass.filter((id) => id !== pid);
  c.draftPos++;
  if (t.id === c.userTeam) addNews(c, `You drafted ${p.pos} ${fullName(p)} with pick ${slot.pick} of round ${slot.round}.`);
  else if (slot.round === 1 && slot.pick <= 5) addNews(c, `${t.abbr} select ${p.pos} ${fullName(p)} at #${slot.pick}.`);
}

export function aiPick(c: Career, rng: Rng) {
  const slot = c.draftOrder[c.draftPos];
  if (!slot) return;
  const pm = playerMap(c);
  const need = positionNeeds(c, slot.team, pm);
  const pool = c.draftClass.map((id) => pm.get(id)!).filter(Boolean);
  let best: Player | null = null;
  let bs = -1e9;
  for (const p of pool) {
    const posVal: Record<Pos, number> = { QB: 6, RB: 0, WR: 3, TE: 0, OL: 2, DL: 4, LB: 1, DB: 3, K: -12 };
    const s = p.ovr * 0.55 + p.pot * 0.45 + need[p.pos] * 0.4 + posVal[p.pos] + rng.normal(0, 3);
    if (s > bs) {
      bs = s;
      best = p;
    }
  }
  if (best) makePick(c, best.id);
}

/** Let the AI pick until it's the user's turn (or the draft ends). */
export function simDraftToUser(c: Career) {
  const rng = careerRng(c);
  while (c.draftPos < c.draftOrder.length && c.draftOrder[c.draftPos].team !== c.userTeam) aiPick(c, rng);
  saveRng(c, rng);
}

export function simRestOfDraft(c: Career, includeUser: boolean) {
  const rng = careerRng(c);
  while (c.draftPos < c.draftOrder.length) {
    if (c.draftOrder[c.draftPos].team === c.userTeam && !includeUser) break;
    aiPick(c, rng);
  }
  saveRng(c, rng);
}

export function finishDraft(c: Career) {
  simRestOfDraft(c, true);
  // undrafted rookies become cheap free agents
  for (const id of c.draftClass) {
    const p = c.players.find((x) => x.id === id);
    if (p) {
      p.teamId = -1;
      p.contract = { salary: 0.75, years: 2 };
    }
  }
  c.draftClass = [];
  c.offStep = 'freeagency';
  for (const t of c.teams) autoDepth(c, t, t.id === c.userTeam);
}

// ------------------------------------------------------------------ free agency

export function finishFreeAgency(c: Career) {
  const rng = careerRng(c);
  const pm = playerMap(c);
  for (let round = 0; round < 5; round++) {
    const fas = c.players.filter((p) => p.teamId === -1).sort((a, b) => b.ovr - a.ovr);
    for (const t of rng.shuffle(c.teams.filter((x) => x.id !== c.userTeam))) {
      if (t.roster.length >= MAX_ROSTER - 2) continue;
      const need = positionNeeds(c, t.id, pm);
      const cand = fas.find((p) => p.teamId === -1 && (need[p.pos] > 0 || round >= 3) && rng.chance(faInterest(c, p, t.id) / 100));
      if (!cand) continue;
      const d = contractDemand(c, cand, t.id);
      if (!signPlayer(c, cand, t.id, d) && cand.ovr >= 75) addNews(c, `${t.abbr} signed ${cand.pos} ${fullName(cand)} (${d.years} yrs, $${d.salary}M).`);
    }
  }
  // guarantee every AI roster can field a team, then trim to the limit
  for (const t of c.teams) {
    if (t.id === c.userTeam) continue;
    for (const pos of POSITIONS) {
      let have = t.roster.map((id) => pm.get(id)!).filter((p) => p && p.pos === pos).length;
      while (have < ROSTER_TEMPLATE[pos] - (pos === 'K' ? 0 : 1)) {
        const cand = c.players.filter((p) => p.teamId === -1 && p.pos === pos).sort((a, b) => b.ovr - a.ovr)[0];
        if (cand) signPlayer(c, cand, t.id, { salary: 0.75, years: 1 });
        else {
          const p = generatePlayer(rng, { pos, q: rng.range(46, 56), age: rng.int(22, 26), teamId: t.id });
          c.players.push(p);
          t.roster.push(p.id);
          p.contract = { salary: 0.75, years: 1 };
          pm.set(p.id, p);
        }
        have++;
      }
    }
    while (t.roster.length > MAX_ROSTER - 2) {
      const cut = t.roster.map((id) => pm.get(id)!).sort((a, b) => playerValue(a) - playerValue(b))[0];
      releasePlayer(c, cut);
      t.deadCap = 0;
    }
  }
  c.nextPlayerId = Math.max(c.nextPlayerId, ...c.players.map((p) => p.id + 1));
  c.offStep = 'preseason';
  saveRng(c, rng);
}

/** Signs minimum-salary free agents until the roster can field a team. Returns names signed. */
export function autoFillRoster(c: Career, teamId: number): string[] {
  const pm = playerMap(c);
  const t = c.teams[teamId];
  const signed: string[] = [];
  const rng = careerRng(c);
  const count = (pos: Pos) => t.roster.map((id) => pm.get(id)!).filter((p) => p && p.pos === pos).length;
  for (const pos of POSITIONS) {
    while (count(pos) < STARTERS[pos] + (pos === 'K' ? 0 : 1) || (t.roster.length < 26 && pos === 'OL' && count(pos) < 7)) {
      let cand = c.players.filter((p) => p.teamId === -1 && p.pos === pos).sort((a, b) => b.ovr - a.ovr)[0];
      if (!cand) {
        cand = generatePlayer(rng, { pos, q: rng.range(46, 55), age: rng.int(22, 26), teamId: -1 });
        c.players.push(cand);
        pm.set(cand.id, cand);
      }
      if (signPlayer(c, cand, teamId, { salary: 0.75, years: 1 })) break;
      signed.push(`${cand.pos} ${fullName(cand)}`);
    }
  }
  while (t.roster.length < 26) {
    const cand = c.players.filter((p) => p.teamId === -1).sort((a, b) => b.ovr - a.ovr)[0];
    if (!cand || signPlayer(c, cand, teamId, { salary: 0.75, years: 1 })) break;
    signed.push(`${cand.pos} ${fullName(cand)}`);
  }
  c.nextPlayerId = Math.max(c.nextPlayerId, ...c.players.map((p) => p.id + 1));
  saveRng(c, rng);
  return signed;
}

/** Moves the user to a new club (after a firing or a voluntary move). */
export function takeJob(c: Career, teamId: number) {
  c.userTeam = teamId;
  c.coach.fired = false;
  c.coach.security = 60;
  c.coach.seasonsWithTeam = 0;
  c.jobOffers = [];
  c.facilities = { stadium: 1 + (c.teams[teamId].prestige > 60 ? 1 : 0), training: 1, rehab: 1 };
  c.cash = 20;
  c.fans = Math.round(clamp(35 + c.teams[teamId].prestige * 0.4, 30, 80));
  c.resignDecisions = {};
  addNews(c, `${c.coach.name} is the new head coach of the ${teamName(c.teams[teamId])}.`);
}

export function startNewSeason(c: Career) {
  const rng = careerRng(c);
  c.year++;
  c.week = 1;
  c.phase = 'regular';
  c.offStep = 'review';
  c.playoffs = null;
  c.summary = null;
  c.event = null;
  for (const t of c.teams) {
    t.rec = emptyTeamSeason();
    t.deadCap = 0;
    autoDepth(c, t, t.id === c.userTeam);
  }
  // staff contracts
  for (const s of c.staff) s.years--;
  const expiredStaff = c.staff.filter((s) => s.years <= 0);
  for (const s of expiredStaff) {
    s.years = 2;
    s.salary = Math.round(s.salary * 1.08 * 10) / 10;
  }
  generateStaffPool(rng, c);
  c.schedule = c.schedule.filter(() => false);
  c.schedule = buildSchedule(c.teams, c.year, rng, c.lastPlace, c.nextGameId);
  c.nextGameId += c.schedule.length;
  c.picks = c.picks.filter((p) => p.year > c.year);
  for (const t of c.teams) for (let r = 1; r <= DRAFT_ROUNDS; r++) c.picks.push({ year: c.year + 2, round: r, origTeam: t.id, owner: t.id });
  c.seasonRevenue = 0;
  c.seasonExpenses = 0;
  const filled = autoFillRoster(c, c.userTeam);
  if (filled.length) addNews(c, `The front office signed ${filled.length} minimum-salary players to fill out the roster.`);
  c.expected = expectedWins(c);
  // draft-star achievement check
  if (c.players.some((p) => p.teamId === c.userTeam && p.draft?.teamId === c.userTeam && p.ovr >= 85)) unlock(c, 'draft_star');
  addNews(c, `The ${c.year} season begins. The owner expects about ${c.expected.toFixed(0)} wins.`);
  saveRng(c, rng);
}

export { STARTERS };
