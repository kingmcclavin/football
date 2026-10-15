// Offensive and defensive playbooks. All coordinates are in yards relative to the
// line of scrimmage (x, negative = backfield) and to the ball (y offset).

export type Slot = 'QB' | 'RB' | 'FB' | 'X' | 'Z' | 'SLOT' | 'SLOT2' | 'TE' | 'TE2';
export const OL_SLOTS = ['LT', 'LG', 'C', 'RG', 'RT'] as const;

export interface RouteDef {
  pts: [number, number][]; // [forward, inside] from the receiver's alignment
  end: 'stop' | 'continue';
}

export const ROUTES: Record<string, RouteDef> = {
  go: { pts: [[45, 0]], end: 'continue' },
  seam: { pts: [[4, 1], [45, 1]], end: 'continue' },
  slant: { pts: [[2, 0], [14, 11]], end: 'continue' },
  quickOut: { pts: [[4, 0], [4.5, -12]], end: 'continue' },
  out: { pts: [[9, 0], [9.5, -12]], end: 'continue' },
  dig: { pts: [[12, 0], [12.5, 18]], end: 'continue' },
  curl: { pts: [[11, 0], [9, 1.5]], end: 'stop' },
  hitch: { pts: [[5.5, 0], [4.5, 0.5]], end: 'stop' },
  comeback: { pts: [[15, 0], [12.5, -3]], end: 'stop' },
  post: { pts: [[11, 0], [40, 16]], end: 'continue' },
  corner: { pts: [[10, 0], [26, -14]], end: 'continue' },
  flat: { pts: [[1.5, -3], [3, -14]], end: 'continue' },
  wheel: { pts: [[1, -5], [4, -10], [35, -11]], end: 'continue' },
  drag: { pts: [[2.5, 2], [4, 30]], end: 'continue' },
  swing: { pts: [[-1, -5], [2, -12]], end: 'continue' },
  screen: { pts: [[-1.5, -4], [-1.5, -6.5]], end: 'stop' },
  bubble: { pts: [[-1, -3], [0, -6]], end: 'stop' },
  checkdown: { pts: [[2, -2], [4, -4]], end: 'stop' },
  shortIn: { pts: [[5, 0], [5.5, 12]], end: 'continue' },
  deepCross: { pts: [[14, 3], [20, 30]], end: 'continue' },
};

export interface FormationDef {
  name: string;
  qb: [number, number];
  slots: Partial<Record<Slot, [number, number]>>;
  underCenter: boolean;
}

export const FORMATIONS: Record<string, FormationDef> = {
  shotgun: {
    name: 'Shotgun', qb: [-5, 0], underCenter: false,
    slots: { RB: [-5, 2], X: [-0.8, -22], Z: [-0.8, 21], SLOT: [-1.2, -13], TE: [-0.8, 6] },
  },
  singleback: {
    name: 'Singleback', qb: [-1.2, 0], underCenter: true,
    slots: { RB: [-6.5, 0], X: [-0.8, -21], Z: [-0.8, 20], SLOT: [-1.2, 13], TE: [-0.8, -6] },
  },
  iform: {
    name: 'I-Form', qb: [-1.2, 0], underCenter: true,
    slots: { FB: [-4, 0], RB: [-7, 0], X: [-0.8, -21], Z: [-0.8, 20], TE: [-0.8, 6] },
  },
  trips: {
    name: 'Trips', qb: [-5, 0], underCenter: false,
    slots: { RB: [-5, -2], X: [-0.8, -22], Z: [-0.8, 22], SLOT: [-1.2, 16], TE: [-0.8, 7.5] },
  },
  empty: {
    name: 'Empty', qb: [-5, 0], underCenter: false,
    slots: { X: [-0.8, -22], SLOT2: [-1.2, -14], Z: [-0.8, 22], SLOT: [-1.2, 15], TE: [-0.8, 7] },
  },
  pistol: {
    name: 'Pistol', qb: [-4, 0], underCenter: false,
    slots: { RB: [-7, 0], X: [-0.8, -21], Z: [-0.8, 20], SLOT: [-1.2, -12], TE: [-0.8, 6] },
  },
  jumbo: {
    name: 'Jumbo', qb: [-1.2, 0], underCenter: true,
    slots: { FB: [-4, 0], RB: [-7, 0], TE: [-0.8, 6], TE2: [-0.8, -6], X: [-0.8, 15] },
  },
};

export type PlayCategory = 'short' | 'medium' | 'deep' | 'screen' | 'pa' | 'run' | 'special';

export interface RunDef {
  carrier: 'RB' | 'QB';
  path: [number, number][]; // relative to the ball, the carrier aims through these
  mesh: number; // seconds until the hand-off
  pitch?: boolean;
  qbFake?: [number, number]; // QB drift point for the handoff
}

export interface PlayDef {
  id: string;
  name: string;
  cat: PlayCategory;
  formation: string;
  routes: Partial<Record<Slot, string | 'block'>>;
  run?: RunDef;
  fake?: boolean; // play-action fake
  drop: number; // QB drop depth from LOS
  rollout?: number; // QB rolls toward this y offset (+ = bottom)
  screenRelease?: boolean;
  risk: 1 | 2 | 3;
  desc: string;
}

export const PLAYS: PlayDef[] = [
  // Short passes
  { id: 'slants', name: 'Slants', cat: 'short', formation: 'shotgun', drop: 6.5, risk: 1,
    routes: { X: 'slant', Z: 'slant', SLOT: 'slant', TE: 'hitch', RB: 'block' }, desc: 'Three quick slants. Hit the first window.' },
  { id: 'quickouts', name: 'Quick Outs', cat: 'short', formation: 'shotgun', drop: 6.5, risk: 1,
    routes: { X: 'quickOut', Z: 'quickOut', SLOT: 'hitch', TE: 'flat', RB: 'swing' }, desc: 'Outs to the sidelines. Great for stopping the clock.' },
  { id: 'curlflat', name: 'Curl Flat', cat: 'short', formation: 'singleback', drop: 6.5, risk: 1,
    routes: { X: 'curl', Z: 'curl', SLOT: 'flat', TE: 'flat', RB: 'block' }, desc: 'Curls outside with flats underneath. Beats soft zone.' },
  { id: 'mesh', name: 'Mesh', cat: 'short', formation: 'shotgun', drop: 6.5, risk: 1,
    routes: { X: 'go', Z: 'dig', SLOT: 'drag', TE: 'drag', RB: 'flat' }, desc: 'Crossing drags rub off man coverage.' },
  { id: 'hitches', name: 'Hitches', cat: 'short', formation: 'empty', drop: 6, risk: 1,
    routes: { X: 'hitch', Z: 'hitch', SLOT: 'shortIn', SLOT2: 'hitch', TE: 'checkdown' }, desc: 'Five quick options from an empty set.' },
  // Medium
  { id: 'smash', name: 'Smash', cat: 'medium', formation: 'shotgun', drop: 7, risk: 2,
    routes: { X: 'hitch', SLOT: 'corner', Z: 'hitch', TE: 'seam', RB: 'block' }, desc: 'Corner over a hitch. Stresses Cover 2.' },
  { id: 'flood', name: 'Flood', cat: 'medium', formation: 'singleback', drop: 7, rollout: 9, risk: 2,
    routes: { Z: 'go', SLOT: 'out', TE: 'flat', X: 'dig', RB: 'block' }, desc: 'Three levels to the right sideline on a rollout.' },
  { id: 'digs', name: 'Dig Combo', cat: 'medium', formation: 'singleback', drop: 7.5, risk: 2,
    routes: { X: 'dig', Z: 'comeback', SLOT: 'dig', TE: 'curl', RB: 'flat' }, desc: 'Two in-breakers at 12 yards.' },
  { id: 'comebacks', name: 'Comebacks', cat: 'medium', formation: 'pistol', drop: 7.5, risk: 2,
    routes: { X: 'comeback', Z: 'comeback', SLOT: 'curl', TE: 'seam', RB: 'block' }, desc: 'Receivers sell deep then come back to the ball.' },
  { id: 'tripsout', name: 'Trips Outs', cat: 'medium', formation: 'trips', drop: 7, risk: 2,
    routes: { Z: 'out', SLOT: 'seam', TE: 'quickOut', X: 'dig', RB: 'checkdown' }, desc: 'Trips side floods the boundary.' },
  // Deep
  { id: 'fourverts', name: 'Four Verticals', cat: 'deep', formation: 'shotgun', drop: 7.5, risk: 3,
    routes: { X: 'go', Z: 'go', SLOT: 'seam', TE: 'seam', RB: 'checkdown' }, desc: 'Everyone goes deep. Find the seam.' },
  { id: 'postcorner', name: 'Post Corner', cat: 'deep', formation: 'singleback', drop: 8, risk: 3,
    routes: { X: 'post', Z: 'corner', SLOT: 'dig', TE: 'block', RB: 'block' }, desc: 'Max protection for a deep post and corner.' },
  { id: 'deepshot', name: 'Deep Shot', cat: 'deep', formation: 'iform', drop: 8, risk: 3,
    routes: { X: 'go', Z: 'post', TE: 'block', FB: 'block', RB: 'checkdown' }, desc: 'Seven-man protection, two deep shots.' },
  { id: 'deepcross', name: 'Deep Cross', cat: 'deep', formation: 'trips', drop: 8, risk: 3,
    routes: { X: 'post', Z: 'go', SLOT: 'deepCross', TE: 'shortIn', RB: 'block' }, desc: 'A deep crosser underneath a post.' },
  { id: 'hailmary', name: 'Hail Mary', cat: 'special', formation: 'empty', drop: 9, risk: 3,
    routes: { X: 'go', Z: 'go', SLOT: 'go', SLOT2: 'go', TE: 'seam' }, desc: 'Last-second heave to the end zone.' },
  // Screens
  { id: 'rbscreen', name: 'RB Screen', cat: 'screen', formation: 'shotgun', drop: 7, screenRelease: true, risk: 1,
    routes: { RB: 'screen', X: 'go', Z: 'go', SLOT: 'go', TE: 'block' }, desc: 'Let the rush in, dump it to the back with blockers.' },
  { id: 'bubble', name: 'Bubble Screen', cat: 'screen', formation: 'trips', drop: 5.5, risk: 1,
    routes: { SLOT: 'bubble', Z: 'block', TE: 'block', X: 'go', RB: 'block' }, desc: 'Quick throw to the slot behind a wall of blockers.' },
  // Play action
  { id: 'paboot', name: 'PA Boot', cat: 'pa', formation: 'singleback', drop: 7, rollout: 10, fake: true, risk: 2,
    routes: { TE: 'drag', Z: 'corner', X: 'dig', SLOT: 'flat', RB: 'block' },
    run: { carrier: 'RB', path: [[1, -3]], mesh: 0.55, qbFake: [-3, -1] }, desc: 'Fake the run, bootleg right with a crosser.' },
  { id: 'papost', name: 'PA Deep Post', cat: 'pa', formation: 'iform', drop: 8.5, fake: true, risk: 3,
    routes: { X: 'post', Z: 'go', TE: 'block', FB: 'flat', RB: 'block' },
    run: { carrier: 'RB', path: [[1, 2]], mesh: 0.6, qbFake: [-3.5, 0.8] }, desc: 'Sell the run, then go over the top.' },
  { id: 'pacross', name: 'PA Crossers', cat: 'pa', formation: 'pistol', drop: 8, fake: true, risk: 2,
    routes: { X: 'deepCross', Z: 'dig', SLOT: 'drag', TE: 'seam', RB: 'block' },
    run: { carrier: 'RB', path: [[1, -2]], mesh: 0.55, qbFake: [-5, -0.8] }, desc: 'Linebackers bite, crossers run behind them.' },
  // Runs
  { id: 'insidezone', name: 'Inside Zone', cat: 'run', formation: 'singleback', drop: 0, risk: 1,
    routes: { X: 'block', Z: 'block', SLOT: 'block', TE: 'block' },
    run: { carrier: 'RB', path: [[-2.5, -1], [2, -1.5], [8, -1.5]], mesh: 0.55 }, desc: 'Downhill between the tackles. Find the crease.' },
  { id: 'outsidezone', name: 'Outside Zone', cat: 'run', formation: 'shotgun', drop: 0, risk: 2,
    routes: { X: 'block', Z: 'block', SLOT: 'block', TE: 'block' },
    run: { carrier: 'RB', path: [[-4.5, 5], [-2, 9], [3, 12]], mesh: 0.35 }, desc: 'Stretch to the edge, cut upfield when it opens.' },
  { id: 'power', name: 'Power O', cat: 'run', formation: 'iform', drop: 0, risk: 1,
    routes: { X: 'block', Z: 'block', TE: 'block', FB: 'block' },
    run: { carrier: 'RB', path: [[-4, -1.5], [1, -4.5], [7, -5]], mesh: 0.6 }, desc: 'Fullback leads off left tackle.' },
  { id: 'toss', name: 'Toss Sweep', cat: 'run', formation: 'iform', drop: 0, risk: 2,
    routes: { X: 'block', Z: 'block', TE: 'block', FB: 'block' },
    run: { carrier: 'RB', path: [[-5.5, 5], [-2.5, 9.5], [3, 11.5]], mesh: 0.3, pitch: true }, desc: 'Pitch it outside and race the defense to the corner.' },
  { id: 'counter', name: 'Cutback', cat: 'run', formation: 'singleback', drop: 0, risk: 2,
    routes: { X: 'block', Z: 'block', SLOT: 'block', TE: 'block' },
    run: { carrier: 'RB', path: [[-3.5, 1.5], [-1, -1.2], [3, -3], [8, -3]], mesh: 0.45 }, desc: 'Start right, then cut back against the flow.' },
  { id: 'draw', name: 'HB Draw', cat: 'run', formation: 'shotgun', drop: 0, risk: 1,
    routes: { X: 'go', Z: 'go', SLOT: 'go', TE: 'block' },
    run: { carrier: 'RB', path: [[-4.5, 1], [-1, 0.8], [6, 0.5]], mesh: 0.75, qbFake: [-5.5, 0.3] }, desc: 'Show pass, then hand it off up the middle.' },
  { id: 'sneak', name: 'QB Sneak', cat: 'run', formation: 'jumbo', drop: 0, risk: 1,
    routes: { X: 'block', TE: 'block', TE2: 'block', FB: 'block', RB: 'block' },
    run: { carrier: 'QB', path: [[1, 0.3], [4, 0.3]], mesh: 0 }, desc: 'Short yardage push behind the center.' },
  { id: 'goalline', name: 'Goal Line Dive', cat: 'run', formation: 'jumbo', drop: 0, risk: 1,
    routes: { X: 'block', TE: 'block', TE2: 'block', FB: 'block' },
    run: { carrier: 'RB', path: [[-3, 2], [1, 2.2], [5, 2.2]], mesh: 0.5 }, desc: 'Heavy set, power behind the right guard.' },
  // Specials
  { id: 'spike', name: 'Spike', cat: 'special', formation: 'shotgun', drop: 0, risk: 1, routes: {}, desc: 'Stop the clock. Costs a down.' },
  { id: 'kneel', name: 'Kneel', cat: 'special', formation: 'singleback', drop: 0, risk: 1, routes: {}, desc: 'Take a knee and run the clock.' },
];

export const PLAY_BY_ID: Record<string, PlayDef> = Object.fromEntries(PLAYS.map((p) => [p.id, p]));

// ---------------- Defense ----------------

export type Coverage = 'cover0' | 'cover1' | 'cover2' | 'cover3' | 'cover4' | 'man2';

export interface DefCall {
  id: string;
  name: string;
  personnel: { DL: number; LB: number; DB: number };
  coverage: Coverage;
  blitz: number; // extra rushers beyond the DL
  box: boolean; // safeties play down, run first
  desc: string;
  vs: 'run' | 'pass' | 'balanced' | 'deep';
}

export const DEF_CALLS: DefCall[] = [
  { id: 'c2', name: '4-3 Cover 2', personnel: { DL: 4, LB: 3, DB: 4 }, coverage: 'cover2', blitz: 0, box: false, vs: 'balanced', desc: 'Two deep safeties, five underneath zones.' },
  { id: 'c3', name: '4-3 Cover 3', personnel: { DL: 4, LB: 3, DB: 4 }, coverage: 'cover3', blitz: 0, box: false, vs: 'balanced', desc: 'Three deep thirds. Solid against everything.' },
  { id: 'c1', name: 'Nickel Cover 1', personnel: { DL: 4, LB: 2, DB: 5 }, coverage: 'cover1', blitz: 0, box: false, vs: 'pass', desc: 'Man-to-man with a deep free safety.' },
  { id: 'm2', name: 'Nickel 2-Man', personnel: { DL: 4, LB: 2, DB: 5 }, coverage: 'man2', blitz: 0, box: false, vs: 'pass', desc: 'Tight man underneath, two safeties over the top.' },
  { id: 'c4', name: 'Dime Prevent', personnel: { DL: 4, LB: 1, DB: 6 }, coverage: 'cover4', blitz: 0, box: false, vs: 'deep', desc: 'Keep everything in front. Gives up short stuff.' },
  { id: 'zblitz', name: 'Zone Blitz', personnel: { DL: 4, LB: 3, DB: 4 }, coverage: 'cover3', blitz: 1, box: false, vs: 'pass', desc: 'Five rushers with zone behind. Pressure with safety.' },
  { id: 'c0', name: 'Cover 0 Blitz', personnel: { DL: 4, LB: 3, DB: 4 }, coverage: 'cover0', blitz: 3, box: false, vs: 'pass', desc: 'Send seven, man everywhere. Sack or bust.' },
  { id: 'runstuff', name: '4-3 Run Stuff', personnel: { DL: 4, LB: 3, DB: 4 }, coverage: 'cover1', blitz: 1, box: true, vs: 'run', desc: 'Eight in the box to stop the run.' },
  { id: 'goal', name: 'Goal Line', personnel: { DL: 5, LB: 3, DB: 3 }, coverage: 'cover0', blitz: 2, box: true, vs: 'run', desc: 'Heavy front for short yardage.' },
  { id: 'c34', name: '3-4 Cover 3', personnel: { DL: 3, LB: 4, DB: 4 }, coverage: 'cover3', blitz: 1, box: false, vs: 'balanced', desc: 'Four linebackers, one of them rushes.' },
];
export const DEF_BY_ID: Record<string, DefCall> = Object.fromEntries(DEF_CALLS.map((d) => [d.id, d]));
