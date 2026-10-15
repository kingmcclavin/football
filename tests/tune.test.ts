import { describe, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { PlaySim, MID_Y } from '../src/game/sim';
import { PLAYS, DEF_CALLS } from '../src/game/playbook';
import { makeLineup } from './helpers';

describe.skipIf(!process.env.TUNE)('tuning', () => {
  it('measures play outcomes', () => {
    const rng = new Rng(7);
    const off = makeLineup(rng, Number(process.env.QO ?? 72));
    const def = makeLineup(rng, Number(process.env.QD ?? 72));
    const byCat: Record<string, { n: number; yds: number; cmp: number; att: number; sack: number; int: number; inc: number; td: number; fum: number; t: number }> = {};
    const tdBy: Record<string, number> = {};
    const sackBy: Record<string, number> = {};
    const plays = PLAYS.filter((p) => p.cat !== 'special');
    for (let i = 0; i < 3000; i++) {
      const play = plays[i % plays.length];
      const call = DEF_CALLS[Math.floor(rng.next() * DEF_CALLS.length)];
      const sim = new PlaySim({ kind: 'scrimmage', los: 30, ballY: MID_Y, toGo: 10, down: 1, play, defCall: call, offense: off, defense: def, userControls: false, skill: { off: 0, def: 0 }, weather: 'clear', seed: i * 7919 + 1 });
      const o = sim.runHeadless();
      const cat = play.run && !play.fake ? 'run' : play.cat;
      const b = (byCat[cat] ??= { n: 0, yds: 0, cmp: 0, att: 0, sack: 0, int: 0, inc: 0, td: 0, fum: 0, t: 0 });
      b.n++;
      b.t += o.elapsed;
      const yds = o.turnover ? 0 : o.offTd ? 70 : o.incomplete ? 0 : o.endX - 30;
      b.yds += yds;
      if (sim.passThrown) b.att++;
      if (o.reason === 'sack') { b.sack++; sackBy[play.id] = (sackBy[play.id] ?? 0) + 1; }
      if (o.reason === 'incomplete') b.inc++;
      if (sim.passThrown && !o.incomplete && !o.turnover) b.cmp++;
      if (o.turnover && sim.passThrown) b.int++;
      if (o.reason === 'fumble' && o.turnover) b.fum++;
      if (o.offTd) tdBy[call.id] = (tdBy[call.id] ?? 0) + 1;
      if (o.offTd) { b.td++; if (call.id === 'c1' && b.td < 4) console.log('TD', play.id, call.id, i * 7919 + 1); }
    }
    console.log('TDBYCOV', JSON.stringify(tdBy));
    console.log('SACKBY', JSON.stringify(sackBy));
    for (const [k, b] of Object.entries(byCat)) {
      console.log(k.padEnd(7), 'n', b.n, 'ypp', (b.yds / b.n).toFixed(2), 'cmp%', ((b.cmp / Math.max(1, b.att)) * 100).toFixed(1), 'sack%', ((b.sack / b.n) * 100).toFixed(1), 'int%', ((b.int / Math.max(1, b.att)) * 100).toFixed(1), 'td', b.td, 'fum', b.fum, 'avgT', (b.t / b.n).toFixed(1));
    }
  });
});
