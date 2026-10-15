import { Rng } from '../core/rng';
import type { ScheduledGame, Team } from '../core/types';

/**
 * Builds a 16-week schedule where every week is a perfect matching of all 32 teams:
 * 6 division games (home/away vs each rival), 4 vs a same-conference division,
 * 4 vs an other-conference division and 2 vs same-place finishers of the remaining
 * two divisions in the conference. The pairings rotate each season.
 */
export function buildSchedule(teams: Team[], year: number, rng: Rng, lastPlace: Record<number, number>, startId: number): ScheduledGame[] {
  const byDiv: number[][] = [];
  for (let c = 0; c < 2; c++) for (let d = 0; d < 4; d++) byDiv.push(teams.filter((t) => t.conf === c && t.div === d).map((t) => t.id));
  const divIdx = (c: number, d: number) => c * 4 + d;
  const rot = year % 3;
  const rounds: [number, number][][] = [];
  // division round robin (double)
  const rr = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ];
  for (let rep = 0; rep < 2; rep++) {
    for (const pairing of rr) {
      const week: [number, number][] = [];
      for (const div of byDiv) for (const [a, b] of pairing) week.push(rep === 0 ? [div[a], div[b]] : [div[b], div[a]]);
      rounds.push(week);
    }
  }
  // intra-conference division pairing: (0,1),(2,3) / (0,2),(1,3) / (0,3),(1,2)
  const intra = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ][rot];
  const others = [
    [[0, 2], [1, 3], [0, 3], [1, 2]],
    [[0, 1], [2, 3], [0, 3], [1, 2]],
    [[0, 1], [2, 3], [0, 2], [1, 3]],
  ][rot];
  // full 4x4 vs another division: latin square rounds
  const fullRounds = (pairs: [number, number][]) => {
    const out: [number, number][][] = [];
    for (let k = 0; k < 4; k++) {
      const week: [number, number][] = [];
      for (const [da, db] of pairs) {
        const A = byDiv[da];
        const B = byDiv[db];
        for (let i = 0; i < 4; i++) {
          const a = A[i];
          const b = B[(i + k) % 4];
          week.push((i + k) % 2 === 0 ? [a, b] : [b, a]);
        }
      }
      out.push(week);
    }
    return out;
  };
  const intraPairs: [number, number][] = [];
  for (let c = 0; c < 2; c++) for (const [a, b] of intra) intraPairs.push([divIdx(c, a), divIdx(c, b)]);
  rounds.push(...fullRounds(intraPairs));
  // inter-conference: conference 0 division d plays conference 1 division (d + year) % 4
  const interPairs: [number, number][] = [];
  for (let d = 0; d < 4; d++) interPairs.push([divIdx(0, d), divIdx(1, (d + year) % 4)]);
  rounds.push(...fullRounds(interPairs));
  // same-place games vs the two remaining divisions in the conference
  const place = (id: number) => lastPlace[id] ?? 0;
  for (let k = 0; k < 2; k++) {
    const week: [number, number][] = [];
    for (let c = 0; c < 2; c++) {
      const [p1, p2] = [others[k * 2], others[k * 2 + 1]];
      for (const [da, db] of [p1, p2]) {
        const A = [...byDiv[divIdx(c, da)]].sort((x, y) => place(x) - place(y));
        const B = [...byDiv[divIdx(c, db)]].sort((x, y) => place(x) - place(y));
        for (let i = 0; i < 4; i++) week.push((i + k + year) % 2 === 0 ? [A[i], B[i]] : [B[i], A[i]]);
      }
    }
    rounds.push(week);
  }
  rng.shuffle(rounds);
  // keep a division game in the final week for drama
  const lastDiv = rounds.findIndex((w) => w.every(([h, a]) => teams[h].conf === teams[a].conf && teams[h].div === teams[a].div));
  if (lastDiv >= 0) [rounds[lastDiv], rounds[rounds.length - 1]] = [rounds[rounds.length - 1], rounds[lastDiv]];
  // balance home games to 8 each by flipping non-division matchups
  const homeCount = new Map<number, number>();
  for (const w of rounds) for (const [h] of w) homeCount.set(h, (homeCount.get(h) ?? 0) + 1);
  const isDiv = (a: number, b: number) => teams[a].conf === teams[b].conf && teams[a].div === teams[b].div;
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const w of rounds) {
      for (let i = 0; i < w.length; i++) {
        const [h, a] = w[i];
        if (isDiv(h, a)) continue;
        const hc = homeCount.get(h) ?? 0;
        const ac = homeCount.get(a) ?? 0;
        if (hc > 8 && ac < 8) {
          w[i] = [a, h];
          homeCount.set(h, hc - 1);
          homeCount.set(a, ac + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  const games: ScheduledGame[] = [];
  let id = startId;
  rounds.forEach((week, w) => {
    for (const [home, away] of week) games.push({ id: id++, week: w + 1, home, away, played: false, hs: 0, as: 0, ot: false });
  });
  return games;
}

export const REG_WEEKS = 16;
