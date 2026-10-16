import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { PlaySim, MID_Y, NO_INPUT } from '../src/game/sim';
import { DEF_CALLS, makeOptionPlay } from '../src/game/playbook';
import { makeLineup } from './helpers';

it.skipIf(!process.env.OPTSTATS)('option hand-off yards', () => {
  const rng = new Rng(3);
  const off = makeLineup(rng, 72);
  const def = makeLineup(rng, 72);
  const by: Record<string, { n: number; yds: number }> = {};
  for (let i = 0; i < 900; i++) {
    const play = makeOptionPlay((n) => rng.int(0, n - 1));
    const s = new PlaySim({ kind: 'scrimmage', los: 30, ballY: MID_Y, toGo: 10, down: 1, play, defCall: DEF_CALLS[i % DEF_CALLS.length], offense: off, defense: def, userControls: true, skill: { off: 0, def: 0 }, weather: 'clear', seed: i * 31 + 7 });
    s.snap();
    for (let k = 0; k < 900 && s.phase === 'live'; k++) s.step(1 / 60, k === 15 ? { ...NO_INPUT, handoff: true } : NO_INPUT);
    const o = s.outcome!;
    const b = (by[play.id] ??= { n: 0, yds: 0 });
    b.n++;
    b.yds += o.turnover ? 0 : o.offTd ? 70 : o.endX - 30;
  }
  for (const [k, b] of Object.entries(by)) console.log(k, 'n', b.n, 'ypc', (b.yds / b.n).toFixed(2));
});
