import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { PlaySim, MID_Y } from '../src/game/sim';
import { PLAY_BY_ID, DEF_BY_ID } from '../src/game/playbook';
import { makeLineup } from './helpers';

it.skipIf(!process.env.FIND)('find', () => {
  const rng = new Rng(7);
  const off = makeLineup(rng, 72);
  const def = makeLineup(rng, 72);
  const res: Record<string, number> = {};
  let yds = 0;
  const found: number[] = [];
  for (let seed = 1; seed <= 200; seed++) {
    const sim = new PlaySim({ kind: 'scrimmage', los: 30, ballY: MID_Y, toGo: 10, down: 1, play: PLAY_BY_ID[process.env.PLAY!], defCall: DEF_BY_ID[process.env.DEF ?? 'c3'], offense: off, defense: def, userControls: false, skill: { off: 0, def: 0 }, weather: 'clear', seed });
    const o = sim.runHeadless();
    res[o.reason] = (res[o.reason] ?? 0) + 1;
    yds += o.offTd ? 70 : o.incomplete || o.turnover ? 0 : o.endX - 30;
    if (o.reason === process.env.FIND && found.length < 5) found.push(seed);
  }
  console.log(JSON.stringify(res), 'ypp', (yds / 200).toFixed(2), 'seeds', found.join(','));
});
