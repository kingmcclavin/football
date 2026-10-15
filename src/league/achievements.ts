import type { ScheduledGame } from '../core/types';
import { addNews, type BoxScore, type Career } from './career';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  cc: number; // coaching credit reward
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_win', name: 'First Victory', desc: 'Win your first game as head coach.', cc: 1 },
  { id: 'shutout', name: 'Brick Wall', desc: 'Win a game without allowing a point.', cc: 2 },
  { id: 'fifty', name: 'Half Century', desc: 'Score 50 or more points in a game.', cc: 2 },
  { id: 'comeback', name: 'Never Say Die', desc: 'Win a game after trailing by 14+ in the second half.', cc: 2 },
  { id: 'ot_win', name: 'Sudden Death', desc: 'Win a game in overtime.', cc: 1 },
  { id: 'qb400', name: 'Air Raid', desc: 'Throw for 400+ yards in a game.', cc: 2 },
  { id: 'rush200', name: 'Ground and Pound', desc: 'A player rushes for 200+ yards in a game.', cc: 2 },
  { id: 'fg50', name: 'Long Distance', desc: 'Make a field goal of 50+ yards.', cc: 1 },
  { id: 'winning_season', name: 'Winning Season', desc: 'Finish a regular season with a winning record.', cc: 2 },
  { id: 'division', name: 'Division Champs', desc: 'Win your division.', cc: 3 },
  { id: 'playoff_win', name: 'Postseason Victory', desc: 'Win a playoff game.', cc: 3 },
  { id: 'conference', name: 'Conference Crown', desc: 'Win a conference championship.', cc: 4 },
  { id: 'champion', name: 'Gridiron Bowl Champion', desc: 'Win the championship.', cc: 6 },
  { id: 'dynasty', name: 'Dynasty', desc: 'Win three championships.', cc: 10 },
  { id: 'undefeated', name: 'Perfection', desc: 'Go undefeated in the regular season.', cc: 8 },
  { id: 'ten_seasons', name: 'Lifer', desc: 'Coach ten seasons.', cc: 5 },
  { id: 'draft_star', name: 'Draft Whisperer', desc: 'Draft a player who reaches 85 overall.', cc: 4 },
  { id: 'mvp', name: 'Most Valuable', desc: 'Coach the league MVP.', cc: 3 },
  { id: 'hof', name: 'Immortal', desc: 'One of your former players enters the Hall of Fame.', cc: 3 },
];

export function unlock(c: Career, id: string) {
  if (c.achievements[id]) return false;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return false;
  c.achievements[id] = c.year;
  c.cc += a.cc;
  addNews(c, `Achievement unlocked: ${a.name} (+${a.cc} CC)`);
  return true;
}

export function checkGameAchievements(c: Career, g: ScheduledGame, box: BoxScore) {
  const home = g.home === c.userTeam;
  const my = home ? box.hs : box.as;
  const their = home ? box.as : box.hs;
  const won = my > their;
  if (won) unlock(c, 'first_win');
  if (won && their === 0) unlock(c, 'shutout');
  if (my >= 50) unlock(c, 'fifty');
  if (won && box.ot) unlock(c, 'ot_win');
  if (won && g.playoff) unlock(c, 'playoff_win');
  if (won && g.playoff === 'CONF') unlock(c, 'conference');
  // comeback: trailing by 14+ at half or later (approximation from quarter scores)
  const q = box.quarters;
  const mine = home ? q[0] : q[1];
  const theirs = home ? q[1] : q[0];
  const atHalfDiff = mine[0] + mine[1] - theirs[0] - theirs[1];
  const atThreeDiff = atHalfDiff + mine[2] - theirs[2];
  if (won && (atHalfDiff <= -14 || atThreeDiff <= -14)) unlock(c, 'comeback');
  for (const e of Object.values(box.players)) {
    if (e.teamId !== c.userTeam) continue;
    if ((e.s.pYds ?? 0) >= 400) unlock(c, 'qb400');
    if ((e.s.rYds ?? 0) >= 200) unlock(c, 'rush200');
    if ((e.s.fgLng ?? 0) >= 50) unlock(c, 'fg50');
  }
}
