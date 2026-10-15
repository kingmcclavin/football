import { Rng } from '../src/core/rng';
import type { Player, Pos } from '../src/core/types';
import { generatePlayer } from '../src/league/players';
import type { Lineup, SimPlayer } from '../src/game/sim';

export function toSim(p: Player): SimPlayer {
  return { pid: p.id, pos: p.pos, num: p.num, name: p.last, r: { ...p.r }, look: p.look };
}

export function makeLineup(rng: Rng, q: number): Lineup {
  const g = (pos: Pos, n: number) => Array.from({ length: n }, () => toSim(generatePlayer(rng, { pos, q: q + rng.range(-4, 4), age: 26, teamId: 0 })));
  return { qb: g('QB', 1), rb: g('RB', 2), wr: g('WR', 4), te: g('TE', 2), ol: g('OL', 5), dl: g('DL', 5), lb: g('LB', 4), db: g('DB', 6), k: g('K', 1) };
}
