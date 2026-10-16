import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { PlaySim, MID_Y, NO_INPUT } from '../src/game/sim';
import { DEF_CALLS, OPTION_ROUTES, makeOptionPlay } from '../src/game/playbook';
import { makeLineup } from './helpers';

function sim(seed: number) {
  const rng = new Rng(seed);
  const play = makeOptionPlay((n) => rng.int(0, n - 1));
  const s = new PlaySim({ kind: 'scrimmage', los: 30, ballY: MID_Y, toGo: 10, down: 1, play, defCall: DEF_CALLS[seed % DEF_CALLS.length], offense: makeLineup(rng, 72), defense: makeLineup(rng, 72), userControls: true, skill: { off: 0, def: 0 }, weather: 'clear', seed });
  s.snap();
  return { s, play };
}

describe('run or pass plays', () => {
  it('receivers always run fly/slant/cross/hook and the back has a lane', () => {
    for (let i = 1; i < 40; i++) {
      const { play } = sim(i);
      for (const slot of ['X', 'Z', 'SLOT', 'TE'] as const) expect(OPTION_ROUTES).toContain(play.routes[slot]);
      expect(play.run?.carrier).toBe('RB');
    }
  });

  it('a hand-off in the window gives the back the ball, under user control', () => {
    let ok = 0;
    for (let i = 1; i <= 20; i++) {
      const { s } = sim(i);
      for (let k = 0; k < 20; k++) s.step(1 / 60);
      expect(s.optionOpen()).toBe(true);
      s.step(1 / 60, { ...NO_INPUT, handoff: true });
      for (let k = 0; k < 60 && s.carrier < 0 && s.phase === 'live'; k++) s.step(1 / 60);
      const rb = s.actors.find((a) => a.role === 'RB')!;
      if (s.carrier === rb.i && s.userActor === rb.i) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(19);
  });

  it('without a hand-off it is a pass: the QB can throw and the back runs a check-down', () => {
    const { s } = sim(7);
    for (let k = 0; k < 90; k++) s.step(1 / 60);
    expect(s.optionOpen()).toBe(false);
    expect(s.canThrow()).toBe(true);
    expect(s.actors.find((a) => a.role === 'RB')!.mode).toBe('route');
    s.step(1 / 60, { ...NO_INPUT, handoff: true });
    expect(s.carrier).toBe(-1);
  });
});
