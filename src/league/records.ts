import type { Player, StatLine } from '../core/types';
import { playerMap, type BoxScore, type Career, type RecordEntry } from './career';
import { fullName } from './players';

export const RECORD_KEYS: { key: keyof StatLine; label: string }[] = [
  { key: 'pYds', label: 'Passing Yards' },
  { key: 'pTd', label: 'Passing TDs' },
  { key: 'rYds', label: 'Rushing Yards' },
  { key: 'rTd', label: 'Rushing TDs' },
  { key: 'recYds', label: 'Receiving Yards' },
  { key: 'rec', label: 'Receptions' },
  { key: 'recTd', label: 'Receiving TDs' },
  { key: 'sacks', label: 'Sacks' },
  { key: 'tkl', label: 'Tackles' },
  { key: 'dInt', label: 'Interceptions' },
  { key: 'fgM', label: 'Field Goals Made' },
];

function better(rec: Record<string, RecordEntry>, key: string, entry: RecordEntry) {
  const cur = rec[key];
  if (!cur || entry.value > cur.value) {
    rec[key] = entry;
    return true;
  }
  return false;
}

export function updateGameRecords(c: Career, box: BoxScore) {
  const pm = playerMap(c);
  for (const [pid, e] of Object.entries(box.players)) {
    const p = pm.get(Number(pid));
    if (!p) continue;
    for (const { key } of RECORD_KEYS) {
      const v = e.s[key] ?? 0;
      if (v > 0) better(c.records.game, key, { value: v, name: fullName(p), team: c.teams[e.teamId]?.abbr ?? '', year: c.year });
    }
  }
}

/** Called at the end of each season, before stats are archived. */
export function updateSeasonRecords(c: Career): string[] {
  const broken: string[] = [];
  const before = { ...c.records.season };
  for (const p of c.players) {
    if (p.teamId < 0 && p.teamId !== -2) continue;
    for (const { key } of RECORD_KEYS) {
      const v = p.season[key] ?? 0;
      if (v <= 0) continue;
      const team = c.teams[p.teamId]?.abbr ?? '';
      better(c.records.season, key, { value: v, name: fullName(p), team, year: c.year });
      const career = careerTotal(p, key);
      better(c.records.career, key, { value: career, name: fullName(p), team, year: c.year });
    }
  }
  // only report records that beat a mark from a previous season
  for (const { key, label } of RECORD_KEYS) {
    const now = c.records.season[key];
    const was = before[key];
    if (now && was && now.year === c.year && now.value > was.value) broken.push(`${now.name} (${now.team}) set the single-season ${label.toLowerCase()} record: ${now.value}.`);
  }
  // franchise records for the user's team
  const t = c.teams[c.userTeam];
  better(c.records.team, 'wins', { value: t.rec.w, name: `${t.city} ${t.name}`, team: t.abbr, year: c.year });
  better(c.records.team, 'pf', { value: t.rec.pf, name: `${t.city} ${t.name}`, team: t.abbr, year: c.year });
  const pd = t.rec.pf - t.rec.pa;
  better(c.records.team, 'pd', { value: pd, name: `${t.city} ${t.name}`, team: t.abbr, year: c.year });
  return broken;
}

export function careerTotal(p: Player, key: keyof StatLine): number {
  let s = p.season[key] ?? 0;
  for (const h of p.history) s += h.stats[key] ?? 0;
  return s;
}

export const TEAM_RECORD_LABEL: Record<string, string> = { wins: 'Most Wins (season)', pf: 'Most Points (season)', pd: 'Best Point Differential' };
