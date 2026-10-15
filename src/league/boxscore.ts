import type { StatLine, Weather } from '../core/types';
import { emptyTeamGameStats, type BoxScore, type TeamGameStats } from './career';
import { clockText, quarterText, type GameState, type Side } from '../game/rules';

/** Accumulates everything that happens in one game, for either sim mode. */
export class BoxCollector {
  players = new Map<number, { teamId: number; s: Partial<StatLine> }>();
  team: [TeamGameStats, TeamGameStats] = [emptyTeamGameStats(), emptyTeamGameStats()];
  quarters: [number[], number[]] = [[0, 0, 0, 0], [0, 0, 0, 0]];
  keyPlays: string[] = [];
  constructor(public homeId: number, public awayId: number) {}

  teamOf(side: Side) {
    return side === 0 ? this.homeId : this.awayId;
  }

  add(pid: number, side: Side, s: Partial<StatLine>) {
    if (pid < 0) return;
    let e = this.players.get(pid);
    if (!e) {
      e = { teamId: this.teamOf(side), s: {} };
      this.players.set(pid, e);
    }
    for (const k of Object.keys(s) as (keyof StatLine)[]) {
      const v = s[k] ?? 0;
      if (k === 'pLng' || k === 'rLng' || k === 'recLng' || k === 'fgLng') e.s[k] = Math.max(e.s[k] ?? 0, v);
      else e.s[k] = (e.s[k] ?? 0) + v;
    }
  }

  addMap(m: Map<number, Partial<StatLine>>, side: (pid: number) => Side) {
    for (const [pid, s] of m) this.add(pid, side(pid), s);
  }

  points(g: GameState, side: Side, pts: number) {
    const q = Math.min(g.quarter, 5) - 1;
    while (this.quarters[side].length <= q) {
      this.quarters[0].push(0);
      this.quarters[1].push(0);
    }
    this.quarters[side][q] += pts;
  }

  key(g: GameState, text: string) {
    this.keyPlays.push(`${quarterText(g.quarter)} ${clockText(g.clock)} - ${text}`);
  }

  finish(gameId: number, year: number, week: number, g: GameState, weather: Weather, userPlayed: boolean, playoff?: string): BoxScore {
    const players: BoxScore['players'] = {};
    for (const [pid, e] of this.players) {
      e.s.gp = 1;
      players[pid] = e;
    }
    return {
      gameId, year, week, home: this.homeId, away: this.awayId, hs: g.score[0], as: g.score[1], ot: g.quarter >= 5,
      quarters: this.quarters, team: this.team, players, keyPlays: this.keyPlays.slice(-14), weather, playoff, userPlayed,
    };
  }
}
