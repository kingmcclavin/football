import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { PlaySim, MID_Y } from '../src/game/sim';
import { PLAY_BY_ID, DEF_BY_ID } from '../src/game/playbook';
import { makeLineup } from './helpers';

it.skipIf(!process.env.TRACE)('trace2', () => {
  const rng = new Rng(7);
  const off = makeLineup(rng, 72);
  const def = makeLineup(rng, 72);
  const sim = new PlaySim({ kind: 'scrimmage', los: 30, ballY: MID_Y, toGo: 10, down: 1, play: PLAY_BY_ID[process.env.PLAY ?? 'slants'], defCall: DEF_BY_ID[process.env.DEF ?? 'c3'], offense: off, defense: def, userControls: false, skill: { off: 0, def: 0 }, weather: 'clear', seed: Number(process.env.SEED ?? 5) });
  sim.snap();
  let k = 0;
  while (sim.phase !== 'over' && k < 600) {
    sim.step(1 / 30);
    if (k % 6 === 0 && sim.carrier >= 0) {
      const c = sim.actors[sim.carrier];
      const ds = sim.actors.filter((a) => a.side !== c.side).map((a) => ({ a, d: Math.hypot(a.x - c.x, a.y - c.y) })).sort((p, q) => p.d - q.d).slice(0, 3);
      console.log(sim.t.toFixed(1), `C ${c.role} ${c.x.toFixed(1)},${c.y.toFixed(1)} v=${Math.hypot(c.vx, c.vy).toFixed(1)}/${c.maxSpd.toFixed(1)} `, ds.map(({ a, d }) => `${a.role} d=${d.toFixed(1)} v=${Math.hypot(a.vx, a.vy).toFixed(1)}/${a.maxSpd.toFixed(1)} ${a.mode} rT=${a.readT.toFixed(2)} st=${a.stun.toFixed(1)} e=${a.engaged} cd=${a.tackleCd.toFixed(1)}`).join(' | '));
    }
    k++;
  }
  console.log(sim.outcome?.reason, sim.outcome?.endX);
});
