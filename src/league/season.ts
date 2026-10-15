import { Rng, clamp } from '../core/rng';
import { addStats, emptyStats, type Player, type ScheduledGame, type Weather } from '../core/types';
import { addNews, careerRng, playerMap, saveRng, staffRating, teamName, type BoxScore, type Career } from './career';
import { simulateGame } from './quicksim';
import { autoDepth, pickWeather, unitRatings } from './depth';
import { conferenceSeeds } from './standings';
import { REG_WEEKS } from './schedule';
import { refreshOvr, shortName, fullName } from './players';
import { checkGameAchievements } from './achievements';
import { updateGameRecords } from './records';
import { aiWeeklyMoves } from './transactions';
import { maybeRandomEvent } from './events';

export const PLAYOFF_WEEKS: Record<number, 'WC' | 'DIV' | 'CONF' | 'FINAL'> = { 17: 'WC', 18: 'DIV', 19: 'CONF', 20: 'FINAL' };
export const ROUND_NAME: Record<string, string> = { WC: 'Wild Card', DIV: 'Divisional Round', CONF: 'Conference Championship', FINAL: 'Gridiron Bowl' };

export function difficultyBoost(c: Career): number {
  return { rookie: -6, pro: 0, allpro: 4, legend: 8 }[c.difficulty];
}

export function userGameThisWeek(c: Career): ScheduledGame | null {
  return c.schedule.find((g) => g.week === c.week && !g.played && (g.home === c.userTeam || g.away === c.userTeam)) ?? null;
}

export function gameWeather(c: Career, g: ScheduledGame): Weather {
  const r = new Rng(c.seed ^ (g.id * 2654435761));
  return pickWeather(c.teams[g.home], g.week, r);
}

/** Apply a finished game (from either simulator) to records, stats, injuries and morale. */
export function applyGameResult(c: Career, g: ScheduledGame, box: BoxScore, rng: Rng) {
  g.played = true;
  g.hs = box.hs;
  g.as = box.as;
  g.ot = box.ot;
  const H = c.teams[g.home];
  const A = c.teams[g.away];
  if (!g.playoff) {
    const sameDiv = H.conf === A.conf && H.div === A.div;
    const sameConf = H.conf === A.conf;
    const res = (t: typeof H, my: number, their: number) => {
      t.rec.pf += my;
      t.rec.pa += their;
      const k = my > their ? 'w' : my < their ? 'l' : 't';
      t.rec[k]++;
      if (sameDiv) t.rec[('div' + k.toUpperCase()) as 'divW']++;
      if (sameConf) t.rec[('conf' + k.toUpperCase()) as 'confW']++;
      t.rec.streak = k === 'w' ? Math.max(1, t.rec.streak + 1) : k === 'l' ? Math.min(-1, t.rec.streak - 1) : 0;
    };
    res(H, box.hs, box.as);
    res(A, box.as, box.hs);
  }
  const pm = playerMap(c);
  for (const [pidS, e] of Object.entries(box.players)) {
    const p = pm.get(Number(pidS));
    if (!p) continue;
    addStats(p.season, e.s);
  }
  // keep user box scores (and playoff games) for history
  const userInvolved = g.home === c.userTeam || g.away === c.userTeam;
  if (userInvolved || g.playoff) {
    g.boxId = c.boxes.length ? Math.max(...c.boxes.map((b) => b.gameId)) + 1 : 1;
    box.gameId = g.id;
    c.boxes.push(box);
    if (c.boxes.length > 70) c.boxes.splice(0, c.boxes.length - 70);
  }
  // injuries, condition and morale
  for (const teamId of [g.home, g.away]) {
    const won = (teamId === g.home ? box.hs > box.as : box.as > box.hs);
    const lost = (teamId === g.home ? box.hs < box.as : box.as < box.hs);
    const t = c.teams[teamId];
    const user = teamId === c.userTeam;
    const rehab = user ? c.facilities.rehab : 2;
    const med = user ? staffRating(c, 'ST') : 3;
    const injMult = user && c.training === 'conditioning' ? 0.75 : 1;
    for (const id of t.roster) {
      const p = pm.get(id);
      if (!p) continue;
      const played = !!box.players[id];
      if (played && !p.injury) {
        const wear = p.pos === 'RB' || p.pos === 'DL' || p.pos === 'OL' ? 14 : p.pos === 'K' || p.pos === 'QB' ? 6 : 10;
        p.cond = clamp(p.cond - wear + rng.range(-3, 3), 30, 100);
        let ip = 0.016 * injMult * (p.cond < 60 ? 1.6 : 1) * (1.15 - med * 0.05);
        if (p.pos === 'K') ip *= 0.2;
        if (rng.chance(ip)) injure(c, p, rng, rehab, user);
      }
      p.morale = clamp(p.morale + (won ? 2.5 : lost ? -2.5 : 0) + (played ? 0.5 : -0.3), 5, 100);
    }
  }
  updateGameRecords(c, box);
  if (userInvolved) checkGameAchievements(c, g, box);
}

const INJURIES: [string, number, number][] = [
  ['Sprained ankle', 1, 3], ['Hamstring strain', 1, 4], ['Bruised ribs', 1, 2], ['Concussion', 1, 3], ['Shoulder sprain', 2, 5],
  ['High ankle sprain', 3, 6], ['Knee sprain', 2, 6], ['Broken hand', 3, 6], ['Groin strain', 1, 3], ['Torn ACL', 16, 20], ['Broken leg', 10, 16],
];

export function injure(c: Career, p: Player, rng: Rng, rehab: number, news: boolean) {
  const weights = INJURIES.map(([, a]) => (a >= 10 ? 0.25 : a >= 3 ? 1 : 2.2));
  const [desc, a, b] = rng.weighted(INJURIES, weights);
  let weeks = rng.int(a, b);
  weeks = Math.max(1, Math.round(weeks * (1.1 - rehab * 0.06)));
  p.injury = { weeks, desc };
  if (news) addNews(c, `${p.pos} ${fullName(p)} suffered a ${desc.toLowerCase()} and is out ${weeks} week${weeks > 1 ? 's' : ''}.`);
}

export function quarterLengthSetting(): number {
  try {
    const s = JSON.parse(localStorage.getItem('gl-settings') || '{}');
    return (s.quarterMinutes ?? 6) * 60;
  } catch {
    return 360;
  }
}

/** Simulate every unplayed game this week (optionally including the user's). */
export function simWeekGames(c: Career, includeUser: boolean) {
  const rng = careerRng(c);
  const ql = quarterLengthSetting();
  for (const g of c.schedule) {
    if (g.week !== c.week || g.played) continue;
    const isUser = g.home === c.userTeam || g.away === c.userTeam;
    if (isUser && !includeUser) continue;
    const boost = difficultyBoost(c);
    const box = simulateGame(c, g.home, g.away, g.id, rng, {
      week: g.week,
      weather: gameWeather(c, g),
      quarterLength: ql,
      playoff: g.playoff,
      homeBoost: isUser && g.away === c.userTeam ? boost : 0,
      awayBoost: isUser && g.home === c.userTeam ? boost : 0,
    });
    applyGameResult(c, g, box, rng);
  }
  saveRng(c, rng);
}

/** After all of a week's games are played: weekly upkeep and move to the next week. */
export function finishWeek(c: Career) {
  const rng = careerRng(c);
  const pm = playerMap(c);
  const trainingLvl = c.facilities.training;
  for (const p of c.players) {
    if (p.teamId < 0) continue;
    const user = p.teamId === c.userTeam;
    // heal
    if (p.injury) {
      p.injury.weeks--;
      if (p.injury.weeks <= 0) {
        p.injury = null;
        if (user) addNews(c, `${fullName(p)} has returned from injury.`);
      }
    }
    // recovery
    let rec = 11;
    if (user) {
      if (c.training === 'rest') rec += 9;
      if (c.training === 'conditioning') rec += 5;
      rec += staffRating(c, 'ST') - 2;
    }
    p.cond = clamp(p.cond + rec, 0, 100);
    // xp from practice
    let xp = 1;
    const offense = ['QB', 'RB', 'WR', 'TE', 'OL', 'K'].includes(p.pos);
    if (user) {
      const f = c.training;
      xp = f === 'balanced' ? 1 : f === 'offense' ? (offense ? 1.7 : 0.5) : f === 'defense' ? (offense ? 0.5 : 1.7) : f === 'conditioning' ? 0.6 : 0.2;
      xp *= 0.85 + trainingLvl * 0.12;
      xp *= 0.85 + staffRating(c, offense ? 'OC' : 'DC') * 0.08;
      if (c.training === 'rest') p.morale = clamp(p.morale + 1, 0, 100);
    }
    p.xp += xp;
  }
  // light in-season development every 4 weeks for young players
  if (c.phase === 'regular' && c.week % 4 === 0) {
    for (const p of c.players) {
      if (p.teamId < 0 || p.age > 27) continue;
      if (p.xp >= 4 && p.ovr < p.pot && rng.chance(0.5)) {
        bumpRatings(p, rng, 1);
        p.xp -= 2;
      }
    }
  }
  aiWeeklyMoves(c, rng, pm);
  for (const t of c.teams) autoDepth(c, t, t.id === c.userTeam);
  // finances: weekly costs, home game revenue tracked in recordWeekFinance
  saveRng(c, rng);
  c.week++;
  c.weekEvents = 0;
  if (c.phase === 'regular' && c.week > REG_WEEKS) startPlayoffs(c);
  else if (c.phase === 'playoffs') advancePlayoffs(c);
  if (c.phase !== 'offseason') maybeRandomEvent(c);
}

export function bumpRatings(p: Player, rng: Rng, amount: number) {
  const keys = Object.keys(p.r) as (keyof Player['r'])[];
  for (let i = 0; i < 3; i++) {
    const k = rng.pick(keys);
    p.r[k] = clamp(p.r[k] + amount, 1, 99);
  }
  const before = p.ovr;
  refreshOvr(p);
  // nudge position-relevant attributes if the overall didn't move
  if (p.ovr === before && amount > 0) {
    const w = { QB: 'tha', RB: 'elu', WR: 'cth', TE: 'blk', OL: 'blk', DL: 'prs', LB: 'tak', DB: 'cov', K: 'kac' } as const;
    const k = w[p.pos];
    p.r[k] = clamp(p.r[k] + amount, 1, 99);
    refreshOvr(p);
  }
}

// ----------------------------------------------------------------- playoffs

function addPlayoffGame(c: Career, week: number, home: number, away: number) {
  c.schedule.push({ id: c.nextGameId++, week, home, away, played: false, hs: 0, as: 0, ot: false, playoff: PLAYOFF_WEEKS[week] });
}

export function startPlayoffs(c: Career) {
  c.phase = 'playoffs';
  c.week = 17;
  const seeds: [number[], number[]] = [conferenceSeeds(c, 0).slice(0, 7), conferenceSeeds(c, 1).slice(0, 7)];
  c.playoffs = { seeds, round: 0 };
  for (const s of seeds) {
    addPlayoffGame(c, 17, s[1], s[6]);
    addPlayoffGame(c, 17, s[2], s[5]);
    addPlayoffGame(c, 17, s[3], s[4]);
  }
  const userSeed = seeds.flat().indexOf(c.userTeam);
  if (userSeed >= 0) addNews(c, `The ${teamName(c.teams[c.userTeam])} clinched a playoff berth as the #${(userSeed % 7) + 1} seed!`);
  else addNews(c, `The ${teamName(c.teams[c.userTeam])} missed the playoffs.`);
  addNews(c, `Playoffs begin: ${seeds.map((s) => c.teams[s[0]].abbr).join(' and ')} earn first-round byes.`);
}

function winnerOf(g: ScheduledGame) {
  return g.hs > g.as ? g.home : g.away;
}
function loserOf(g: ScheduledGame) {
  return g.hs > g.as ? g.away : g.home;
}

function seedOf(c: Career, team: number): number {
  for (const s of c.playoffs!.seeds) {
    const i = s.indexOf(team);
    if (i >= 0) return i;
  }
  return 99;
}

function advancePlayoffs(c: Career) {
  const P = c.playoffs!;
  const prevWeek = c.week - 1;
  const games = c.schedule.filter((g) => g.week === prevWeek && g.playoff);
  if (prevWeek === 17) {
    for (let conf = 0; conf < 2; conf++) {
      const winners = games.filter((g) => c.teams[g.home].conf === conf).map(winnerOf);
      const alive = [P.seeds[conf][0], ...winners].sort((a, b) => seedOf(c, a) - seedOf(c, b));
      addPlayoffGame(c, 18, alive[0], alive[3]);
      addPlayoffGame(c, 18, alive[1], alive[2]);
    }
    P.round = 1;
  } else if (prevWeek === 18) {
    for (let conf = 0; conf < 2; conf++) {
      const winners = games.filter((g) => c.teams[g.home].conf === conf).map(winnerOf).sort((a, b) => seedOf(c, a) - seedOf(c, b));
      addPlayoffGame(c, 19, winners[0], winners[1]);
    }
    P.round = 2;
  } else if (prevWeek === 19) {
    const champs = games.map(winnerOf).sort((a, b) => {
      const ta = c.teams[a];
      const tb = c.teams[b];
      return tb.rec.w - ta.rec.w || ta.conf - tb.conf;
    });
    addPlayoffGame(c, 20, champs[0], champs[1]);
    addNews(c, `${c.teams[champs[0]].abbr} and ${c.teams[champs[1]].abbr} will meet in the Gridiron Bowl!`);
    P.round = 3;
  } else if (prevWeek === 20) {
    const g = games[0];
    const champ = winnerOf(g);
    P.champion = champ;
    P.round = 4;
    c.teams[champ].titles.push(c.year);
    c.champions.push({ year: c.year, team: champ, runnerUp: loserOf(g), score: `${Math.max(g.hs, g.as)}-${Math.min(g.hs, g.as)}` });
    addNews(c, `The ${teamName(c.teams[champ])} win the ${c.year} Gridiron Bowl!`);
    c.phase = 'offseason';
    c.offStep = 'review';
  }
}

export function eliminatedFromPlayoffs(c: Career, team: number): boolean {
  if (c.phase !== 'playoffs') return false;
  const inSeeds = c.playoffs?.seeds.some((s) => s.includes(team));
  if (!inSeeds) return true;
  return c.schedule.some((g) => g.playoff && g.played && loserOf(g) === team);
}

export function teamStrength(c: Career, teamId: number) {
  return unitRatings(c, teamId);
}

export function resetSeasonStats(c: Career) {
  for (const p of c.players) p.season = emptyStats();
}

export function describeStarter(p: Player) {
  return `${p.pos} ${shortName(p)} (${p.ovr})`;
}

/** After the user's game (played or simulated): finish the rest of the week. */
export function completeWeekAfterUserGame(c: Career) {
  simWeekGames(c, false);
  finishWeek(c);
}
