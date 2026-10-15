import type { ScheduledGame, Team } from '../core/types';
import type { Career } from './career';

export function pct(w: number, l: number, t: number) {
  const g = w + l + t;
  return g ? (w + t * 0.5) / g : 0;
}

function h2h(games: ScheduledGame[], a: number, group: number[]) {
  let w = 0;
  let l = 0;
  let t = 0;
  for (const g of games) {
    if (!g.played || g.playoff) continue;
    const opp = g.home === a ? g.away : g.away === a ? g.home : -1;
    if (opp < 0 || !group.includes(opp)) continue;
    const my = g.home === a ? g.hs : g.as;
    const their = g.home === a ? g.as : g.hs;
    if (my > their) w++;
    else if (my < their) l++;
    else t++;
  }
  return w + l + t ? pct(w, l, t) : 0.5;
}

/** Sort teams by record using NFL-style tiebreakers. */
export function sortTeams(c: Career, ids: number[], sameDivision: boolean): number[] {
  const T = c.teams;
  const key = (id: number) => pct(T[id].rec.w, T[id].rec.l, T[id].rec.t);
  const sorted = [...ids].sort((a, b) => key(b) - key(a));
  // resolve tied groups
  const out: number[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && Math.abs(key(sorted[j]) - key(sorted[i])) < 1e-9) j++;
    const group = sorted.slice(i, j);
    if (group.length > 1) {
      group.sort((a, b) => {
        const hh = h2h(c.schedule, b, group) - h2h(c.schedule, a, group);
        if (Math.abs(hh) > 1e-9) return hh;
        if (sameDivision) {
          const dv = pct(T[b].rec.divW, T[b].rec.divL, T[b].rec.divT) - pct(T[a].rec.divW, T[a].rec.divL, T[a].rec.divT);
          if (Math.abs(dv) > 1e-9) return dv;
        }
        const cf = pct(T[b].rec.confW, T[b].rec.confL, T[b].rec.confT) - pct(T[a].rec.confW, T[a].rec.confL, T[a].rec.confT);
        if (Math.abs(cf) > 1e-9) return cf;
        const pd = T[b].rec.pf - T[b].rec.pa - (T[a].rec.pf - T[a].rec.pa);
        if (pd !== 0) return pd;
        return T[b].rec.pf - T[a].rec.pf || a - b;
      });
    }
    out.push(...group);
    i = j;
  }
  return out;
}

export function divisionStandings(c: Career, conf: number, div: number): number[] {
  return sortTeams(c, c.teams.filter((t) => t.conf === conf && t.div === div).map((t) => t.id), true);
}

export function conferenceSeeds(c: Career, conf: number): number[] {
  const winners: number[] = [];
  for (let d = 0; d < 4; d++) winners.push(divisionStandings(c, conf, d)[0]);
  const seededWinners = sortTeams(c, winners, false);
  const rest = sortTeams(c, c.teams.filter((t) => t.conf === conf && !winners.includes(t.id)).map((t) => t.id), false);
  return [...seededWinners, ...rest];
}

export function recordText(t: Team) {
  return t.rec.t ? `${t.rec.w}-${t.rec.l}-${t.rec.t}` : `${t.rec.w}-${t.rec.l}`;
}
