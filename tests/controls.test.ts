import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { PlaySim, MID_Y, NO_INPUT, SCOOT_YDS } from '../src/game/sim';
import { PLAYS, DEF_BY_ID } from '../src/game/playbook';
import { makeLineup } from './helpers';

function sim(playCat: string, seed = 3) {
  const rng = new Rng(seed);
  const play = PLAYS.find((p) => p.cat === playCat)!;
  const s = new PlaySim({ kind: 'scrimmage', los: 30, ballY: MID_Y, toGo: 10, down: 1, play, defCall: DEF_BY_ID.c3, offense: makeLineup(rng, 72), defense: makeLineup(rng, 60), userControls: true, skill: { off: 0, def: 0 }, weather: 'clear', seed });
  s.snap();
  return s;
}

describe('user controls', () => {
  it('the quarterback faces downfield while dropping back and aiming', () => {
    const s = sim('deep');
    for (let i = 0; i < 40; i++) {
      s.step(1 / 60);
      const q = s.actors[s.qb];
      if (q.mode === 'qb') expect(q.facing).toBe(1);
    }
  });

  it('the runner heads downfield alone and a swipe scoots him one lane', () => {
    const s = sim('run');
    let k = 0;
    while (s.carrier < 0 || s.carrier !== s.userActor) {
      s.step(1 / 60);
      if (++k > 300) throw new Error('no handoff');
    }
    const c = s.actors[s.carrier];
    const x0 = c.x;
    const y0 = c.y;
    s.step(1 / 60, { ...NO_INPUT, scoot: 1 });
    for (let i = 0; i < 40 && s.phase === 'live'; i++) s.step(1 / 60);
    expect(c.x).toBeGreaterThan(x0);
    expect(c.y - y0).toBeGreaterThan(SCOOT_YDS * 0.6);
    expect(c.y - y0).toBeLessThan(SCOOT_YDS * 1.5);
  });
});
