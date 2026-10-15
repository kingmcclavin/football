import { describe, expect, it } from 'vitest';
import { applyResult, applyRunoff, callTimeout, endPeriod, newGame, type GameState, type ScrimmageResult } from '../src/game/rules';

const base = (o: Partial<ScrimmageResult>): ScrimmageResult => ({
  kind: 'scrimmage', endX: 0, incomplete: false, outOfBounds: false, turnover: false, offTd: false, defTd: false, safety: false, touchback: false, elapsed: 5, ...o,
});

function scrimmage(g: GameState, side: 0 | 1, ballOn: number, down = 1, toGo = 10) {
  g.phase = 'scrimmage';
  g.possession = side;
  g.ballOn = ballOn;
  g.down = down;
  g.toGo = toGo;
  return g;
}

describe('rules engine', () => {
  it('kickoff gives the receiving team the ball', () => {
    const g = newGame({ quarterLength: 900, playoff: false, openingKicker: 0 });
    applyResult(g, { kind: 'kickoff', recvBallOn: 27, returnTd: false, kickingRecovers: false, outOfBounds: false, elapsed: 5 });
    expect(g.phase).toBe('scrimmage');
    expect(g.possession).toBe(1);
    expect(g.ballOn).toBe(27);
    expect(g.down).toBe(1);
    expect(g.toGo).toBe(10);
  });

  it('awards a first down and advances downs', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 30);
    applyResult(g, base({ endX: 34 }));
    expect(g.down).toBe(2);
    expect(g.toGo).toBe(6);
    applyResult(g, base({ endX: 41 }));
    expect(g.down).toBe(1);
    expect(g.toGo).toBe(10);
    expect(g.ballOn).toBe(41);
  });

  it('goal to go near the end zone', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 85);
    applyResult(g, base({ endX: 96 }));
    expect(g.down).toBe(1);
    expect(g.toGo).toBe(4);
  });

  it('touchdown leads to a PAT then a kickoff by the scoring team', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 1 }), 0, 80);
    applyResult(g, base({ endX: 100, offTd: true }));
    expect(g.score).toEqual([6, 0]);
    expect(g.phase).toBe('pat');
    applyResult(g, { kind: 'pat', points: 1 });
    expect(g.score).toEqual([7, 0]);
    expect(g.phase).toBe('kickoff');
    expect(g.possession).toBe(0);
  });

  it('two-point try via scrimmage play', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 1 }), 0, 80);
    applyResult(g, base({ endX: 100, offTd: true }));
    applyResult(g, base({ endX: 100, offTd: true }));
    expect(g.score).toEqual([8, 0]);
  });

  it('interception flips possession and field position', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 40);
    applyResult(g, base({ endX: 55, turnover: true }));
    expect(g.possession).toBe(1);
    expect(g.ballOn).toBe(45);
    expect(g.down).toBe(1);
    expect(g.clockRunning).toBe(false);
  });

  it('interception downed in the end zone is a touchback', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 70);
    applyResult(g, base({ endX: 104, turnover: true, touchback: true }));
    expect(g.possession).toBe(1);
    expect(g.ballOn).toBe(20);
  });

  it('pick six scores for the defense', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 40);
    applyResult(g, base({ endX: 0, turnover: true, defTd: true }));
    expect(g.score).toEqual([0, 6]);
    expect(g.phase).toBe('pat');
    expect(g.possession).toBe(1);
  });

  it('turnover on downs', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 60, 4, 3);
    applyResult(g, base({ endX: 61 }));
    expect(g.possession).toBe(1);
    expect(g.ballOn).toBe(39);
  });

  it('safety scores 2 and forces a free kick', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 3);
    applyResult(g, base({ endX: -1, safety: true }));
    expect(g.score).toEqual([0, 2]);
    expect(g.phase).toBe('freekick');
    expect(g.possession).toBe(0);
  });

  it('missed field goal gives the ball back at the spot of the kick', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 65, 4, 8);
    applyResult(g, { kind: 'fg', good: false, elapsed: 4 });
    expect(g.possession).toBe(1);
    expect(g.ballOn).toBe(100 - 58);
    const g2 = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 85, 4, 8);
    applyResult(g2, { kind: 'fg', good: false, elapsed: 4 });
    expect(g2.ballOn).toBe(100 - 78);
  });

  it('made field goal scores 3 and kicks off', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 1, 70, 4, 8);
    applyResult(g, { kind: 'fg', good: true, elapsed: 4 });
    expect(g.score).toEqual([0, 3]);
    expect(g.phase).toBe('kickoff');
    expect(g.possession).toBe(1);
  });

  it('clock: incomplete passes stop it, runs keep it running', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 30);
    applyResult(g, base({ endX: 30, incomplete: true }));
    expect(g.clockRunning).toBe(false);
    applyResult(g, base({ endX: 33 }));
    expect(g.clockRunning).toBe(true);
    const before = g.clock;
    applyRunoff(g);
    expect(g.clock).toBeLessThan(before);
    expect(callTimeout(g, 0)).toBe(true);
    expect(g.timeouts[0]).toBe(2);
    expect(g.clockRunning).toBe(false);
  });

  it('quarters advance and halftime switches the kickoff', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 30);
    g.clock = 3;
    applyResult(g, base({ endX: 34, elapsed: 5 }));
    expect(g.quarter).toBe(2);
    expect(g.possession).toBe(0); // same drive continues
    g.clock = 2;
    applyResult(g, base({ endX: 36, elapsed: 5 }));
    expect(g.quarter).toBe(3);
    expect(g.phase).toBe('kickoff');
    expect(g.possession).toBe(1); // team that received first now kicks
  });

  it('two-minute warning stops the clock', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 30);
    g.quarter = 4;
    g.clock = 125;
    applyResult(g, base({ endX: 33, elapsed: 8 }));
    expect(g.clock).toBe(120);
    expect(g.clockRunning).toBe(false);
    expect(g.lastEvent).toBe('Two-minute warning');
  });

  it('game ends when the 4th quarter expires with a lead', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 30);
    g.quarter = 4;
    g.clock = 3;
    g.score = [14, 10];
    applyResult(g, base({ endX: 31, elapsed: 4 }));
    expect(g.phase).toBe('final');
    expect(g.winner).toBe(0);
  });

  it('TD as time expires still allows the PAT', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 80);
    g.quarter = 4;
    g.clock = 2;
    g.score = [10, 16];
    applyResult(g, base({ endX: 100, offTd: true, elapsed: 6 }));
    expect(g.phase).toBe('pat');
    expect(g.score).toEqual([16, 16]);
    applyResult(g, { kind: 'pat', points: 1 });
    expect(g.phase).toBe('final');
    expect(g.winner).toBe(0);
  });

  it('tied regulation goes to overtime; first-possession FG does not end it', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: false, openingKicker: 0 }), 0, 30);
    g.quarter = 4;
    g.clock = 0;
    g.score = [17, 17];
    endPeriod(g);
    expect(g.quarter).toBe(5);
    expect(g.ot).not.toBeNull();
    expect(g.phase).toBe('kickoff');
    const kicker = g.possession;
    const recv = kicker === 0 ? 1 : 0;
    applyResult(g, { kind: 'kickoff', recvBallOn: 30, returnTd: false, kickingRecovers: false, outOfBounds: false, elapsed: 5 });
    expect(g.possession).toBe(recv);
    g.ballOn = 75;
    g.down = 4;
    applyResult(g, { kind: 'fg', good: true, elapsed: 4 });
    expect(g.phase).toBe('kickoff');
    expect(g.score[recv]).toBe(20);
    // other team gets the ball, scores a TD: wins immediately
    applyResult(g, { kind: 'kickoff', recvBallOn: 25, returnTd: false, kickingRecovers: false, outOfBounds: false, elapsed: 5 });
    expect(g.possession).toBe(kicker);
    g.ballOn = 90;
    applyResult(g, base({ endX: 100, offTd: true }));
    expect(g.phase).toBe('final');
    expect(g.winner).toBe(kicker);
  });

  it('overtime: matching FGs lead to sudden death', () => {
    const g = scrimmage(newGame({ quarterLength: 900, playoff: true, openingKicker: 0 }), 0, 30);
    g.quarter = 4;
    g.clock = 0;
    g.score = [10, 10];
    endPeriod(g);
    const kicker = g.possession;
    const recv = kicker === 0 ? 1 : 0;
    applyResult(g, { kind: 'kickoff', recvBallOn: 30, returnTd: false, kickingRecovers: false, outOfBounds: false, elapsed: 5 });
    g.ballOn = 70;
    applyResult(g, { kind: 'fg', good: true, elapsed: 4 });
    applyResult(g, { kind: 'kickoff', recvBallOn: 30, returnTd: false, kickingRecovers: false, outOfBounds: false, elapsed: 5 });
    g.ballOn = 70;
    applyResult(g, { kind: 'fg', good: true, elapsed: 4 });
    expect(g.phase).toBe('kickoff');
    expect(g.score[0]).toBe(13);
    expect(g.score[1]).toBe(13);
    // next score wins
    applyResult(g, { kind: 'kickoff', recvBallOn: 30, returnTd: false, kickingRecovers: false, outOfBounds: false, elapsed: 5 });
    expect(g.possession).toBe(recv);
    g.ballOn = 70;
    applyResult(g, { kind: 'fg', good: true, elapsed: 4 });
    expect(g.phase).toBe('final');
    expect(g.winner).toBe(recv);
  });

  it('regular-season overtime can end in a tie; playoffs continue', () => {
    const g = newGame({ quarterLength: 900, playoff: false, openingKicker: 0 });
    g.quarter = 4;
    g.clock = 0;
    g.score = [7, 7];
    endPeriod(g);
    endPeriod(g);
    expect(g.phase).toBe('final');
    expect(g.winner).toBe(-1);
    const p = newGame({ quarterLength: 900, playoff: true, openingKicker: 0 });
    p.quarter = 4;
    p.clock = 0;
    p.score = [7, 7];
    endPeriod(p);
    endPeriod(p);
    expect(p.phase).not.toBe('final');
    expect(p.quarter).toBe(6);
  });

  it('return touchdown scores for the receiving team', () => {
    const g = newGame({ quarterLength: 900, playoff: false, openingKicker: 0 });
    applyResult(g, { kind: 'kickoff', recvBallOn: 100, returnTd: true, kickingRecovers: false, outOfBounds: false, elapsed: 10 });
    expect(g.score).toEqual([0, 6]);
    expect(g.phase).toBe('pat');
    expect(g.possession).toBe(1);
  });
});
