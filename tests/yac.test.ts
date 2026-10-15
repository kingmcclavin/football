import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { PlaySim, MID_Y } from '../src/game/sim';
import { PLAYS, DEF_CALLS } from '../src/game/playbook';
import { makeLineup } from './helpers';

it.skipIf(!process.env.YAC)('yac', () => {
  const rng = new Rng(7);
  const off = makeLineup(rng, 72);
  const def = makeLineup(rng, 72);
  const passPlays = PLAYS.filter((p) => !p.run && p.cat !== 'special');
  let printed = 0;
  const nearHist: number[] = [0, 0, 0, 0, 0, 0];
  let n = 0, yacSum = 0;
  for (let s = 1; s <= 600; s++) {
    const play = passPlays[s % passPlays.length];
    const call = DEF_CALLS[(s * 7) % DEF_CALLS.length];
    const sim = new PlaySim({ kind: 'scrimmage', los: 30, ballY: MID_Y, toGo: 10, down: 1, play, defCall: call, offense: off, defense: def, userControls: false, skill: { off: 0, def: 0 }, weather: 'clear', seed: s });
    sim.snap();
    let near = -1;
    let guard = 0;
    while (sim.phase !== 'over' && guard++ < 600) {
      sim.step(1 / 30);
      if (near < 0 && sim.carrier >= 0 && sim.carrierHow === 'catch') {
        const c = sim.actors[sim.carrier];
        near = Math.min(...sim.actors.filter((a) => a.side === 1).map((a) => Math.hypot(a.x - c.x, a.y - c.y)));
      }
    }
    const o = sim.outcome!;
    if (near >= 0 && !o.turnover) {
      const yac = (o.offTd ? 100 : o.endX) - sim.catchFrom;
      n++;
      yacSum += yac;
      nearHist[Math.min(5, Math.floor(near / 2))]++;
      if (yac > 20 && printed++ < 8) console.log('BIG', play.id, call.id, 'seed', s, 'near', near.toFixed(1), 'yac', yac.toFixed(0), 'catchAt', (sim.catchFrom - 30).toFixed(0));
    }
  }
  console.log('avg yac', (yacSum / n).toFixed(1), 'nearest-defender-at-catch hist (2yd bins)', nearHist.join(' '));
});
