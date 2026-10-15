import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { PlaySim, MID_Y } from '../src/game/sim';
import { decideOffense, pickDefense, pickPlay } from '../src/game/ai';
import { applyResult, newGame } from '../src/game/rules';
import { makeLineup } from './helpers';

it.skipIf(!process.env.DRIVES)('drives', () => {
  const rng = new Rng(Number(process.env.SEED ?? 5));
  const off = makeLineup(rng, Number(process.env.QO ?? 72));
  const def = makeLineup(rng, Number(process.env.QD ?? 72));
  let pts = 0;
  let drives = 0;
  let plays = 0;
  let yds = 0;
  let yac = 0, air = 0, big = 0;
  let passAtt = 0, cmp = 0, passYds = 0, ints = 0, sacks = 0, rushAtt = 0, rushYds = 0, tds = 0, fgs = 0, punts = 0, tos = 0;
  for (let d = 0; d < 400; d++) {
    const g = newGame({ quarterLength: 900, playoff: false, openingKicker: 1 });
    g.phase = 'scrimmage';
    g.possession = 0;
    g.ballOn = 25;
    g.down = 1;
    g.toGo = 10;
    drives++;
    for (let k = 0; k < 40; k++) {
      if (g.phase !== 'scrimmage' || g.possession !== 0) break;
      const dec = decideOffense(g, { passBias: 0.55, aggression: 0.5, kickRange: 52 }, rng);
      if (dec === 'punt') { punts++; break; }
      if (dec === 'fg') { if (rng.chance(0.8)) { pts += 3; fgs++; } break; }
      const play = pickPlay(g, dec, rng);
      const call = pickDefense(g, 0.5, 'balanced', rng);
      const sim = new PlaySim({ kind: 'scrimmage', los: g.ballOn, ballY: MID_Y, toGo: g.toGo, down: g.down, play, defCall: call, offense: off, defense: def, userControls: false, skill: { off: 0, def: Number(process.env.SKILLD ?? 0) }, weather: 'clear', seed: rng.int(1, 1e9) });
      const o = sim.runHeadless();
      plays++;
      const gain = o.endX - g.ballOn;
      if (sim.passThrown) { passAtt++; if (!o.incomplete && !o.turnover) { cmp++; passYds += gain; yac += o.offTd ? 0 : o.endX - sim.catchFrom; air += sim.catchFrom - g.ballOn; if (gain >= 20) big++; } }
      else if (o.reason === 'sack') sacks++;
      else if (o.reason !== 'kneel' && o.reason !== 'spike') { rushAtt++; if (!o.turnover) rushYds += gain; }
      if (o.turnover) { if (sim.passThrown) ints++; tos++; }
      if (!o.turnover && !o.incomplete) yds += gain;
      applyResult(g, { kind: 'scrimmage', endX: o.endX, incomplete: o.incomplete, outOfBounds: o.outOfBounds, turnover: o.turnover, offTd: o.offTd, defTd: o.defTd, safety: o.safety, touchback: o.touchback, elapsed: o.elapsed });
      if (o.offTd) { pts += 7; tds++; break; }
      if (o.turnover || o.defTd || o.safety) break;
    }
  }
  console.log(`air ${(air / cmp).toFixed(1)} yac ${(yac / cmp).toFixed(1)} big20 ${big}`);
  console.log(`pts/drive ${(pts / drives).toFixed(2)} plays/drive ${(plays / drives).toFixed(1)} ypp ${(yds / plays).toFixed(2)} | pass ${cmp}/${passAtt} ${((cmp / passAtt) * 100).toFixed(0)}% ypa ${(passYds / passAtt).toFixed(1)} int% ${((ints / passAtt) * 100).toFixed(1)} sack% ${((sacks / (passAtt + sacks)) * 100).toFixed(1)} | rush ${rushAtt} ypc ${(rushYds / rushAtt).toFixed(2)} | TD ${tds} FG ${fgs} punts ${punts} TO ${tos}`);
});
