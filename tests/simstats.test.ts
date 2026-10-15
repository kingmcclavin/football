import { it } from 'vitest';
import { createCareer } from '../src/league/career';
import { finishWeek, simWeekGames } from '../src/league/season';

it.skipIf(!process.env.SIMSTATS)('sim stats', () => {
  const c = createCareer({ coachName: 'T', teamId: 0, difficulty: 'pro', slot: 0, seed: 11 });
  for (let w = 0; w < 16; w++) {
    simWeekGames(c, true);
    c.event = null;
    finishWeek(c);
  }
  const g = 32 * 16;
  const sum = (k: string) => c.players.reduce((s, p) => s + ((p.season as unknown as Record<string, number>)[k] ?? 0), 0);
  console.log('per team-game: passAtt', (sum('pAtt') / g).toFixed(1), 'cmp%', ((sum('pCmp') / sum('pAtt')) * 100).toFixed(1), 'ypa', (sum('pYds') / sum('pAtt')).toFixed(2),
    'rush', (sum('rAtt') / g).toFixed(1), 'ypc', (sum('rYds') / sum('rAtt')).toFixed(2), 'sacks', (sum('sacks') / g).toFixed(2), 'int', (sum('pInt') / g).toFixed(2), 'ppg', (c.teams.reduce((s, t) => s + t.rec.pf, 0) / g).toFixed(1),
    'fg', sum('fgM') + '/' + sum('fgA'), 'punts/g', (sum('punts') / g).toFixed(1));
});
