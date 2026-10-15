// Pure football rules engine. Holds the authoritative game state and applies the
// outcome of each play. Knows nothing about rendering or physics.

export type Side = 0 | 1; // 0 = home, 1 = away
export type Phase = 'kickoff' | 'scrimmage' | 'pat' | 'freekick' | 'final';

export interface OtState {
  possessed: [boolean, boolean];
  period: number;
}

export interface GameState {
  quarter: number; // 1..4, 5+ overtime periods
  clock: number; // seconds left in the period
  quarterLength: number; // seconds per regulation quarter
  playoff: boolean;
  possession: Side; // offense for scrimmage/pat, kicking team for kickoff/freekick
  ballOn: number; // yards from possession team's own goal line
  down: number;
  toGo: number;
  score: [number, number];
  timeouts: [number, number];
  phase: Phase;
  clockRunning: boolean; // whether time runs off before the next snap
  openingKicker: Side;
  twoMinWarned: boolean;
  ot: OtState | null;
  winner: Side | -1 | null; // -1 tie, null in progress
  lastEvent: string;
  plays: number;
}

export type ScoreType = 'td' | 'safety' | 'fg' | null;

/** Result of a scrimmage play, in offense coordinates. */
export interface ScrimmageResult {
  kind: 'scrimmage';
  endX: number; // where the ball is dead (offense coords; may be <0 or >100)
  incomplete: boolean;
  outOfBounds: boolean;
  turnover: boolean; // defense now has ball at endX (in offense coords)
  offTd: boolean;
  defTd: boolean;
  safety: boolean;
  touchback: boolean; // turnover downed in defense's end zone
  elapsed: number; // seconds of game clock consumed during the live play
  spike?: boolean;
  kneel?: boolean;
}

export interface KickResult {
  kind: 'kickoff' | 'punt';
  /** Receiving team's ball position (from their own goal) when the play ends. */
  recvBallOn: number;
  returnTd: boolean;
  kickingRecovers: boolean; // onside recovered / muffed punt recovered by kicking team
  outOfBounds: boolean;
  elapsed: number;
  /** For a recovered kick, the kicking team's ball position. */
  kickBallOn?: number;
}

export interface FgResult {
  kind: 'fg';
  good: boolean;
  elapsed: number;
}

export interface PatResult {
  kind: 'pat';
  points: 0 | 1 | 2;
}

export type PlayResult = ScrimmageResult | KickResult | FgResult | PatResult;

export function newGame(opts: { quarterLength: number; playoff: boolean; openingKicker: Side }): GameState {
  return {
    quarter: 1,
    clock: opts.quarterLength,
    quarterLength: opts.quarterLength,
    playoff: opts.playoff,
    possession: opts.openingKicker,
    ballOn: 35,
    down: 1,
    toGo: 10,
    score: [0, 0],
    timeouts: [3, 3],
    phase: 'kickoff',
    clockRunning: false,
    openingKicker: opts.openingKicker,
    twoMinWarned: false,
    ot: null,
    winner: null,
    lastEvent: 'Kickoff',
    plays: 0,
  };
}

export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export function isHalfLate(g: GameState, secs = 120): boolean {
  return (g.quarter === 2 || g.quarter >= 4) && g.clock <= secs * (g.quarterLength / 900) + 0.001;
}

/** Real-football between-play runoff, scaled to the configured quarter length. */
export function runoffSeconds(g: GameState, kind: 'normal' | 'kneel' = 'normal'): number {
  const scale = g.quarterLength / 900;
  if (kind === 'kneel') return Math.max(6, 40 * scale);
  let base = 33;
  const off = g.possession;
  const diff = g.score[off] - g.score[other(off)];
  const late = isHalfLate(g, 120);
  if (late && diff <= 0) base = 13; // hurry-up offense
  else if (g.quarter >= 4 && diff > 0 && g.clock < 300 * scale) base = 40; // milking the clock
  return Math.max(3, base * scale);
}

/** Apply pre-snap runoff. Returns true if the period ended before the snap. */
export function applyRunoff(g: GameState, kind: 'normal' | 'kneel' = 'normal'): boolean {
  if (!g.clockRunning || g.phase !== 'scrimmage') return false;
  const before = g.clock;
  g.clock = Math.max(0, g.clock - runoffSeconds(g, kind));
  checkTwoMinute(g, before);
  if (g.clock <= 0) {
    endPeriod(g);
    return true;
  }
  return false;
}

function checkTwoMinute(g: GameState, before: number) {
  const mark = 120 * (g.quarterLength / 900);
  if ((g.quarter === 2 || g.quarter === 4) && before > mark && g.clock <= mark && !g.twoMinWarned) {
    g.twoMinWarned = true;
    if (g.clock > 0) {
      g.clock = mark;
      g.clockRunning = false;
      g.lastEvent = 'Two-minute warning';
    }
  }
}

export function callTimeout(g: GameState, side: Side): boolean {
  if (g.timeouts[side] <= 0 || g.phase === 'final') return false;
  g.timeouts[side]--;
  g.clockRunning = false;
  g.lastEvent = 'Timeout';
  return true;
}

function setFirstDown(g: GameState) {
  g.down = 1;
  g.toGo = Math.min(10, 100 - g.ballOn);
}

function scoreTd(g: GameState, side: Side) {
  g.score[side] += 6;
  g.clockRunning = false;
  if (otShouldEnd(g, side, true)) return;
  g.possession = side;
  g.phase = 'pat';
  g.ballOn = 98;
  g.down = 1;
  g.toGo = 2;
}

/** Decide if an overtime score ends the game. */
function otShouldEnd(g: GameState, scorer: Side, defensiveOrTdCheck: boolean): boolean {
  if (!g.ot) return false;
  const lead = g.score[scorer] > g.score[other(scorer)];
  if (!lead) return false;
  const both = g.ot.possessed[0] && g.ot.possessed[1];
  // A defensive score ends the game immediately; otherwise both teams must have had the ball.
  const defensive = scorer !== g.possession;
  if (both || (defensive && defensiveOrTdCheck)) {
    finish(g);
    return true;
  }
  return false;
}

function finish(g: GameState) {
  g.phase = 'final';
  g.clockRunning = false;
  if (g.score[0] > g.score[1]) g.winner = 0;
  else if (g.score[1] > g.score[0]) g.winner = 1;
  else g.winner = -1;
}

/** Gives `side` a new offensive possession (used for OT bookkeeping). */
function startPossession(g: GameState, side: Side, ballOn: number) {
  if (g.ot) {
    const both = g.ot.possessed[0] && g.ot.possessed[1];
    if (both && g.score[0] !== g.score[1]) {
      finish(g);
      return;
    }
    g.ot.possessed[side] = true;
  }
  g.possession = side;
  g.phase = 'scrimmage';
  if (ballOn <= 0) ballOn = 20;
  g.ballOn = Math.max(1, Math.min(99, ballOn));
  setFirstDown(g);
}

function kickoffBy(g: GameState, side: Side, phase: Phase = 'kickoff') {
  g.possession = side;
  g.phase = phase;
  g.ballOn = phase === 'freekick' ? 20 : 35;
  g.down = 1;
  g.toGo = 10;
  g.clockRunning = false;
}

/** Called when the clock hits zero at the end of a play (or before a snap). */
export function endPeriod(g: GameState) {
  if (g.phase === 'final') return;
  if (g.phase === 'pat') return; // PAT is untimed; resolved first
  const q = g.quarter;
  g.clockRunning = false;
  if (q === 1 || q === 3) {
    g.quarter++;
    g.clock = g.quarterLength;
    g.lastEvent = `End of Q${q}`;
    if (q === 3) g.twoMinWarned = false;
    return;
  }
  if (q === 2) {
    g.quarter = 3;
    g.clock = g.quarterLength;
    g.twoMinWarned = false;
    g.lastEvent = 'Halftime';
    kickoffBy(g, other(g.openingKicker));
    return;
  }
  // end of 4th or an OT period
  if (g.score[0] !== g.score[1]) {
    finish(g);
    return;
  }
  if (q >= 5 && !g.playoff) {
    finish(g); // regular season tie
    return;
  }
  g.quarter++;
  g.clock = g.playoff ? g.quarterLength : Math.round(g.quarterLength * (10 / 15));
  g.twoMinWarned = true;
  if (!g.ot) {
    g.ot = { possessed: [false, false], period: 1 };
    g.timeouts = [2, 2];
    g.lastEvent = 'Overtime';
    // coin toss decided by the caller via g.openingKicker flip semantics: home kicks if away won
    kickoffBy(g, g.openingKicker);
  } else {
    g.ot.period++;
    g.lastEvent = `End of OT${g.ot.period - 1}`;
  }
}

function tickClock(g: GameState, elapsed: number) {
  if (elapsed <= 0) return;
  const before = g.clock;
  g.clock = Math.max(0, g.clock - elapsed);
  checkTwoMinute(g, before);
}

function afterPlayClock(g: GameState) {
  if (g.phase === 'final') return;
  if (g.clock <= 0 && g.phase !== 'pat') endPeriod(g);
}

export function applyResult(g: GameState, r: PlayResult): GameState {
  if (g.phase === 'final') return g;
  g.plays++;
  switch (r.kind) {
    case 'scrimmage':
      applyScrimmage(g, r);
      break;
    case 'kickoff':
    case 'punt':
      applyKick(g, r);
      break;
    case 'fg':
      applyFg(g, r);
      break;
    case 'pat':
      applyPat(g, r);
      break;
  }
  return g;
}

function applyScrimmage(g: GameState, r: ScrimmageResult) {
  const off = g.possession;
  const def = other(off);
  if (g.phase === 'pat') {
    // two-point try
    applyPat(g, { kind: 'pat', points: r.offTd && !r.turnover ? 2 : 0 });
    return;
  }
  const warnedBefore = g.twoMinWarned;
  tickClock(g, r.elapsed);
  const warning = !warnedBefore && g.twoMinWarned && g.clock > 0;
  const los = g.ballOn;
  if (r.offTd && !r.turnover) {
    g.lastEvent = 'Touchdown';
    scoreTd(g, off);
    return;
  }
  if (r.defTd) {
    g.lastEvent = 'Defensive touchdown';
    if (g.ot) g.ot.possessed[def] = true;
    scoreTd(g, def);
    return;
  }
  if (r.safety) {
    g.score[def] += 2;
    g.lastEvent = 'Safety';
    if (otShouldEnd(g, def, true)) return;
    kickoffBy(g, off, 'freekick');
    afterPlayClock(g);
    return;
  }
  if (r.turnover) {
    g.lastEvent = 'Turnover';
    const defBall = r.touchback ? 20 : 100 - r.endX;
    g.clockRunning = false;
    startPossession(g, def, defBall);
    afterPlayClock(g);
    return;
  }
  // normal play
  const gained = r.endX - los;
  g.ballOn = Math.max(0.5, Math.min(99.5, r.endX));
  g.clockRunning = !(r.incomplete || r.spike || (r.outOfBounds && (isHalfLate(g, 120) || (g.quarter >= 4 && isHalfLate(g, 300)))));
  if (g.ot && g.quarter >= 5) {
    // OT keeps NFL-style clock behaviour too
  }
  if (gained >= g.toGo) {
    g.lastEvent = 'First down';
    setFirstDown(g);
  } else if (g.down >= 4) {
    g.lastEvent = 'Turnover on downs';
    g.clockRunning = false;
    startPossession(g, def, 100 - g.ballOn);
  } else {
    g.down++;
    g.toGo = Math.max(0.5, g.toGo - gained);
    g.lastEvent = r.incomplete ? 'Incomplete' : 'Play';
  }
  if (warning && g.phase === 'scrimmage') {
    g.clockRunning = false;
    g.lastEvent = 'Two-minute warning';
  }
  afterPlayClock(g);
}

function applyKick(g: GameState, r: KickResult) {
  const kicker = g.possession;
  const recv = other(kicker);
  tickClock(g, r.elapsed);
  if (r.kickingRecovers) {
    g.lastEvent = r.kind === 'kickoff' ? 'Onside kick recovered' : 'Muffed punt recovered';
    g.clockRunning = false;
    g.phase = 'scrimmage';
    g.possession = kicker;
    g.ballOn = Math.max(1, Math.min(99, r.kickBallOn ?? 50));
    setFirstDown(g);
    afterPlayClock(g);
    return;
  }
  if (r.returnTd) {
    g.lastEvent = 'Return touchdown';
    if (g.ot) g.ot.possessed[recv] = true;
    g.possession = recv;
    scoreTd(g, recv);
    return;
  }
  g.lastEvent = r.kind === 'kickoff' ? 'Kickoff return' : 'Punt';
  g.clockRunning = false;
  startPossession(g, recv, r.recvBallOn);
  afterPlayClock(g);
}

export function fgDistance(ballOn: number): number {
  return Math.round(100 - ballOn + 17);
}

function applyFg(g: GameState, r: FgResult) {
  const off = g.possession;
  tickClock(g, r.elapsed);
  g.clockRunning = false;
  if (r.good) {
    g.score[off] += 3;
    g.lastEvent = 'Field goal';
    if (otShouldEnd(g, off, false)) return;
    kickoffBy(g, off);
  } else {
    g.lastEvent = 'Field goal missed';
    const spot = Math.max(20, g.ballOn - 7);
    startPossession(g, other(off), 100 - spot);
  }
  afterPlayClock(g);
}

function applyPat(g: GameState, r: PatResult) {
  const off = g.possession;
  g.score[off] += r.points;
  g.lastEvent = r.points === 2 ? 'Two-point conversion' : r.points === 1 ? 'Extra point' : 'Try failed';
  if (otShouldEnd(g, off, false)) return;
  kickoffBy(g, off);
  if (g.clock <= 0) endPeriod(g);
}

export function downText(g: GameState): string {
  const ord = ['1st', '2nd', '3rd', '4th'][g.down - 1] ?? `${g.down}th`;
  const goal = g.ballOn + g.toGo >= 100;
  const togo = goal ? 'Goal' : g.toGo < 1 ? 'Inches' : String(Math.round(g.toGo));
  return `${ord} & ${togo}`;
}

export function spotText(ballOn: number): string {
  const b = Math.round(ballOn);
  if (b === 50) return 'Midfield';
  return b < 50 ? `OWN ${b}` : `OPP ${100 - b}`;
}

export function clockText(secs: number): string {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function quarterText(q: number): string {
  return q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `OT${q - 4}`;
}
