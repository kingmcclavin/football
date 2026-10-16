import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { PlaySim, MID_Y } from '../src/game/sim';
import { PLAYS, DEF_CALLS } from '../src/game/playbook';
import { makeLineup } from './helpers';

it.skipIf(!process.env.WHY)('why incomplete', () => {
  const rng = new Rng(7);
  const off = makeLineup(rng, 72);
  const def = makeLineup(rng, 72);
  const why: Record<string, number> = {};
  let att = 0;
  const plays = PLAYS.filter((p) => p.cat !== 'special' && !(p.run && !p.fake));
  for (let i = 0; i < 2000; i++) {
    const play = plays[i % plays.length];
    const call = DEF_CALLS[Math.floor(rng.next() * DEF_CALLS.length)];
    const sim = new PlaySim({ kind: 'scrimmage', los: 30, ballY: MID_Y, toGo: 10, down: 1, play, defCall: call, offense: off, defense: def, userControls: false, skill: { off: 0, def: 0 }, weather: 'clear', seed: i * 7919 + 1 });
    const o = sim.runHeadless();
    if (!sim.passThrown) continue;
    att++;
    const k = o.incomplete ? o.summary : o.turnover ? 'TURNOVER ' + o.reason : 'complete';
    why[k] = (why[k] ?? 0) + 1;
  }
  console.log(att, Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${((v / att) * 100).toFixed(1)}%`).join('\n'));
});
