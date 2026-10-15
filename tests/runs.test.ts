import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { PlaySim, MID_Y } from '../src/game/sim';
import { PLAY_BY_ID, DEF_CALLS } from '../src/game/playbook';
import { makeLineup } from './helpers';

it.skipIf(!process.env.RUNS)('runs', () => {
  const rng = new Rng(7);
  const off = makeLineup(rng, 72);
  const def = makeLineup(rng, 72);
  for (const id of ['insidezone', 'outsidezone', 'power', 'toss', 'counter', 'draw']) {
    const by: Record<string, number> = {};
    let yds = 0, n = 0, handX = 0, tT = 0;
    for (let s = 1; s <= 150; s++) {
      const sim = new PlaySim({ kind: 'scrimmage', los: 30, ballY: MID_Y, toGo: 10, down: 1, play: PLAY_BY_ID[id], defCall: DEF_CALLS[s % DEF_CALLS.length], offense: off, defense: def, userControls: false, skill: { off: 0, def: 0 }, weather: 'clear', seed: s });
      sim.snap();
      let hx = 0;
      let guard = 0;
      while (sim.phase !== 'over' && guard++ < 600) {
        sim.step(1 / 30);
        if (!hx && sim.carrier >= 0) hx = sim.actors[sim.carrier].x - 30;
      }
      const o = sim.outcome!;
      n++;
      yds += o.offTd ? 70 : o.endX - 30;
      handX += hx;
      tT += o.elapsed;
      const tk = sim.actors.find((a) => a.side === 1 && a.mode === 'down' && a.downT > 50);
      const k = tk ? tk.role : 'none';
      by[k] = (by[k] ?? 0) + 1;
    }
    console.log(id.padEnd(12), 'ypc', (yds / n).toFixed(2), 'handoff at', (handX / n).toFixed(1), 't', (tT / n).toFixed(1), JSON.stringify(by));
  }
});
