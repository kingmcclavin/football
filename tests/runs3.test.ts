import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { PlaySim, MID_Y } from '../src/game/sim';
import { PLAY_BY_ID, DEF_BY_ID } from '../src/game/playbook';
import { makeLineup } from './helpers';

it.skipIf(!process.env.RUNS)('run blocking analysis', () => {
  const rng = new Rng(7);
  const off = makeLineup(rng, 72);
  const def = makeLineup(rng, 72);
  let olEng = 0, lbEng = 0, dlEng = 0, n = 0, freeAtHand = 0;
  for (let s = 1; s <= 100; s++) {
    const sim = new PlaySim({ kind: 'scrimmage', los: 30, ballY: MID_Y, toGo: 10, down: 1, play: PLAY_BY_ID.insidezone, defCall: DEF_BY_ID.c3, offense: off, defense: def, userControls: false, skill: { off: 0, def: 0 }, weather: 'clear', seed: s });
    sim.snap();
    let done = false;
    for (let k = 0; k < 300 && sim.phase === 'live'; k++) {
      sim.step(1 / 30);
      if (!done && sim.carrier >= 0) {
        done = true;
        n++;
        const ol = sim.actors.filter((a) => a.side === 0 && ['LT', 'LG', 'C', 'RG', 'RT'].includes(a.role));
        olEng += ol.filter((a) => a.engaged >= 0).length;
        lbEng += sim.actors.filter((a) => a.side === 1 && a.role === 'LB' && a.engaged >= 0).length;
        dlEng += sim.actors.filter((a) => a.side === 1 && a.role === 'DL' && a.engaged >= 0).length;
        const c = sim.actors[sim.carrier];
        freeAtHand += sim.actors.filter((a) => a.side === 1 && a.engaged < 0 && Math.hypot(a.x - c.x, a.y - c.y) < 4).length;
      }
    }
  }
  console.log('at handoff: OL engaged', (olEng / n).toFixed(2), 'DL engaged', (dlEng / n).toFixed(2), 'LB engaged', (lbEng / n).toFixed(2), 'free defenders within 4yd', (freeAtHand / n).toFixed(2));
});
