import { describe, expect, it } from 'vitest';
import { createCareer } from '../src/league/career';
import { Match, PLAY_CHANGES } from '../src/game/match';
import { DEFAULT_SETTINGS } from '../src/save/settings';
import { PLAYS } from '../src/game/playbook';
import { NO_INPUT } from '../src/game/sim';
import { Rng } from '../src/core/rng';
import { applyGameResult, userGameThisWeek } from '../src/league/season';

function autoPlay(m: Match, rng: Rng, maxSteps = 200000, onStep?: (m: Match) => void) {
  let steps = 0;
  const offPlays = PLAYS.filter((p) => p.cat !== 'special');
  while (m.stage !== 'final' && steps++ < maxSteps) {
    onStep?.(m);
    if ((m.stage as string) === 'final') break;
    switch (m.stage) {
      case 'coin':
        m.callCoin('heads');
        break;
      case 'playcall': {
        const g = m.g;
        if (g.down === 4 && !m.twoPointTry) {
          if (m.canFieldGoal() && g.ballOn > 60) m.choosePlay('fg');
          else if (g.toGo > 3) m.choosePlay('punt');
          else m.choosePlay(rng.pick(offPlays).id);
        } else m.choosePlay(rng.pick(offPlays).id);
        break;
      }
      case 'defcall':
        m.chooseDefense(null);
        break;
      case 'presnap':
        m.snap();
        break;
      case 'pat':
        m.choosePat(rng.chance(0.85) ? 'xp' : '2pt');
        break;
      case 'kickoffChoice':
        m.chooseKickoff('normal');
        break;
      case 'kick':
        // tap near the middle of the aim and near full power
        if (m.meter!.phase === 'aim' && Math.abs(m.meter!.aim) < 0.1) m.kickTap();
        else if (m.meter!.phase === 'power' && m.meter!.power > 0.9) m.kickTap();
        m.update(1 / 60);
        break;
      case 'halftime':
        m.next();
        break;
      case 'live': {
        let input = NO_INPUT;
        const sim = m.sim!;
        if (sim.userActor === sim.qb && sim.canThrow() && sim.t > 1.6) {
          // throw to the most open receiver using the route predictor
          const q = sim.actors[sim.qb];
          const recs = sim.actors.filter((a) => a.side === 0 && a.mode === 'route');
          if (recs.length) {
            const r = rng.pick(recs);
            const [x, y] = sim.predictRoute(r, 0.25 + Math.hypot(r.x - q.x, r.y - q.y) / 22);
            input = { ...NO_INPUT, throwAt: { x, y } };
          }
        }
        m.update(1 / 30, input);
        break;
      }
      default:
        m.update(1 / 30);
    }
  }
  return steps;
}

describe('match flow', () => {
  it('plays full user games to completion', () => {
    const c = createCareer({ coachName: 'T', teamId: 5, difficulty: 'pro', slot: 0, seed: 99 });
    const rng = new Rng(3);
    for (let i = 0; i < 4; i++) {
      const game = userGameThisWeek(c)!;
      const m = new Match(c, game, { ...DEFAULT_SETTINGS, defenseMode: 'call', defenseView: i % 2 ? 'skip' : 'fast', quarterMinutes: 4 }, 'clear');
      const steps = autoPlay(m, rng);
      expect(m.stage).toBe('final');
      const box = m.finishBox();
      const pts = (side: number) => box.quarters[side].reduce((a, b) => a + b, 0);
      expect(pts(0)).toBe(box.hs);
      expect(pts(1)).toBe(box.as);
      console.log(`game ${i}: ${c.teams[game.home].abbr} ${box.hs} - ${c.teams[game.away].abbr} ${box.as} ot=${box.ot} plays=${m.g.plays} steps=${steps}`, box.team.map((t) => `${t.yds}yds ${t.turnovers}TO`).join(' | '));
      applyGameResult(c, game, box, rng);
      c.week++;
    }
  });

  it('sim drive plays out whole opponent possessions and hands the ball back', () => {
    const c = createCareer({ coachName: 'T', teamId: 9, difficulty: 'pro', slot: 0, seed: 7 });
    const rng = new Rng(5);
    const game = userGameThisWeek(c)!;
    const m = new Match(c, game, { ...DEFAULT_SETTINGS, defenseMode: 'call', defenseView: 'fast', quarterMinutes: 4 }, 'clear');
    let drives = 0;
    autoPlay(m, rng, 200000, (mm) => {
      if (!mm.canSimDrive()) return;
      mm.simDrive();
      drives++;
      // afterwards the opponent's possession is over (or we stopped at halftime / the end)
      expect(mm.canSimDrive() && mm.g.quarter !== 3).toBe(false);
      expect(mm.banner?.text).toMatch(/DRIVE/);
    });
    expect(m.stage).toBe('final');
    expect(drives).toBeGreaterThan(3);
    const box = m.finishBox();
    expect(box.quarters[0].reduce((a, b) => a + b, 0)).toBe(box.hs);
    expect(box.quarters[1].reduce((a, b) => a + b, 0)).toBe(box.as);
  });

  it("'Sim drive' setting simulates every opponent drive on its own", () => {
    const c = createCareer({ coachName: 'T', teamId: 3, difficulty: 'pro', slot: 0, seed: 21 });
    const rng = new Rng(8);
    const game = userGameThisWeek(c)!;
    const m = new Match(c, game, { ...DEFAULT_SETTINGS, defenseMode: 'call', defenseView: 'drive', quarterMinutes: 4 }, 'clear');
    let defcalls = 0;
    autoPlay(m, rng, 200000, (mm) => { if (mm.stage === 'defcall' && mm.g.phase === 'scrimmage') defcalls++; });
    expect(m.stage).toBe('final');
    expect(defcalls).toBe(0);
  });

  it('coach play calling picks plays and allows only a few changes per game', () => {
    const c = createCareer({ coachName: 'T', teamId: 12, difficulty: 'pro', slot: 0, seed: 33 });
    const rng = new Rng(4);
    const game = userGameThisWeek(c)!;
    const m = new Match(c, game, { ...DEFAULT_SETTINGS, playCalling: 'coach', defenseView: 'drive', quarterMinutes: 4 }, 'clear');
    let coachCalls = 0;
    let changesTried = 0;
    let lastPresnap = -1;
    autoPlay(m, rng, 200000, (mm) => {
      if (mm.stage !== 'presnap' || !mm.userOnOffense || mm.g.plays === lastPresnap) return;
      lastPresnap = mm.g.plays;
      if (!mm.coachCalled) return;
      coachCalls++;
      // try to change the first six coach calls: only PLAY_CHANGES go through
      if (changesTried < 6) {
        changesTried++;
        const before = mm.playChanges;
        mm.changePlay();
        if (before > 0) expect(mm.stage).toBe('playcall');
        else expect(mm.stage).toBe('presnap');
      }
    });
    expect(m.stage).toBe('final');
    expect(coachCalls).toBeGreaterThan(10);
    expect(m.playChanges).toBe(0);
    expect(PLAY_CHANGES).toBe(4);
  });
});
