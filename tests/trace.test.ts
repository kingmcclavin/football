import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { PlaySim, MID_Y } from '../src/game/sim';
import { PLAY_BY_ID, DEF_BY_ID } from '../src/game/playbook';
import { makeLineup } from './helpers';

it.skipIf(!process.env.TRACE)('trace', () => {
  const rng = new Rng(7);
  const off = makeLineup(rng, 72);
  const def = makeLineup(rng, 72);
  const sim = new PlaySim({ kind: 'scrimmage', los: 30, ballY: MID_Y, toGo: 10, down: 1, play: PLAY_BY_ID[process.env.PLAY ?? 'slants'], defCall: DEF_BY_ID[process.env.DEF ?? 'c3'], offense: off, defense: def, userControls: false, skill: { off: 0, def: 0 }, weather: 'clear', seed: Number(process.env.SEED ?? 5) });
  sim.snap();
  let k = 0;
  while (sim.phase !== 'over' && k < 600) {
    sim.step(1 / 30);
    if (k % 9 === 0) {
      const c = sim.carrier >= 0 ? sim.actors[sim.carrier] : null;
      const line = sim.actors.map((a) => `${a.role}${a.side ? 'd' : ''}:${a.x.toFixed(0)},${a.y.toFixed(0)}${a.mode[0]}${a.engaged >= 0 ? '*' : ''}`).join(' ');
      console.log(sim.t.toFixed(1), 'ball', sim.ball.state, sim.ball.x.toFixed(1), sim.ball.y.toFixed(1), c ? 'carrier ' + c.role : '', '\n   ', line);
    }
    k++;
  }
  console.log(sim.outcome, sim.events);
});
