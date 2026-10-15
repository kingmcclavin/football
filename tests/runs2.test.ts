import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { PlaySim, MID_Y } from '../src/game/sim';
import { PLAY_BY_ID, DEF_CALLS } from '../src/game/playbook';
import { makeLineup } from './helpers';

it.skipIf(!process.env.RUNS)('runs by call', () => {
  const rng = new Rng(7);
  const off = makeLineup(rng, 72);
  const def = makeLineup(rng, 72);
  for (const call of DEF_CALLS) {
    let yds = 0, n = 0;
    for (const id of ['insidezone', 'outsidezone', 'power', 'toss', 'counter', 'draw']) {
      for (let s = 1; s <= 40; s++) {
        const sim = new PlaySim({ kind: 'scrimmage', los: 30, ballY: MID_Y, toGo: 10, down: 1, play: PLAY_BY_ID[id], defCall: call, offense: off, defense: def, userControls: false, skill: { off: 0, def: 0 }, weather: 'clear', seed: s });
        const o = sim.runHeadless();
        n++;
        yds += o.offTd ? 70 : o.endX - 30;
      }
    }
    console.log(call.id.padEnd(10), 'ypc', (yds / n).toFixed(2));
  }
});
