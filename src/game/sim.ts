// Real-time on-field simulation of a single play. Offense always attacks +x in
// "offense coordinates": x = yards from the offense's own goal line, y = yards
// from the top sideline (0..53.33). Rendering flips this as needed.

import { Rng, clamp } from '../core/rng';
import type { Appearance, Pos, Ratings, StatLine } from '../core/types';
import { DEF_BY_ID, FORMATIONS, OL_SLOTS, ROUTES, type DefCall, type PlayDef, type Slot } from './playbook';

export const FIELD_W = 53.33;
export const MID_Y = FIELD_W / 2;
export const HASH_TOP = 23.58;
export const HASH_BOT = 29.75;

export interface SimPlayer {
  pid: number;
  pos: Pos;
  num: number;
  name: string;
  r: Ratings;
  look: Appearance;
}

export interface Lineup {
  qb: SimPlayer[];
  rb: SimPlayer[];
  wr: SimPlayer[];
  te: SimPlayer[];
  ol: SimPlayer[];
  dl: SimPlayer[];
  lb: SimPlayer[];
  db: SimPlayer[];
  k: SimPlayer[];
}

export interface PlayInput {
  move: { x: number; y: number } | null;
  sprint: boolean;
  juke: boolean;
  dive: boolean;
  tuck: boolean;
  kneel: boolean;
  fairCatch: boolean;
  throwAt: { x: number; y: number } | null;
  /** Lateral lane changes requested this frame (swipes), in +y / -y units. */
  scoot: number;
}
export const NO_INPUT: PlayInput = { move: null, sprint: false, juke: false, dive: false, tuck: false, kneel: false, fairCatch: false, throwAt: null, scoot: 0 };

/** Real-time pace of live plays: below 1 plays out slower and more deliberately. */
export const PACE = 0.74;
/** Yards a single swipe scoots the user's player sideways. */
export const SCOOT_YDS = 2.6;

export interface AiSkill {
  off: number; // -1..1 adjustments to the offense's AI quality
  def: number;
}

export interface ScrimmageSetup {
  kind: 'scrimmage';
  los: number;
  ballY: number;
  toGo: number;
  down: number;
  play: PlayDef;
  defCall: DefCall;
  offense: Lineup;
  defense: Lineup;
  userControls: boolean;
  skill: AiSkill;
  weather: string;
  seed: number;
  twoPoint?: boolean;
  clockUrgent?: boolean; // AI QB should get out of bounds / hurry
}

export interface ReturnSetup {
  kind: 'kickoff' | 'punt';
  kickFrom: number; // in receiving-team coordinates: where the ball is kicked from
  receiving: Lineup;
  kicking: Lineup;
  userControls: boolean; // user controls the returner
  skill: AiSkill;
  weather: string;
  seed: number;
  kickPower?: number; // 0..1 override from user's kick meter
  aimY?: number; // -1..1 lateral aim from the kick meter
  touchbackSpot: number;
}

export type SimSetup = ScrimmageSetup | ReturnSetup;

export type Mode =
  | 'idle' | 'qb' | 'route' | 'passblock' | 'runblock' | 'leadblock' | 'rush' | 'man' | 'zone'
  | 'pursue' | 'carry' | 'track' | 'returner' | 'coverage' | 'wall' | 'runpath' | 'down';

export type Anim = 'stand' | 'run' | 'throw' | 'down' | 'dive' | 'block' | 'celebrate' | 'kneel' | 'spike' | 'catch' | 'kick';

export interface Actor {
  i: number;
  side: 0 | 1; // 0 offense, 1 defense
  role: string;
  sp: SimPlayer;
  x: number;
  y: number;
  vx: number;
  vy: number;
  maxSpd: number;
  accel: number;
  mode: Mode;
  route: { pts: [number, number][]; idx: number; end: 'stop' | 'continue' } | null;
  runPath: [number, number][] | null;
  manTarget: number;
  zone: { x: number; y: number; deep: boolean; r: number } | null;
  engaged: number;
  stun: number;
  downT: number;
  tackleCd: number;
  facing: 1 | -1;
  /** Lateral target set by swipes for the user's player. */
  laneY: number | null;
  react: number;
  shedFrom: number;
  shedT: number;
  jukeT: number;
  jukeCd: number;
  jukeDir: number;
  stamina: number;
  anim: Anim;
  animT: number;
  hist: number[]; // ring buffer x,y pairs
  histI: number;
  readT: number; // time when this defender has read the play
  biteT: number; // play-action bite timer
  isReturner?: boolean;
  catchT: number;
  zoneJam: number;
  hx: number;
  hy: number;
  lunged: boolean;
  jukeGood: boolean;
}

export interface Ball {
  state: 'held' | 'air' | 'loose' | 'dead';
  holder: number;
  x: number;
  y: number;
  z: number;
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  peak: number;
  kind: 'pass' | 'pitch' | 'kick' | 'fumble';
  thrower: number;
  touched: Set<number>;
}

export interface SimEvent {
  t: number;
  type: string;
  text: string;
}

export type EndReason =
  | 'tackle' | 'oob' | 'td' | 'incomplete' | 'int' | 'sack' | 'safety' | 'fumble' | 'touchback' | 'kneel' | 'spike'
  | 'faircatch' | 'downed' | 'dive' | 'slide';

export interface SimOutcome {
  endX: number;
  endY: number;
  reason: EndReason;
  incomplete: boolean;
  outOfBounds: boolean;
  turnover: boolean;
  offTd: boolean;
  defTd: boolean;
  safety: boolean;
  touchback: boolean;
  elapsed: number;
  summary: string;
  big: string; // headline text for UI ("TOUCHDOWN!")
  passYds?: number;
  kickDist?: number;
}

type StatKey = keyof StatLine;

const OFF = 0;
const DEF = 1;

function dist(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function makeActor(i: number, side: 0 | 1, role: string, sp: SimPlayer, x: number, y: number): Actor {
  const r = sp.r;
  return {
    i, side, role, sp, x, y, vx: 0, vy: 0,
    maxSpd: 6.1 + r.spd * 0.034,
    accel: 9 + r.acc * 0.08,
    mode: 'idle', route: null, runPath: null, manTarget: -1, zone: null,
    engaged: -1, stun: 0, downT: 0, tackleCd: 0, facing: side === OFF ? 1 : -1, laneY: null,
    react: 0.2, shedFrom: -1, shedT: 0, jukeT: 0, jukeCd: 0, jukeDir: 0, stamina: 1,
    anim: 'stand', animT: 0, hist: new Array(80).fill(0), histI: 0, readT: 0, biteT: 0, catchT: 0, zoneJam: 0, hx: x, hy: y, lunged: false, jukeGood: false,
  };
}

export class PlaySim {
  readonly setup: SimSetup;
  rng: Rng;
  actors: Actor[] = [];
  ball: Ball;
  t = 0;
  phase: 'presnap' | 'live' | 'over' = 'presnap';
  overT = 0;
  los: number;
  firstDownX: number;
  carrier = -1;
  qb = -1;
  stats = new Map<number, Partial<StatLine>>();
  events: SimEvent[] = [];
  outcome: SimOutcome | null = null;
  passThrown = false;
  handedOff = false;
  isRunPlay = false;
  isPassPlay = false;
  userActor = -1;
  catchFrom = -1; // x where the current carrier gained possession via catch
  carrierHow: 'rush' | 'catch' | 'return' | 'int' | 'qbrun' | 'none' = 'none';
  turnoverHappened = false;
  carrierDir = 1; // +1 for the offense, -1 for a defensive returner
  lastPasser = -1;
  lastTarget = -1;
  popups: { text: string; t: number; x: number; y: number }[] = [];
  aimAllowed = false;
  kickDist = 0;
  private sackCredit = -1;
  private screenTarget = -1;
  private userTucked = false;
  private qbDropX = 0;
  private qbDropY = 0;
  private faircatchCalled = false;
  private kickLanded = false;
  private endHold = 0;

  constructor(setup: SimSetup) {
    this.setup = setup;
    this.rng = new Rng(setup.seed);
    this.ball = { state: 'held', holder: -1, x: 0, y: 0, z: 1, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, t: 0, dur: 0, peak: 0, kind: 'pass', thrower: -1, touched: new Set() };
    if (setup.kind === 'scrimmage') {
      this.los = setup.los;
      this.firstDownX = setup.los + setup.toGo;
      this.buildScrimmage(setup);
    } else {
      this.los = setup.kickFrom;
      this.firstDownX = -999;
      this.buildReturn(setup);
    }
  }

  // ------------------------------------------------------------------ setup

  private add(side: 0 | 1, role: string, sp: SimPlayer | undefined, x: number, y: number): Actor | null {
    if (!sp) return null;
    const a = makeActor(this.actors.length, side, role, sp, x, clamp(y, 1, FIELD_W - 1));
    const skill = side === OFF ? this.setup.skill.off : this.setup.skill.def;
    a.maxSpd *= 1 + 0.025 * skill;
    a.react = clamp(0.24 - (a.sp.r.awr - 60) * 0.0035 - 0.06 * skill, 0.05, 0.45);
    if (this.setup.weather === 'snow') a.maxSpd *= 0.95;
    this.actors.push(a);
    for (let k = 0; k < a.hist.length; k += 2) {
      a.hist[k] = a.x;
      a.hist[k + 1] = a.y;
    }
    return a;
  }

  private buildScrimmage(s: ScrimmageSetup) {
    const play = s.play;
    const form = FORMATIONS[play.formation];
    const by = s.ballY;
    const L = s.offense;
    const los = s.los;
    // offensive line
    const olY = [-4.2, -2.1, 0, 2.1, 4.2];
    OL_SLOTS.forEach((slot, k) => {
      const a = this.add(OFF, slot, L.ol[k] ?? L.ol[L.ol.length - 1] ?? L.dl[0], los - 0.6, by + olY[k]);
      if (a) a.mode = 'passblock';
    });
    const qbA = this.add(OFF, 'QB', L.qb[0], los + form.qb[0], by + form.qb[1]);
    this.qb = qbA ? qbA.i : -1;
    const slotPlayer: Record<Slot, SimPlayer | undefined> = {
      QB: L.qb[0],
      RB: L.rb[0],
      FB: L.te[1] ?? L.rb[1] ?? L.te[0],
      X: L.wr[0],
      Z: L.wr[1],
      SLOT: L.wr[2] ?? L.te[1] ?? L.rb[1],
      SLOT2: L.wr[3] ?? L.rb[1] ?? L.te[1],
      TE: L.te[0] ?? L.wr[3],
      TE2: L.te[1] ?? L.ol[5] ?? L.rb[1],
    };
    for (const slot of Object.keys(form.slots) as Slot[]) {
      const p = form.slots[slot]!;
      const yy = clamp(by + p[1], 2.5, FIELD_W - 2.5);
      const a = this.add(OFF, slot, slotPlayer[slot], los + p[0], yy);
      if (!a) continue;
      const rname = play.routes[slot];
      if (rname && rname !== 'block' && ROUTES[rname]) {
        const def = ROUTES[rname];
        const inside = yy < by ? 1 : -1;
        a.route = { pts: def.pts.map(([fx, fi]) => [a.x + fx, a.y + fi * inside] as [number, number]), idx: 0, end: def.end };
        a.mode = 'route';
      } else {
        a.mode = play.run ? 'runblock' : 'passblock';
      }
    }
    const scr = this.actors.find((a) => a.side === OFF && (play.routes[a.role as Slot] === 'screen' || play.routes[a.role as Slot] === 'bubble'));
    if (scr) this.screenTarget = scr.i;
    this.isRunPlay = !!play.run && !play.fake;
    this.isPassPlay = !this.isRunPlay;
    if (play.run && !play.fake) for (const a of this.actors) if (a.side === OFF && (a.mode === 'passblock')) a.mode = 'runblock';
    // run carrier path
    if (play.run) {
      const carrierSlot = play.run.carrier;
      const c = this.actors.find((a) => a.side === OFF && a.role === carrierSlot);
      if (c) {
        c.runPath = play.run.path.map(([fx, fy]) => [los + fx, by + fy] as [number, number]);
        if (!play.fake || carrierSlot === 'RB') c.mode = 'runpath';
      }
    }
    // QB drop target
    if (qbA) {
      qbA.mode = 'qb';
      this.qbDropX = los - Math.max(play.drop, form.underCenter ? 1.5 : 5);
      this.qbDropY = by + (play.rollout ?? 0);
    }
    this.buildDefense(s);
    this.ball.holder = -1;
    this.ball.x = los;
    this.ball.y = by;
    this.ball.z = 0.3;
    if (s.userControls) this.userActor = this.qb;
  }

  private buildDefense(s: ScrimmageSetup) {
    const call = s.defCall ?? DEF_BY_ID.c3;
    const D = s.defense;
    const los = s.los;
    const by = s.ballY;
    const nDL = Math.min(call.personnel.DL, Math.max(1, D.dl.length));
    const dlY: number[] = nDL === 3 ? [-3.2, 0, 3.2] : nDL === 5 ? [-5.4, -2.6, 0, 2.6, 5.4] : [-4.8, -1.4, 1.4, 4.8];
    for (let k = 0; k < nDL; k++) {
      const a = this.add(DEF, 'DL', D.dl[k] ?? D.lb[3] ?? D.dl[0], los + 0.9, by + dlY[k]);
      if (a) a.mode = 'rush';
    }
    const nLB = call.personnel.LB;
    const nDB = call.personnel.DB;
    const lbs: Actor[] = [];
    const lbY = nLB === 1 ? [0] : nLB === 2 ? [-3, 3] : nLB === 3 ? [-5, 0, 5] : [-7, -2.5, 2.5, 7];
    for (let k = 0; k < nLB; k++) {
      const sp = D.lb[k] ?? D.db[5] ?? D.dl[4] ?? D.lb[0];
      const a = this.add(DEF, 'LB', sp, los + (call.box ? 3.5 : 4.8), by + lbY[k]);
      if (a) lbs.push(a);
    }
    const dbs: Actor[] = [];
    for (let k = 0; k < nDB; k++) {
      const sp = D.db[k] ?? D.lb[3] ?? D.db[0];
      const a = this.add(DEF, 'DB', sp, los + 7, by);
      if (a) dbs.push(a);
    }
    // eligible receivers sorted by threat (outside WRs first)
    const elig = this.actors.filter((a) => a.side === OFF && ['X', 'Z', 'SLOT', 'SLOT2', 'TE', 'TE2', 'RB', 'FB'].includes(a.role));
    const wr = elig.filter((a) => ['X', 'Z', 'SLOT', 'SLOT2'].includes(a.role)).sort((a, b) => Math.abs(b.y - by) - Math.abs(a.y - by));
    const others = elig.filter((a) => !['X', 'Z', 'SLOT', 'SLOT2'].includes(a.role) && a.mode === 'route');
    const blockers = elig.filter((a) => !['X', 'Z', 'SLOT', 'SLOT2'].includes(a.role) && a.mode !== 'route');
    // blitzers: LBs first (outside), then a DB if needed
    const rushers: Actor[] = [];
    const lbPool = [...lbs];
    for (let k = 0; k < call.blitz; k++) {
      const a = lbPool.length ? lbPool.splice(k % 2 === 0 ? 0 : lbPool.length - 1, 1)[0] : dbs.length > 3 ? dbs.splice(dbs.length - 1, 1)[0] : null;
      if (a) {
        a.mode = 'rush';
        a.x = los + 1.6;
        rushers.push(a);
      }
    }
    const remainingLB = lbs.filter((a) => a.mode !== 'rush');
    const cov = call.coverage;
    const man = cov === 'cover0' || cov === 'cover1' || cov === 'man2';
    const deepSafeties = cov === 'cover0' ? 0 : cov === 'cover1' ? 1 : cov === 'man2' || cov === 'cover2' ? 2 : cov === 'cover3' ? 1 : 2;
    // pick safeties: worst coverage DBs beyond the first corners
    const sortedDB = [...dbs].sort((a, b) => b.sp.r.cov - a.sp.r.cov);
    if (man) {
      const corners = sortedDB.slice(0, Math.max(0, sortedDB.length - deepSafeties));
      const safeties = sortedDB.slice(corners.length);
      const targets = [...wr, ...others];
      const defenders = [...corners, ...remainingLB.sort((a, b) => b.sp.r.cov - a.sp.r.cov)];
      const used = new Set<number>();
      for (const t of targets) {
        // prefer DBs for WRs, LBs for backs/TEs
        const isWR = ['X', 'Z', 'SLOT', 'SLOT2'].includes(t.role);
        let best: Actor | null = null;
        for (const d of defenders) {
          if (used.has(d.i)) continue;
          if (!best) best = d;
          if (isWR && d.role === 'DB' && best.role !== 'DB') best = d;
          if (!isWR && d.role === 'LB' && best.role !== 'LB') best = d;
        }
        if (!best) break;
        used.add(best.i);
        best.mode = 'man';
        best.manTarget = t.i;
        const press = cov === 'man2' || cov === 'cover0';
        best.x = los + (best.role === 'LB' ? 4 : press ? 1.5 : 4.5);
        best.y = t.y + (t.y < by ? 0.8 : -0.8);
      }
      // anyone left over: spy / robber zones / extra rush vs blockers
      const leftovers = defenders.filter((d) => !used.has(d.i));
      for (const d of leftovers) {
        d.mode = 'zone';
        d.zone = { x: los + 6, y: by + (d.y - by) * 0.4, deep: false, r: 7 };
        d.x = d.zone.x - 1.5;
      }
      safeties.forEach((sft, k) => {
        sft.mode = 'zone';
        const yy = deepSafeties === 1 ? by * 0.4 + MID_Y * 0.6 : k === 0 ? FIELD_W * 0.3 : FIELD_W * 0.7;
        sft.zone = { x: los + (call.box ? 9 : 15), y: yy, deep: true, r: deepSafeties === 1 ? 27 : 14.5 };
        sft.x = los + (call.box ? 8 : 12);
        sft.y = yy;
      });
      void blockers;
    } else {
      // zone coverage
      const zones: { x: number; y: number; deep: boolean; r: number }[] = [];
      const deepX = los + (cov === 'cover4' ? 17 : 15);
      if (cov === 'cover2') {
        zones.push({ x: deepX, y: FIELD_W * 0.25, deep: true, r: 14.5 }, { x: deepX, y: FIELD_W * 0.75, deep: true, r: 14.5 });
      } else if (cov === 'cover3') {
        zones.push({ x: deepX, y: FIELD_W * 0.17, deep: true, r: 10 }, { x: deepX + 1, y: MID_Y, deep: true, r: 13 }, { x: deepX, y: FIELD_W * 0.83, deep: true, r: 10 });
      } else {
        for (const f of [0.13, 0.38, 0.62, 0.87]) zones.push({ x: deepX, y: FIELD_W * f, deep: true, r: 8 });
      }
      const flatL = { x: los + 5, y: clamp(by - 15, 6, FIELD_W - 6), deep: false, r: 9 };
      const flatR = { x: los + 5, y: clamp(by + 15, 6, FIELD_W - 6), deep: false, r: 9 };
      const hookL = { x: los + 8, y: by - 6, deep: false, r: 7 };
      const hookR = { x: los + 8, y: by + 6, deep: false, r: 7 };
      const mid = { x: los + 7, y: by, deep: false, r: 7 };
      const under = cov === 'cover2' ? [flatL, flatR, hookL, hookR, mid] : cov === 'cover3' ? [flatL, flatR, hookL, hookR, mid] : [hookL, hookR, mid, flatL, flatR];
      // assign: fastest coverage DBs to deep zones, then nearest defenders to underneath zones
      const dbOrder = [...dbs].sort((a, b) => b.sp.r.spd + b.sp.r.cov - (a.sp.r.spd + a.sp.r.cov));
      const deepDefs = dbOrder.slice(0, Math.min(zones.length, dbOrder.length));
      const restDB = dbOrder.slice(deepDefs.length);
      deepDefs.forEach((d, k) => {
        d.mode = 'zone';
        d.zone = zones[k];
        d.x = cov === 'cover3' && k !== 1 ? los + 6.5 : los + 11;
        d.y = zones[k].y;
      });
      // pre-place remaining DBs near the flats so proximity assignment works
      restDB.forEach((d, k) => {
        d.y = k % 2 === 0 ? flatL.y : flatR.y;
        d.x = los + 5;
      });
      const pool = [...restDB, ...remainingLB];
      for (const z of under) {
        if (!pool.length) break;
        let bi = 0;
        let bd = 1e9;
        pool.forEach((d, k) => {
          const dd = dist(d.x, d.y, z.x, z.y);
          if (dd < bd) {
            bd = dd;
            bi = k;
          }
        });
        const d = pool.splice(bi, 1)[0];
        d.mode = 'zone';
        d.zone = { ...z };
      }
    }
    // cornerback alignment over the widest receivers so the picture looks right pre-snap
    for (const a of this.actors) {
      if (a.side === DEF && a.mode === 'zone' && a.zone && !a.zone.deep && a.role === 'DB') {
        const nearest = wr.reduce<Actor | null>((b, r) => (!b || Math.abs(r.y - a.zone!.y) < Math.abs(b.y - a.zone!.y) ? r : b), null);
        if (nearest) a.y = nearest.y + (nearest.y < by ? 1 : -1);
      }
      if (a.side === DEF && call.box && a.mode === 'zone' && a.zone && a.zone.deep) {
        a.x = Math.min(a.x, los + 9);
      }
    }
    for (const a of this.actors) {
      a.y = clamp(a.y, 1, FIELD_W - 1);
      for (let k = 0; k < a.hist.length; k += 2) {
        a.hist[k] = a.x;
        a.hist[k + 1] = a.y;
      }
    }
  }

  private buildReturn(s: ReturnSetup) {
    const R = s.receiving;
    const K = s.kicking;
    const kickX = s.kickFrom;
    const isPunt = s.kind === 'punt';
    const kicker = K.k[0] ?? K.db[0];
    const power = s.kickPower ?? clamp(0.82 + this.rng.normal(0, 0.06), 0.55, 1);
    const kr = kicker.r;
    let distK: number;
    let hang: number;
    if (isPunt) {
      distK = (34 + kr.kpw * 0.16) * (0.75 + power * 0.3) + this.rng.normal(0, 3.5);
      hang = 3.6 + distK * 0.015 + this.rng.range(-0.2, 0.3);
    } else {
      distK = (52 + kr.kpw * 0.14) * (0.72 + power * 0.32) + this.rng.normal(0, 3);
      hang = 3.4 + distK * 0.008 + this.rng.range(-0.1, 0.3);
    }
    if (this.setup.weather === 'wind') distK += this.rng.normal(0, 4);
    const puntFrom = isPunt ? kickX + 13 : kickX;
    const landX = puntFrom - distK;
    const landY = clamp(MID_Y + (s.aimY ?? 0) * 24 + this.rng.normal(0, s.aimY !== undefined ? 3 : isPunt ? 7 : 9), -4, FIELD_W + 4);
    this.kickDist = distK;
    // receiving team
    const rPool = [...R.rb, ...R.wr, ...R.db].sort((a, b) => b.r.spd + b.r.elu - (a.r.spd + a.r.elu));
    const returner = rPool[0];
    const ret = this.add(OFF, 'KR', returner, clamp(landX - 3, -8, 100), clamp(landY, 4, FIELD_W - 4));
    if (ret) {
      ret.mode = 'returner';
      ret.isReturner = true;
      if (s.userControls) this.userActor = ret.i;
    }
    const blockers = [...R.ol.slice(0, 3), ...R.te.slice(0, 2), ...R.lb.slice(0, 3), ...R.db.slice(1, 3), ...R.rb.slice(1), ...R.wr.slice(1)].filter((p) => p && p !== returner).slice(0, 10);
    blockers.forEach((sp, k) => {
      const front = k < 5;
      const x = isPunt ? (front ? kickX - 1 : kickX - 8 - (k - 5) * 2) : front ? kickX - 12 : kickX - 28;
      const y = front ? 8 + k * 9.5 : 10 + (k - 5) * 8.5;
      const a = this.add(OFF, 'BLK', sp, x, y);
      if (a) a.mode = 'wall';
    });
    // kicking team
    const kA = this.add(DEF, 'K', kicker, puntFrom + (isPunt ? 0 : 2), MID_Y);
    if (kA) {
      kA.mode = 'coverage';
      kA.anim = 'kick';
      kA.maxSpd *= 0.85;
    }
    const cov = [...K.lb, ...K.db, ...K.te, ...K.rb, ...K.wr, ...K.dl].filter(Boolean).slice(0, 10);
    cov.forEach((sp, k) => {
      const y = 3 + k * 5.2;
      const a = this.add(DEF, 'COV', sp, isPunt ? kickX + 0.8 : kickX + 0.5, y);
      if (a) {
        a.mode = 'coverage';
        a.zone = { x: 0, y, deep: false, r: 0 };
        if (isPunt) a.readT = k === 0 || k === 9 ? 0 : 0.9; // gunners release instantly
      }
    });
    // ball in the air immediately
    this.ball = {
      state: 'air', holder: -1, x: puntFrom, y: MID_Y, z: 0.5, fx: puntFrom, fy: MID_Y, fz: 0.5,
      tx: landX, ty: landY, t: 0, dur: hang, peak: isPunt ? 16 : 18, kind: 'kick', thrower: kA ? kA.i : -1, touched: new Set(),
    };
    this.phase = 'live';
    this.carrierDir = 1;
  }

  // ------------------------------------------------------------------ helpers

  stat(pid: number, key: StatKey, v: number) {
    const s = this.stats.get(pid) ?? {};
    if (key === 'pLng' || key === 'rLng' || key === 'recLng' || key === 'fgLng') s[key] = Math.max(s[key] ?? 0, v);
    else s[key] = (s[key] ?? 0) + v;
    this.stats.set(pid, s);
  }

  private event(type: string, text: string) {
    this.events.push({ t: this.t, type, text });
  }

  popup(text: string, x: number, y: number) {
    this.popups.push({ text, t: this.t, x, y });
  }

  get scrim(): ScrimmageSetup | null {
    return this.setup.kind === 'scrimmage' ? this.setup : null;
  }

  private carrierActor(): Actor | null {
    return this.carrier >= 0 ? this.actors[this.carrier] : null;
  }

  canThrow(): boolean {
    if (this.phase !== 'live' || !this.scrim) return false;
    if (this.passThrown || this.handedOff) return false;
    const q = this.actors[this.qb];
    if (!q || this.ball.state !== 'held' || this.ball.holder !== q.i) return false;
    if (this.scrim.play.run && !this.scrim.play.fake) return false;
    return q.x <= this.los + 0.3 && q.mode !== 'down';
  }

  maxThrow(): number {
    const q = this.actors[this.qb];
    return q ? 30 + q.sp.r.thp * 0.38 : 50;
  }

  // ------------------------------------------------------------------ snap

  snap() {
    if (this.phase !== 'presnap' || !this.scrim) return;
    const s = this.scrim;
    this.phase = 'live';
    const q = this.actors[this.qb];
    if (s.play.id === 'kneel' && q) {
      this.ball.state = 'held';
      this.ball.holder = q.i;
      q.anim = 'kneel';
      this.end({ reason: 'kneel', endX: this.los - 1, endY: q.y }, 'Kneel down', '');
      this.outcome!.elapsed = 1.5;
      return;
    }
    if (s.play.id === 'spike' && q) {
      q.anim = 'spike';
      this.stat(q.sp.pid, 'pAtt', 1);
      this.end({ reason: 'spike', endX: this.los, endY: q.y }, 'Spiked to stop the clock', '');
      this.outcome!.incomplete = true;
      this.outcome!.elapsed = 1;
      return;
    }
    if (q) {
      this.ball.state = 'held';
      this.ball.holder = q.i;
    }
    for (const a of this.actors) {
      a.readT = a.side === DEF ? a.react + (a.role === 'LB' ? 0.1 : 0) : 0;
      if (a.side === DEF && s.play.fake && (a.role === 'LB' || (a.role === 'DB' && s.defCall.box))) {
        const bite = clamp(0.95 - a.sp.r.awr * 0.007 + this.rng.range(-0.15, 0.15), 0, 0.8);
        a.biteT = bite;
      }
      // press coverage jam
      if (a.side === OFF && a.mode === 'route') {
        const presser = this.actors.find((d) => d.side === DEF && d.mode === 'man' && d.manTarget === a.i && dist(d.x, d.y, a.x, a.y) < 2.2);
        if (presser) {
          const adv = (presser.sp.r.cov + presser.sp.r.str - a.sp.r.rte - a.sp.r.str) / 100;
          a.zoneJam = clamp(0.15 + adv * 0.6 + this.rng.range(-0.1, 0.1), 0, 0.5);
        }
      }
    }
    this.aimAllowed = !s.play.run || !!s.play.fake;
    // draws sell pass first: second-level defenders are slow to read the run
    if (s.play.id === 'draw') for (const a of this.actors) if (a.side === DEF && a.role !== 'DL') a.readT += 0.7;
    if (s.play.run && s.play.run.carrier === 'QB' && q) {
      q.mode = 'carry';
      q.runPath = s.play.run.path.map(([fx, fy]) => [this.los + fx, s.ballY + fy] as [number, number]);
      this.carrier = q.i;
      this.carrierHow = 'qbrun';
      this.handedOff = true;
      this.stat(q.sp.pid, 'rAtt', 1);
    }
  }

  // ------------------------------------------------------------------ main step

  step(dt: number, input: PlayInput = NO_INPUT) {
    if (this.phase === 'presnap') {
      for (const a of this.actors) a.animT += dt;
      return;
    }
    if (this.phase === 'over') {
      this.overT += dt;
      for (const a of this.actors) {
        a.animT += dt;
        a.vx *= 0.85;
        a.vy *= 0.85;
        a.x += a.vx * dt;
        a.y += a.vy * dt;
      }
      this.updateBallDead(dt);
      return;
    }
    this.t += dt;
    const ball = this.ball;
    // record history (for man coverage reaction lag)
    for (const a of this.actors) {
      a.hist[a.histI] = a.x;
      a.hist[a.histI + 1] = a.y;
      a.histI = (a.histI + 2) % a.hist.length;
      a.animT += dt;
      if (a.stun > 0) a.stun -= dt;
      if (a.tackleCd > 0) a.tackleCd -= dt;
      if (a.jukeT > 0) a.jukeT -= dt;
      if (a.jukeCd > 0) a.jukeCd -= dt;
      if (a.downT > 0) {
        a.downT -= dt;
        if (a.downT <= 0 && a.mode === 'down') {
          a.mode = a.side === DEF ? 'pursue' : 'leadblock';
          a.lunged = false;
        }
      }
    }
    this.setUserMove(input);
    this.handleUserInput(dt, input);
    this.handleHandoff();
    for (const a of this.actors) this.think(a, dt);
    this.resolveEngagements(dt);
    for (const a of this.actors) this.integrate(a, dt);
    this.separate();
    this.updateBall(dt);
    if ((this.phase as string) === 'over') return;
    this.checkCarrier(dt);
    if ((this.phase as string) === 'over') return;
    // pass play that never throws: cap play length
    if (this.t > 14 && ball.state === 'held') {
      const c = this.carrierActor() ?? this.actors[ball.holder];
      if (c) this.tackleCarrier(c, null);
    }
  }

  // ------------------------------------------------------------------ input

  private handleUserInput(dt: number, inp: PlayInput) {
    if (this.userActor < 0) return;
    const u = this.actors[this.userActor];
    const s = this.scrim;
    if (inp.scoot) u.laneY = clamp((u.laneY ?? u.y) + inp.scoot * SCOOT_YDS, 0.8, FIELD_W - 0.8);
    // QB pre-throw
    if (s && u.i === this.qb && this.ball.holder === u.i && u.mode === 'qb') {
      if (inp.throwAt && this.canThrow()) {
        this.throwBall(u, inp.throwAt.x, inp.throwAt.y, true);
        return;
      }
      if (inp.tuck || (inp.move && Math.abs(inp.move.x) + Math.abs(inp.move.y) > 0.2)) {
        this.userTucked = this.userTucked || inp.tuck;
      }
      if (inp.dive && u.x < this.los) {
        // throw it away / slide: treat as QB slide giving up
      }
    }
    // a user-controlled returner chooses touchback / fair catch
    if (u.isReturner) {
      if (inp.fairCatch && this.ball.state === 'air' && this.setup.kind === 'punt') {
        this.faircatchCalled = true;
        this.popup('FAIR CATCH', u.x, u.y - 2);
      }
      if (inp.kneel && this.carrier === u.i && u.x <= 0.5) {
        this.end({ reason: 'touchback', endX: -1, endY: u.y }, 'Touchback', 'TOUCHBACK');
        return;
      }
    }
    // control the current user carrier
    const c = this.carrierActor();
    if (c && c.side === OFF && c.i === this.userActor) {
      if (inp.dive) {
        if (c.i === this.qb && c.x > this.los) {
          c.anim = 'dive';
          this.end({ reason: 'slide', endX: c.x, endY: c.y }, 'QB slides', '');
        } else {
          c.anim = 'dive';
          const fwd = clamp(1.2 + c.sp.r.str * 0.006, 0, 2);
          this.end({ reason: 'dive', endX: c.x + fwd, endY: c.y }, 'Dives forward', '');
        }
        return;
      }
      if (inp.juke && c.jukeCd <= 0) {
        const near = this.nearestDefender(c);
        this.startJuke(c, inp.move && Math.abs(inp.move.y) > 0.2 ? Math.sign(inp.move.y) : near ? (near.y > c.y ? -1 : 1) : 1);
        c.jukeCd = 0.9;
        c.stamina = Math.max(0, c.stamina - 0.12);
      }
    }
  }

  private startJuke(c: Actor, dirY: number) {
    c.jukeT = 0.32;
    c.jukeDir = dirY;
    const skill = c.side === OFF ? this.setup.skill.off : this.setup.skill.def;
    c.jukeGood = this.rng.chance(clamp(0.45 + (c.sp.r.elu - 60) * 0.008 + (c.sp.r.acc - 70) * 0.004 + skill * 0.05, 0.2, 0.9));
  }

  private userMove = { x: 0, y: 0, active: false, sprint: false };

  /** Called every frame by the controller with the current analog direction. */
  setUserMove(inp: PlayInput) {
    this.userMove.active = !!inp.move;
    this.userMove.x = inp.move?.x ?? 0;
    this.userMove.y = inp.move?.y ?? 0;
    this.userMove.sprint = inp.sprint;
  }

  // ------------------------------------------------------------------ handoff / run start

  private handleHandoff() {
    const s = this.scrim;
    if (!s || !s.play.run || this.handedOff || this.passThrown) return;
    const run = s.play.run;
    const q = this.actors[this.qb];
    const rb = this.actors.find((a) => a.side === OFF && a.role === run.carrier);
    if (!q || !rb || this.ball.holder !== q.i) return;
    if (run.carrier === 'QB') return;
    if (this.t < run.mesh) return;
    if (run.pitch) {
      if (!this.handedOff && this.t >= run.mesh) {
        this.handedOff = true;
        const leadT = 0.45;
        this.ball = { ...this.ball, state: 'air', kind: 'pitch', fx: q.x, fy: q.y, fz: 1.4, tx: rb.x + rb.vx * leadT, ty: rb.y + rb.vy * leadT, t: 0, dur: leadT, peak: 0.6, thrower: q.i, touched: new Set() };
        this.stat(rb.sp.pid, 'rAtt', 1);
        this.carrierHow = 'rush';
      }
      return;
    }
    const d = dist(q.x, q.y, rb.x, rb.y);
    if (d < 2.6 || this.t > run.mesh + 0.45) {
      this.handedOff = true;
      if (s.play.fake) {
        // play action: keep the ball, RB carries out the fake as a blocker
        rb.mode = 'passblock';
        rb.runPath = null;
        this.event('fake', 'Play action fake');
        return;
      }
      this.giveBall(rb, 'rush');
      this.stat(rb.sp.pid, 'rAtt', 1);
      if (this.setup.kind === 'scrimmage' && this.setup.userControls) this.userActor = rb.i;
      q.mode = 'idle';
      q.runPath = null;
    }
  }

  private giveBall(a: Actor, how: PlaySim['carrierHow']) {
    this.ball.state = 'held';
    this.ball.holder = a.i;
    this.carrier = a.i;
    this.carrierHow = how;
    a.laneY = null;
    a.mode = 'carry';
    a.anim = 'run';
    this.carrierDir = a.side === OFF ? 1 : -1;
    // everyone transitions
    for (const o of this.actors) {
      if (o.i === a.i) continue;
      if (o.side === a.side) {
        if (o.mode === 'route' || o.mode === 'track' || o.mode === 'idle' || o.mode === 'wall' || o.mode === 'passblock' || o.mode === 'man' || o.mode === 'zone' || o.mode === 'pursue' || o.mode === 'rush' || o.mode === 'qb' || o.mode === 'runpath') {
          if (o.engaged < 0) o.mode = 'leadblock';
        }
      } else if (o.mode !== 'down') {
        if (o.engaged < 0) o.mode = 'pursue';
        o.readT = Math.max(o.readT, this.t + (how === 'rush' ? o.react * 0.6 : o.react));
      }
    }
  }

  // ------------------------------------------------------------------ throwing

  throwBall(q: Actor, tx: number, ty: number, user: boolean) {
    const s = this.scrim!;
    let dx = tx - q.x;
    let dy = ty - q.y;
    let d = Math.sqrt(dx * dx + dy * dy);
    const maxD = this.maxThrow();
    if (d > maxD) {
      dx *= maxD / d;
      dy *= maxD / d;
      d = maxD;
    }
    if (d < 1) return;
    const r = q.sp.r;
    // accuracy
    const nearest = this.nearestDefender(q);
    const pressure = nearest && dist(nearest.x, nearest.y, q.x, q.y) < 2.6 && nearest.engaged < 0 ? 1.6 : 1;
    const moving = Math.sqrt(q.vx * q.vx + q.vy * q.vy) > 3 ? 1.35 : 1;
    const wx = s.weather === 'wind' ? 1.25 : s.weather === 'rain' ? 1.15 : 1;
    const sigma = (0.25 + d * 0.026) * (1.55 - r.tha / 100) * pressure * moving * wx;
    const ex = this.rng.normal(0, sigma);
    const ey = this.rng.normal(0, sigma);
    const fx = q.x + dx + ex;
    const fy = q.y + dy + ey;
    const speed = 15 + r.thp * 0.1;
    const dur = 0.22 + d / speed;
    this.ball = {
      state: 'air', holder: -1, x: q.x, y: q.y, z: 2, fx: q.x, fy: q.y, fz: 2, tx: fx, ty: fy,
      t: 0, dur, peak: 0.4 + d * 0.085, kind: 'pass', thrower: q.i, touched: new Set(),
    };
    this.passThrown = true;
    this.lastPasser = q.i;
    q.anim = 'throw';
    q.animT = 0;
    q.mode = 'idle';
    q.facing = fx >= q.x ? 1 : -1;
    this.stat(q.sp.pid, 'pAtt', 1);
    // intended receiver: the eligible receiver projected closest to the landing point
    let best: Actor | null = null;
    let bd = 1e9;
    for (const a of this.actors) {
      if (a.side !== OFF || !this.isEligible(a)) continue;
      const px = a.x + a.vx * dur * 0.6;
      const py = a.y + a.vy * dur * 0.6;
      const dd = dist(px, py, fx, fy);
      if (dd < bd) {
        bd = dd;
        best = a;
      }
    }
    if (best && bd < 7) {
      best.mode = 'track';
      this.lastTarget = best.i;
      this.stat(best.sp.pid, 'tgt', 1);
    } else this.lastTarget = -1;
    // defenders read the throw
    for (const a of this.actors) {
      if (a.side === DEF) a.readT = Math.max(a.readT, this.t + a.react * 0.8);
    }
    void user;
    this.event('throw', 'Pass thrown');
  }

  private isEligible(a: Actor) {
    return ['X', 'Z', 'SLOT', 'SLOT2', 'TE', 'TE2', 'RB', 'FB'].includes(a.role) && a.mode !== 'down';
  }

  // ------------------------------------------------------------------ AI brains

  private nearestDefender(a: Actor, mustBeFree = false): Actor | null {
    let best: Actor | null = null;
    let bd = 1e9;
    for (const o of this.actors) {
      if (o.side === a.side || o.mode === 'down') continue;
      if (mustBeFree && (o.engaged >= 0 || o.stun > 0)) continue;
      const d = dist(o.x, o.y, a.x, a.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  private delayedPos(a: Actor, delay: number): [number, number] {
    const steps = clamp(Math.round(delay * 60), 0, a.hist.length / 2 - 1);
    let idx = a.histI - 2 - steps * 2;
    while (idx < 0) idx += a.hist.length;
    return [a.hist[idx], a.hist[idx + 1]];
  }

  /** Desired velocity is written into a._dx/_dy via steer(). */
  private steer(a: Actor, tx: number, ty: number, speedFrac: number) {
    const dx = tx - a.x;
    const dy = ty - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const sp = a.maxSpd * speedFrac;
    if (d < 0.05) {
      desired.set(a.i, [0, 0]);
      return;
    }
    // arrive behaviour
    const s = Math.min(sp, d * 4);
    desired.set(a.i, [(dx / d) * s, (dy / d) * s]);
  }

  private think(a: Actor, dt: number) {
    desired.set(a.i, [0, 0]);
    if (a.mode === 'down' || a.stun > 0) {
      desired.set(a.i, [a.vx * 0.2, a.vy * 0.2]);
      return;
    }
    if (a.engaged >= 0) return; // handled in resolveEngagements
    const ball = this.ball;
    const carrier = this.carrierActor();
    const s = this.scrim;
    switch (a.mode) {
      case 'qb':
        return this.thinkQB(a, dt);
      case 'route':
        return this.thinkRoute(a);
      case 'track': {
        if (ball.state === 'air') {
          // run under the ball
          const remaining = ball.dur - ball.t;
          const reach = a.maxSpd * remaining;
          const d = dist(a.x, a.y, ball.tx, ball.ty);
          if (d <= reach + 1.5) this.steer(a, ball.tx, ball.ty, 1);
          else this.steer(a, ball.tx, ball.ty, 1);
        } else this.thinkRoute(a);
        return;
      }
      case 'passblock':
        return this.thinkPassBlock(a);
      case 'runblock':
        return this.thinkRunBlock(a);
      case 'leadblock':
        return this.thinkLeadBlock(a);
      case 'wall':
        return this.thinkWall(a);
      case 'runpath':
        return this.thinkRunPath(a);
      case 'carry':
        return this.thinkCarrier(a, dt);
      case 'returner':
        return this.thinkReturner(a);
      case 'rush':
        return this.thinkRush(a);
      case 'man':
        return this.thinkMan(a);
      case 'zone':
        return this.thinkZone(a);
      case 'coverage':
        return this.thinkCoverage(a);
      case 'pursue':
        if (carrier && this.t >= a.readT) return this.pursue(a, carrier);
        if (ball.state === 'air' || ball.state === 'loose') return this.steer(a, ball.state === 'air' ? ball.tx : ball.x, ball.state === 'air' ? ball.ty : ball.y, 0.9);
        if (s && this.qb >= 0) return this.steer(a, this.actors[this.qb].x, this.actors[this.qb].y, 0.8);
        return;
      case 'idle':
        if (a.i === this.qb && this.passThrown) {
          // drift after throw
          desired.set(a.i, [a.vx * 0.5, a.vy * 0.5]);
        }
        if (a.i === this.qb && this.handedOff && s?.play.run) {
          // carry out the fake bootleg
          const by = s.ballY;
          this.steer(a, this.los - 4, by - (s.play.run.path[0][1] > 0 ? 6 : -6), 0.5);
        }
        return;
    }
  }

  private thinkQB(q: Actor, dt: number) {
    const s = this.scrim!;
    const user = this.userActor === q.i;
    const run = s.play.run;
    // drop back / mesh
    let tx = this.qbDropX;
    let ty = this.qbDropY;
    if (run && !this.handedOff) {
      const fake = run.qbFake ?? [run.path[0][0] + 0.6, run.path[0][1] * 0.5];
      tx = this.los + fake[0];
      ty = s.ballY + fake[1];
    }
    if (user) {
      const m = this.userMove;
      if (this.userTucked || (m.active && this.t > 0.3)) {
        if (m.active) {
          const d = Math.hypot(m.x, m.y) || 1;
          const sp = q.maxSpd * (m.sprint ? 1 : 0.85);
          desired.set(q.i, [(m.x / d) * sp * Math.min(1, d), (m.y / d) * sp * Math.min(1, d)]);
        } else if (this.userTucked) {
          desired.set(q.i, [q.maxSpd * 0.85, 0]);
        }
        if (q.x > this.los + 0.4 || this.userTucked) {
          this.becomeRunner(q);
        }
        return;
      }
      if (q.laneY !== null && (this.handedOff || !run)) {
        // swipes slide the quarterback along his drop depth
        ty = q.laneY;
        if (Math.abs(q.laneY - q.y) < 0.2 && Math.hypot(q.vx, q.vy) < 0.5) q.laneY = null;
        desired.set(q.i, [clamp((tx - q.x) * 3, -q.maxSpd, q.maxSpd) * 0.5, clamp((ty - q.y) * 6, -q.maxSpd * 0.8, q.maxSpd * 0.8)]);
        return;
      }
      this.steer(q, tx, ty, 0.75);
      return;
    }
    // AI quarterback
    this.steer(q, tx, ty, 0.75);
    if (run && !run.pitch && !this.handedOff) return;
    if (!this.aimAllowed) return;
    this.aiQbDecide(q, dt);
  }

  private becomeRunner(q: Actor) {
    if (this.carrier === q.i) return;
    this.giveBall(q, 'qbrun');
    this.stat(q.sp.pid, 'rAtt', 1);
    this.aimAllowed = false;
    for (const a of this.actors) {
      if (a.side === OFF && (a.mode === 'route' || a.mode === 'track')) a.mode = 'leadblock';
    }
  }

  private qbClock = 0;
  private aiQbDecide(q: Actor, dt: number) {
    this.qbClock += dt;
    if (this.qbClock < 0.12) return;
    this.qbClock = 0;
    const s = this.scrim!;
    const r = q.sp.r;
    const settled = dist(q.x, q.y, this.qbDropX, this.qbDropY) < 1.5 || this.t > 1.5;
    if (!settled && this.t < 1.1) return;
    const rusher = this.nearestDefender(q, true);
    const rd = rusher ? dist(rusher.x, rusher.y, q.x, q.y) : 99;
    const pressured = rd < 3.2;
    const minT = s.play.cat === 'screen' ? 0.55 : s.play.cat === 'short' ? 0.75 : s.play.cat === 'deep' ? 1.5 : 1.1;
    if (this.t < (pressured ? 0.6 : minT)) return;
    const maxD = this.maxThrow();
    const speed = 15 + r.thp * 0.1;
    let best: { a: Actor; x: number; y: number; score: number } | null = null;
    for (const a of this.actors) {
      if (a.side !== OFF || !this.isEligible(a) || (a.mode !== 'route' && a.mode !== 'track')) continue;
      // lead the receiver along his route
      let lx = a.x;
      let ly = a.y;
      for (let it = 0; it < 3; it++) {
        const d = dist(q.x, q.y, lx, ly);
        const T = 0.22 + d / speed;
        [lx, ly] = this.predictRoute(a, T);
      }
      ly = clamp(ly, 1.5, FIELD_W - 1.5);
      lx = Math.min(lx, 109);
      const d = dist(q.x, q.y, lx, ly);
      if (d > maxD) continue;
      const T = 0.22 + d / speed;
      // separation at the catch point
      let sep = 99;
      let lane = 99;
      for (const o of this.actors) {
        if (o.side !== DEF || o.mode === 'down') continue;
        const reach = o.maxSpd * Math.max(0, T - o.react) * 0.85;
        const od = dist(o.x, o.y, lx, ly) - reach;
        sep = Math.min(sep, od);
        // throwing lane danger (low part of the trajectory near the QB)
        const segT = clamp(((o.x - q.x) * (lx - q.x) + (o.y - q.y) * (ly - q.y)) / (d * d), 0, 1);
        if (segT < 0.25 || segT > 0.75) {
          const px = q.x + (lx - q.x) * segT;
          const py = q.y + (ly - q.y) * segT;
          lane = Math.min(lane, dist(o.x, o.y, px, py));
        }
      }
      const perceive = (100 - r.awr) * 0.03;
      sep += this.rng.normal(0, 0.5 + perceive);
      const gain = lx - this.los;
      const need = s.toGo;
      let score = sep * 1.1 + Math.min(gain, 25) * 0.07;
      if (gain >= need) score += s.down >= 3 ? 1.2 : 0.4;
      if (s.down >= 3 && gain < need) score -= 1;
      if (lane < 1.3) score -= 2.5;
      if (s.clockUrgent && Math.min(ly, FIELD_W - ly) < 8) score += 0.6;
      if (!best || score > best.score) best = { a, x: lx, y: ly, score };
    }
    const time = this.t;
    const threshold = pressured ? -0.4 : time < 2 ? 1.9 : time < 3 ? 1.1 : time < 3.8 ? 0.5 : -0.2;
    if (best && best.score > threshold) {
      this.throwBall(q, best.x, best.y, false);
      return;
    }
    // scramble or throw away
    if (time > 4.2 || (pressured && rd < 1.5)) {
      const lane = this.findScrambleLane(q);
      if (lane && (r.spd > 70 || time > 4.8)) {
        this.becomeRunner(q);
        return;
      }
      if (time > 4.6 && pressured) {
        // throw it away toward the nearest sideline
        const ty = q.y < MID_Y ? -3 : FIELD_W + 3;
        this.throwBall(q, q.x + 12, ty, false);
      }
    }
  }

  /** Where a receiver will be after T seconds if he keeps running his route. */
  predictRoute(a: Actor, T: number): [number, number] {
    const r = a.route;
    let x = a.x;
    let y = a.y;
    let left = T * a.maxSpd * 0.9;
    if (!r || a.mode !== 'route') return [a.x + a.vx * T, a.y + a.vy * T];
    let idx = r.idx;
    let px = x;
    let py = y;
    while (left > 0 && idx < r.pts.length) {
      const [tx, ty] = r.pts[idx];
      const d = dist(x, y, tx, ty);
      if (d <= left) {
        left -= d;
        px = x;
        py = y;
        x = tx;
        y = ty;
        idx++;
      } else {
        x += ((tx - x) / d) * left;
        y += ((ty - y) / d) * left;
        left = 0;
      }
    }
    if (left > 0 && r.end === 'continue') {
      const last = r.pts[r.pts.length - 1];
      const prev = r.pts.length > 1 ? r.pts[r.pts.length - 2] : [px, py];
      const dx = last[0] - prev[0];
      const dy = last[1] - prev[1];
      const d = Math.hypot(dx, dy) || 1;
      x += (dx / d) * left;
      y += (dy / d) * left;
    }
    return [x, clamp(y, 0.5, FIELD_W - 0.5)];
  }

  private findScrambleLane(q: Actor): boolean {
    for (const o of this.actors) {
      if (o.side !== DEF || o.engaged >= 0) continue;
      if (o.x > q.x && o.x < q.x + 6 && Math.abs(o.y - q.y) < 3) return false;
    }
    return true;
  }

  private thinkRoute(a: Actor) {
    const r = a.route;
    const s = this.scrim;
    if (this.t < a.zoneJam) {
      desired.set(a.i, [0.5, 0]);
      return;
    }
    // scramble drill: QB is running around, receivers flow to open grass
    if (s && this.qb >= 0 && this.ball.holder === this.qb && this.t > 3.2) {
      const q = this.actors[this.qb];
      const target = clamp(a.y + (a.y < q.y ? -1 : 1), 3, FIELD_W - 3);
      this.steer(a, Math.max(a.x, this.los + 4), target, 0.6);
      return;
    }
    if (!r) {
      desired.set(a.i, [0, 0]);
      return;
    }
    if (r.idx >= r.pts.length) {
      if (r.end === 'continue') {
        const last = r.pts[r.pts.length - 1];
        const prev = r.pts.length > 1 ? r.pts[r.pts.length - 2] : [a.x - 1, a.y];
        const dx = last[0] - prev[0];
        const dy = last[1] - prev[1];
        const d = Math.hypot(dx, dy) || 1;
        let vx = (dx / d) * a.maxSpd * 0.95;
        let vy = (dy / d) * a.maxSpd * 0.95;
        if (a.y < 2.5 && vy < 0) vy = 0;
        if (a.y > FIELD_W - 2.5 && vy > 0) vy = 0;
        if (a.x > 108) vx = 0;
        desired.set(a.i, [vx, vy]);
      } else {
        // sit down in the hole, drift away from the nearest defender
        const n = this.nearestDefender(a);
        let vy = 0;
        if (n && dist(n.x, n.y, a.x, a.y) < 3) vy = n.y > a.y ? -1.2 : 1.2;
        desired.set(a.i, [0, vy]);
      }
      return;
    }
    const [tx, ty] = r.pts[r.idx];
    const d = dist(a.x, a.y, tx, ty);
    // decelerate into cuts depending on route running
    let frac = 0.97;
    if (r.idx < r.pts.length - 1 || r.end === 'stop') {
      if (d < 1.6) frac = 0.55 + a.sp.r.rte * 0.004;
    }
    this.steer(a, tx, ty, frac);
    if (d < 0.7) r.idx++;
  }

  private rushersThreat(): Actor[] {
    return this.actors.filter((o) => o.side === DEF && (o.mode === 'rush' || o.mode === 'pursue') && o.mode !== ('down' as Mode));
  }

  private thinkPassBlock(a: Actor) {
    const s = this.scrim;
    const q = this.qb >= 0 ? this.actors[this.qb] : null;
    if (!q || !s) return;
    if (s.play.screenRelease && this.t > 1.25 && !this.passThrown) {
      a.mode = 'leadblock';
      return;
    }
    if (this.t > 1.25 && s.play.screenRelease) return;
    const laneY = a.hy;
    let target: Actor | null = null;
    let bd = 1e9;
    for (const o of this.rushersThreat()) {
      if (o.engaged >= 0 && o.engaged !== a.i) continue;
      if (o.shedFrom === a.i && this.t - o.shedT < 1.0) continue;
      const laneDist = Math.abs(o.y - laneY);
      const d = dist(o.x, o.y, q.x, q.y) + laneDist * 1.4;
      if (d < bd && laneDist < 6) {
        bd = d;
        target = o;
      }
    }
    if (!target) {
      // help: drift to a spot in front of the QB
      this.steer(a, Math.min(q.x + 2.5, this.los - 0.5), clamp(laneY + (q.y - s.ballY) * 0.5, 1, FIELD_W - 1), 0.55);
      return;
    }
    const dx = q.x - target.x;
    const dy = q.y - target.y;
    const d = Math.hypot(dx, dy) || 1;
    this.steer(a, target.x + (dx / d) * 0.9, target.y + (dy / d) * 0.9, 0.85);
    if (dist(a.x, a.y, target.x, target.y) < 1.15 && target.engaged < 0) this.engage(a, target);
  }

  private thinkRunBlock(a: Actor) {
    const s = this.scrim;
    if (!s) return;
    const laneY = a.hy;
    let target: Actor | null = null;
    let bd = 1e9;
    for (const o of this.actors) {
      if (o.side !== DEF || o.mode === 'down') continue;
      if (o.engaged >= 0) continue;
      if (o.shedFrom === a.i && this.t - o.shedT < 1.0) continue;
      if (o.x < a.x - 2) continue;
      const d = dist(o.x, o.y, a.x, a.y) + Math.abs(o.y - laneY) * 0.8;
      if (d < bd && d < 9) {
        bd = d;
        target = o;
      }
    }
    if (!target) {
      this.steer(a, a.x + 3, laneY, 0.6);
      return;
    }
    this.steer(a, target.x, target.y, 0.9);
    if (dist(a.x, a.y, target.x, target.y) < 1.15) this.engage(a, target);
  }

  private thinkLeadBlock(a: Actor) {
    const c = this.carrierActor();
    if (!c || c.side !== a.side) {
      const scr = this.screenTarget >= 0 ? this.actors[this.screenTarget] : null;
      if (scr && a.side === OFF && !c) this.steer(a, this.los + 2, a.y * 0.5 + scr.y * 0.5, 0.7);
      else desired.set(a.i, [0, 0]);
      return;
    }
    let target: Actor | null = null;
    let bd = 1e9;
    for (const o of this.actors) {
      if (o.side === a.side || o.mode === 'down' || o.engaged >= 0) continue;
      if (o.shedFrom === a.i && this.t - o.shedT < 1.0) continue;
      const dc = dist(o.x, o.y, c.x, c.y);
      if (dc > 12) continue;
      const ahead = (o.x - c.x) * this.carrierDir > -2;
      if (!ahead) continue;
      const d = dist(o.x, o.y, a.x, a.y) + dc * 0.6;
      if (d < bd) {
        bd = d;
        target = o;
      }
    }
    if (!target) {
      this.steer(a, c.x + this.carrierDir * 3, c.y + (a.y > c.y ? 2 : -2), 0.8);
      return;
    }
    // get between defender and carrier
    const mx = target.x + (c.x - target.x) * 0.25;
    const my = target.y + (c.y - target.y) * 0.25;
    this.steer(a, mx, my, 0.95);
    if (dist(a.x, a.y, target.x, target.y) < 1.1) this.engage(a, target);
  }

  private thinkWall(a: Actor) {
    const c = this.carrierActor();
    const ball = this.ball;
    // retreat to form a wall in front of where the returner will be
    if (!c) {
      const tx = ball.state === 'air' ? ball.tx + 9 + (a.i % 3) * 3 : a.x;
      const ty = clamp(a.y + (MID_Y - a.y) * 0.02, 2, FIELD_W - 2);
      this.steer(a, Math.max(tx, a.x - 20), ty, 0.6);
      // pick up a coverage player that comes close
      const n = this.nearestDefender(a, true);
      if (n && dist(n.x, n.y, a.x, a.y) < 1.2 && this.t > 1) this.engage(a, n);
      return;
    }
    this.thinkLeadBlock(a);
  }

  private thinkRunPath(a: Actor) {
    const p = a.runPath;
    if (!p || !p.length) {
      desired.set(a.i, [0, 0]);
      return;
    }
    const [tx, ty] = p[0];
    // wait at the mesh point until the handoff
    const s = this.scrim;
    const waiting = s?.play.run && !this.handedOff && this.t < s.play.run.mesh;
    this.steer(a, tx, ty, waiting ? 0.5 : 0.82);
    if (dist(a.x, a.y, tx, ty) < 0.9 && p.length > 1 && !waiting) p.shift();
  }

  private thinkCarrier(c: Actor, dt: number) {
    const userCtl = c.i === this.userActor;
    const dir = c.side === OFF ? 1 : -1;
    // juke burst
    if (c.jukeT > 0) {
      desired.set(c.i, [dir * c.maxSpd * 0.55, c.jukeDir * 7]);
      return;
    }
    let sprint = false;
    if (userCtl) {
      const m = this.userMove;
      sprint = m.sprint && c.stamina > 0.05;
      const sp = c.maxSpd * (sprint ? 0.98 : 0.9);
      if (m.active) {
        // keyboard / analog fallback
        let mx = m.x;
        const my = m.y;
        if (Math.abs(mx) < 0.15) mx = dir * 0.55;
        const d = Math.hypot(mx, my) || 1;
        desired.set(c.i, [(mx / d) * sp, (my / d) * sp]);
      } else {
        // runs downfield on its own; swipes scoot it over a lane
        let vy = 0;
        if (c.laneY !== null) {
          const dy = c.laneY - c.y;
          if (Math.abs(dy) < 0.15) c.laneY = null;
          else vy = clamp(dy * 7, -sp * 0.95, sp * 0.95);
        }
        const vx = Math.sqrt(Math.max(0, sp * sp - vy * vy * 0.55));
        desired.set(c.i, [dir * vx, vy]);
      }
    } else {
      sprint = c.stamina > 0.2;
      // follow the designed run path until past the line
      if (c.runPath && c.runPath.length && (c.x - this.los) * dir < 1) {
        const [tx, ty] = c.runPath[0];
        if (dist(c.x, c.y, tx, ty) < 1 && c.runPath.length > 1) c.runPath.shift();
        const blocked = this.laneBlocked(c, tx, ty);
        if (!blocked) {
          this.steer(c, tx, ty, 0.95);
          this.staminaTick(c, dt, sprint);
          return;
        }
      }
      const best = this.bestRunDir(c, dir);
      const sp = c.maxSpd * (sprint ? 0.95 : 0.9);
      desired.set(c.i, [best[0] * sp, best[1] * sp]);
      // AI juke when a tackler is close
      const n = this.nearestDefender(c, true);
      if (n && c.jukeCd <= 0 && dist(n.x, n.y, c.x, c.y) < 1.9) {
        c.jukeCd = 1.6;
        if (this.rng.chance(0.25 + c.sp.r.elu / 400)) this.startJuke(c, n.y > c.y ? -1 : 1);
      }
      // AI QB slides / gets out of bounds when appropriate
      const s = this.scrim;
      if (s?.clockUrgent && Math.min(c.y, FIELD_W - c.y) < 6) desired.set(c.i, [dir * sp * 0.4, (c.y < MID_Y ? -1 : 1) * sp]);
    }
    this.staminaTick(c, dt, sprint);
    c.runPath = c.runPath && (c.x - this.los) * dir < 1 ? c.runPath : null;
  }

  private staminaTick(c: Actor, dt: number, sprint: boolean) {
    if (sprint) c.stamina = Math.max(0, c.stamina - dt * 0.28);
    else c.stamina = Math.min(1, c.stamina + dt * 0.18);
  }

  private laneBlocked(c: Actor, tx: number, ty: number): boolean {
    const dx = tx - c.x;
    const dy = ty - c.y;
    const d = Math.hypot(dx, dy) || 1;
    for (const o of this.actors) {
      if (o.side === c.side || o.mode === 'down') continue;
      const ox = o.x - c.x;
      const oy = o.y - c.y;
      const along = (ox * dx + oy * dy) / d;
      if (along < 0 || along > 3) continue;
      const perp = Math.abs(ox * dy - oy * dx) / d;
      if (perp < 1.2 && o.engaged < 0) return true;
    }
    return false;
  }

  private bestRunDir(c: Actor, dir: number): [number, number] {
    let best: [number, number] = [dir, 0];
    let bestScore = -1e9;
    for (let k = -4; k <= 4; k++) {
      const ang = (k * 20 * Math.PI) / 180;
      const vx = Math.cos(ang) * dir;
      const vy = Math.sin(ang);
      let score = vx * dir * 1.5;
      const fx = c.x + vx * 3.5;
      const fy = c.y + vy * 3.5;
      if (fy < 1.5 || fy > FIELD_W - 1.5) score -= 1.5;
      for (const o of this.actors) {
        if (o.side === c.side || o.mode === 'down') continue;
        const dd = dist(o.x, o.y, fx, fy);
        const w = o.engaged >= 0 ? 0.35 : 1;
        if (dd < 5) score -= Math.pow(1 - dd / 5, 2) * 2.2 * w;
      }
      // prefer staying near blockers' backs
      for (const o of this.actors) {
        if (o.side !== c.side || o.i === c.i || o.engaged < 0) continue;
        const dd = dist(o.x, o.y, fx, fy);
        if (dd < 3) score += 0.15;
      }
      if (score > bestScore) {
        bestScore = score;
        best = [vx, vy];
      }
    }
    return best;
  }

  private thinkReturner(a: Actor) {
    const ball = this.ball;
    if (ball.state === 'air') {
      const tx = clamp(ball.tx, -9, 110);
      const ty = clamp(ball.ty, 1, FIELD_W - 1);
      this.steer(a, tx, ty, 0.9);
      return;
    }
    if (ball.state === 'loose') this.steer(a, ball.x, ball.y, 1);
  }

  private thinkRush(a: Actor) {
    if (this.t < 0.05) return;
    const s = this.scrim;
    const c = this.carrierActor();
    if (a.biteT > 0 && this.t < a.biteT) {
      this.steer(a, this.los + 0.5, a.y, 0.6);
      return;
    }
    if (c && c.side === OFF && this.t >= a.readT) return this.pursue(a, c);
    const q = this.qb >= 0 ? this.actors[this.qb] : null;
    if (!q) return;
    if (this.passThrown) {
      // chase the ball
      if (this.ball.state === 'air') this.steer(a, this.ball.tx, this.ball.ty, 0.7);
      return;
    }
    // rush: aim slightly outside to contain for edge rushers
    const edge = Math.abs(a.y - (s?.ballY ?? MID_Y)) > 4;
    const ty = edge ? q.y + (a.y < q.y ? -0.6 : 0.6) : q.y;
    this.steer(a, q.x, ty, 0.95);
  }

  private thinkMan(a: Actor) {
    const tgt = this.actors[a.manTarget];
    const ball = this.ball;
    const c = this.carrierActor();
    if (c && c.side === OFF && this.t >= a.readT) return this.pursue(a, c);
    if (a.biteT > 0 && this.t < a.biteT) {
      this.steer(a, this.los + 1, a.y, 0.6);
      return;
    }
    if (ball.state === 'air' && ball.kind === 'pass' && this.t >= a.readT) {
      const remaining = ball.dur - ball.t;
      const d = dist(a.x, a.y, ball.tx, ball.ty);
      if (d < a.maxSpd * Math.max(0, remaining - a.react * 0.5) * 0.9 + 2 || (tgt && dist(tgt.x, tgt.y, ball.tx, ball.ty) < 3)) {
        this.steer(a, ball.tx, ball.ty, 1);
        return;
      }
    }
    if (!tgt) return;
    const delay = clamp(a.react + (tgt.sp.r.rte - a.sp.r.cov) * 0.003, 0.05, 0.5);
    const [hx, hy] = this.delayedPos(tgt, delay);
    const [hx2, hy2] = this.delayedPos(tgt, delay + 0.1);
    const vx = (hx - hx2) * 10;
    const vy = (hy - hy2) * 10;
    // keep the current cushion (never run at the receiver), shrinking to ~1 yard over the top
    const gap = a.x - hx;
    const cushion = clamp(gap, tgt.x - this.los > 10 ? 1.3 : 0.9, 5);
    this.steer(a, hx + vx * 0.3 + cushion, hy + vy * 0.3, 1);
  }

  private thinkZone(a: Actor) {
    const z = a.zone;
    const ball = this.ball;
    const c = this.carrierActor();
    if (c && c.side === OFF && this.t >= a.readT) return this.pursue(a, c);
    if (!z) return;
    if (a.biteT > 0 && this.t < a.biteT) {
      this.steer(a, this.los + 1.5, a.y, 0.7);
      return;
    }
    if (ball.state === 'air' && ball.kind === 'pass' && this.t >= a.readT) {
      const remaining = ball.dur - ball.t;
      const d = dist(a.x, a.y, ball.tx, ball.ty);
      if (d < a.maxSpd * Math.max(0, remaining - a.react * 0.5) * 0.9 + 2) {
        this.steer(a, ball.tx, ball.ty, 1);
        return;
      }
    }
    // run read: come downhill on run plays once read
    if (this.isRunPlay && this.t >= a.readT && !z.deep) {
      const q = this.actors[this.qb];
      if (q) this.steer(a, this.los + 2, q.y + (a.y - q.y) * 0.5, 0.8);
      return;
    }
    // find the most threatening receiver in my zone
    let threat: Actor | null = null;
    let tScore = -1e9;
    for (const o of this.actors) {
      if (o.side !== OFF || !this.isEligible(o) || (o.mode !== 'route' && o.mode !== 'track')) continue;
      const d = dist(o.x, o.y, z.x, z.y);
      // deep zones own a lateral band of the field; underneath zones a circle
      if (z.deep ? Math.abs(o.y - z.y) > z.r || o.x < this.los + 5 : d > z.r) continue;
      const sc = z.deep ? o.x * 2 - Math.abs(o.y - z.y) * 0.3 : -d;
      if (sc > tScore) {
        tScore = sc;
        threat = o;
      }
    }
    if (!threat) {
      // drop and read the QB's eyes
      const q = this.actors[this.qb];
      const lean = q ? (q.y - z.y) * 0.1 : 0;
      this.steer(a, z.x, z.y + lean, 0.85);
      return;
    }
    if (z.deep) {
      const tx = Math.max(z.x - 2, threat.x + 3);
      let ty = threat.y * 0.7 + z.y * 0.3;
      // two vertical threats in my band: split them
      for (const o of this.actors) {
        if (o === threat || o.side !== OFF || !this.isEligible(o) || o.mode !== 'route') continue;
        if (Math.abs(o.y - z.y) < z.r && o.x > this.los + 10 && Math.abs(o.x - threat.x) < 6) ty = (threat.y + o.y) / 2;
      }
      this.steer(a, tx, ty, 1);
    } else {
      const tx = threat.x * 0.6 + z.x * 0.4 + 0.5;
      const ty = threat.y * 0.7 + z.y * 0.3;
      this.steer(a, tx, ty, 0.95);
    }
  }

  private thinkCoverage(a: Actor) {
    if (this.t < a.readT) {
      this.steer(a, a.x - 1, a.y, 0.3);
      return;
    }
    const c = this.carrierActor();
    if (c && c.side === OFF) return this.pursue(a, c);
    const ball = this.ball;
    if (a.role === 'K') {
      this.steer(a, a.x - 6, a.y, 0.5);
      return;
    }
    // run down in lanes toward the landing spot
    const tx = ball.state === 'air' ? ball.tx : ball.x;
    const ty0 = ball.state === 'air' ? ball.ty : ball.y;
    const laneY = a.zone ? a.zone.y : a.y;
    const dx = Math.abs(a.x - tx);
    const ty = dx > 15 ? laneY * 0.6 + ty0 * 0.4 : ty0;
    this.steer(a, tx, ty, 1);
  }

  private pursue(a: Actor, c: Actor) {
    // proper intercept course: solve |r + v t| = s t for the earliest t
    const rx = c.x - a.x;
    const ry = c.y - a.y;
    const s = a.maxSpd;
    const vv = c.vx * c.vx + c.vy * c.vy;
    const A = vv - s * s;
    const B = 2 * (rx * c.vx + ry * c.vy);
    const C = rx * rx + ry * ry;
    let t = -1;
    if (Math.abs(A) < 1e-6) t = B < 0 ? -C / B : -1;
    else {
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        const t1 = (-B - sq) / (2 * A);
        const t2 = (-B + sq) / (2 * A);
        t = Math.min(t1 > 0 ? t1 : 1e9, t2 > 0 ? t2 : 1e9);
        if (t >= 1e9) t = -1;
      }
    }
    if (t < 0 || t > 4) t = Math.min(1.2, Math.sqrt(C) / s);
    t *= 0.9 + a.sp.r.awr * 0.001;
    let tx = c.x + c.vx * t;
    let ty = c.y + c.vy * t;
    // never aim past the sideline
    ty = clamp(ty, -0.5, FIELD_W + 0.5);
    tx = clamp(tx, -10, 110);
    this.steer(a, tx, ty, 1);
  }

  // ------------------------------------------------------------------ blocking

  private engage(blocker: Actor, defender: Actor) {
    if (blocker.engaged >= 0 || defender.engaged >= 0) return;
    if (defender.i === this.carrier) return;
    blocker.engaged = defender.i;
    defender.engaged = blocker.i;
    blocker.anim = 'block';
    defender.anim = 'block';
  }

  private release(a: Actor, b: Actor) {
    a.engaged = -1;
    b.engaged = -1;
    a.anim = 'run';
    b.anim = 'run';
  }

  private resolveEngagements(dt: number) {
    const q = this.qb >= 0 ? this.actors[this.qb] : null;
    const c = this.carrierActor();
    for (const blk of this.actors) {
      if (blk.side !== OFF || blk.engaged < 0) continue;
      const def = this.actors[blk.engaged];
      if (!def || def.engaged !== blk.i) {
        blk.engaged = -1;
        continue;
      }
      const passPro = blk.mode === 'passblock' && !this.carrierActor();
      const br = blk.sp.r;
      const dr = def.sp.r;
      const skillD = this.setup.skill.def;
      const skillO = this.setup.skill.off;
      const bPow = br.blk * 0.65 + br.str * 0.35 + skillO * 3 + (passPro ? 0 : 9);
      const dPow = passPro ? dr.prs * 0.6 + dr.str * 0.4 + skillD * 3 : dr.str * 0.5 + dr.tak * 0.3 + dr.prs * 0.2 + skillD * 3;
      const adv = dPow - bPow;
      // double teams make shedding much harder
      let helpers = 0;
      for (const o of this.actors) if (o.side === OFF && o.i !== blk.i && o.engaged < 0 && o.mode === 'passblock' && dist(o.x, o.y, def.x, def.y) < 1.6) helpers++;
      const baseShed = passPro ? 0.13 : 0.11;
      let shed = baseShed * Math.exp(adv / 13) * (helpers ? 0.35 : 1);
      // ball carrier passing right by: defender tries to get off the block
      if (c && c.side === OFF && dist(c.x, c.y, def.x, def.y) < 1.8) shed *= 1.6;
      if (this.rng.chance(shed * dt)) {
        this.release(blk, def);
        def.shedFrom = blk.i;
        def.shedT = this.t;
        blk.stun = 0.3;
        continue;
      }
      // the pair drifts in the direction of whoever is winning
      let goalX: number;
      let goalY: number;
      if (passPro && q) {
        goalX = q.x;
        goalY = q.y;
      } else if (c) {
        goalX = c.x;
        goalY = c.y;
      } else {
        goalX = def.x - 1;
        goalY = def.y;
      }
      const dx = goalX - def.x;
      const dy = goalY - def.y;
      const d = Math.hypot(dx, dy) || 1;
      const push = passPro ? clamp(0.35 + adv / 50, -0.6, 1.2) * 1.3 : clamp(adv / 40, -0.8, 1) * 1.6;
      const vx = (dx / d) * push;
      const vy = (dy / d) * push * 0.6;
      desired.set(def.i, [vx, vy]);
      desired.set(blk.i, [vx, vy]);
      // keep them touching
      const sx = def.x - blk.x;
      const sy = def.y - blk.y;
      const sd = Math.hypot(sx, sy) || 1;
      if (sd > 1.0) {
        const pull = (sd - 0.9) * 4;
        const cur = desired.get(blk.i)!;
        desired.set(blk.i, [cur[0] + (sx / sd) * pull, cur[1] + (sy / sd) * pull]);
      }
    }
  }

  // ------------------------------------------------------------------ physics

  private integrate(a: Actor, dt: number) {
    const dv = desired.get(a.i) ?? [0, 0];
    let ax = dv[0] - a.vx;
    let ay = dv[1] - a.vy;
    const am = Math.hypot(ax, ay);
    const lim = a.accel * dt * (a.jukeT > 0 ? 2.5 : 1);
    if (am > lim) {
      ax = (ax / am) * lim;
      ay = (ay / am) * lim;
    }
    a.vx += ax;
    a.vy += ay;
    const sp = Math.hypot(a.vx, a.vy);
    const cap = a.maxSpd * (a.jukeT > 0 ? 1.15 : 1);
    if (sp > cap) {
      a.vx *= cap / sp;
      a.vy *= cap / sp;
    }
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    // a quarterback dropping back keeps his eyes (and throwing arm) downfield
    const qbSettled = a.anim === 'throw' || (a.mode === 'qb' && this.ball.holder === a.i);
    if (qbSettled) {
      if (a.anim !== 'throw') a.facing = a.side === OFF ? 1 : -1;
    } else if (Math.abs(a.vx) > 0.3) a.facing = a.vx > 0 ? 1 : -1;
    if (a.mode === 'down' || a.anim === 'throw' || a.anim === 'kick' || a.anim === 'block' || a.anim === 'catch') {
      if (a.anim === 'throw' && a.animT > 0.4) a.anim = 'stand';
      if (a.anim === 'kick' && a.animT > 0.6) a.anim = 'run';
      if (a.anim === 'catch' && a.animT > 0.35) a.anim = 'run';
      if (a.anim === 'block' && a.engaged < 0) a.anim = 'run';
    } else {
      a.anim = sp > 0.6 ? 'run' : 'stand';
    }
    // non-carriers stay roughly on the field
    if (a.i !== this.carrier) a.y = clamp(a.y, -2, FIELD_W + 2);
  }

  private separate() {
    const n = this.actors.length;
    for (let i = 0; i < n; i++) {
      const a = this.actors[i];
      if (a.mode === 'down') continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.actors[j];
        if (b.mode === 'down') continue;
        if (a.engaged === b.i) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const minD = 0.75;
        if (d2 < minD * minD && d2 > 1e-6) {
          // carriers and tacklers are handled by tackling, but still don't overlap
          const d = Math.sqrt(d2);
          const push = (minD - d) * 0.5;
          const ux = dx / d;
          const uy = dy / d;
          const aw = a.i === this.carrier ? 0.3 : 0.5;
          const bw = b.i === this.carrier ? 0.3 : 0.5;
          a.x -= ux * push * (aw * 2);
          a.y -= uy * push * (aw * 2);
          b.x += ux * push * (bw * 2);
          b.y += uy * push * (bw * 2);
        }
      }
    }
  }

  // ------------------------------------------------------------------ ball

  private updateBall(dt: number) {
    const b = this.ball;
    if (b.state === 'held') {
      const h = this.actors[b.holder];
      if (h) {
        b.x = h.x + h.facing * 0.25;
        b.y = h.y;
        b.z = 1.1;
      }
      return;
    }
    if (b.state === 'loose') {
      b.z = Math.max(0, b.z - dt * 3);
      this.resolveLooseBall();
      return;
    }
    if (b.state !== 'air') return;
    b.t += dt;
    const u = clamp(b.t / b.dur, 0, 1);
    b.x = b.fx + (b.tx - b.fx) * u;
    b.y = b.fy + (b.ty - b.fy) * u;
    const endZ = b.kind === 'kick' ? 1.3 : 1.3;
    b.z = b.fz * (1 - u) + endZ * u + 4 * b.peak * u * (1 - u);
    if (b.kind === 'pass') {
      // tipped passes at the line / jumped routes while the ball is low
      if (b.z < 2.6) {
        for (const o of this.actors) {
          if (o.side !== DEF || o.mode === 'down' || o.stun > 0 || b.touched.has(o.i)) continue;
          if (dist(o.x, o.y, b.x, b.y) < 0.85) {
            b.touched.add(o.i);
            const hands = o.sp.r.cth;
            const pInt = clamp(0.06 + (hands - 50) * 0.003 + this.setup.skill.def * 0.03, 0.03, 0.25);
            const pTip = 0.45;
            const roll = this.rng.next();
            if (roll < pInt) {
              this.interception(o);
              return;
            } else if (roll < pInt + pTip) {
              this.stat(o.sp.pid, 'pd', 1);
              this.incomplete('Batted down!', o);
              return;
            }
          }
        }
      }
      if (b.t >= b.dur) this.resolveCatch();
      return;
    }
    if (b.kind === 'pitch') {
      if (b.t >= b.dur) {
        const rb = this.actors.find((a) => a.side === OFF && a.runPath);
        if (rb && dist(rb.x, rb.y, b.x, b.y) < 2.5 && this.rng.chance(0.993)) {
          this.giveBall(rb, 'rush');
          if (this.scrim?.userControls) this.userActor = rb.i;
        } else {
          this.fumble(rb ?? this.actors[this.qb], null, b.x, b.y);
        }
      }
      return;
    }
    if (b.kind === 'kick') {
      if (b.t >= b.dur && !this.kickLanded) this.resolveKickLanding();
    }
  }

  private updateBallDead(dt: number) {
    const b = this.ball;
    if (b.state === 'air') {
      b.t += dt;
      const u = clamp(b.t / b.dur, 0, 1);
      b.x = b.fx + (b.tx - b.fx) * u;
      b.y = b.fy + (b.ty - b.fy) * u;
      b.z = Math.max(0, b.fz * (1 - u) + 4 * b.peak * u * (1 - u));
      if (u >= 1) b.state = 'dead';
    } else if (b.state === 'held') {
      const h = this.actors[b.holder];
      if (h) {
        b.x = h.x;
        b.y = h.y;
        b.z = h.mode === 'down' ? 0.3 : 1.1;
      }
    }
  }

  private resolveCatch() {
    const b = this.ball;
    const lx = b.tx;
    const ly = b.ty;
    let rec: Actor | null = null;
    let dr = 1e9;
    let def: Actor | null = null;
    let dd = 1e9;
    for (const a of this.actors) {
      if (a.mode === 'down' || a.stun > 0) continue;
      const d = dist(a.x, a.y, lx, ly);
      if (a.side === OFF && this.isEligible(a)) {
        if (d < dr) {
          dr = d;
          rec = a;
        }
      } else if (a.side === DEF) {
        if (d < dd) {
          dd = d;
          def = a;
        }
      }
    }
    const outOfBounds = ly < 0 || ly > FIELD_W || lx > 110;
    if (outOfBounds) {
      this.incomplete('Out of bounds', null);
      return;
    }
    const weather = this.setup.weather === 'rain' || this.setup.weather === 'snow' ? 0.05 : 0;
    const skillD = this.setup.skill.def;
    // defender in better position plays the ball
    if (def && dd < 1.7 && (!rec || dd < dr - 0.35 || dr > 2.1)) {
      const hands = def.sp.r.cth;
      const pInt = clamp(0.1 + (hands - 50) * 0.005 + (def.sp.r.cov - 60) * 0.002 + skillD * 0.04 - (dd - 0.5) * 0.1, 0.04, 0.45);
      if (this.rng.chance(pInt)) {
        this.interception(def);
      } else {
        this.stat(def.sp.pid, 'pd', 1);
        this.incomplete('Pass broken up', def);
      }
      return;
    }
    if (!rec || dr > 2.1) {
      this.incomplete('Incomplete', null);
      return;
    }
    const cth = rec.sp.r.cth;
    let p = 0.52 + cth * 0.0047 - weather;
    if (dr > 1.1) p -= (dr - 1.1) * 0.42; // diving / stretching catch
    let contest = 0;
    if (def && dd < 1.7) {
      contest = clamp(((1.7 - dd) / 1.7) * (0.45 + (def.sp.r.cov - cth) * 0.005 + skillD * 0.05), 0, 0.75);
      p *= 1 - contest;
    }
    p = clamp(p, 0.03, 0.97);
    if (this.rng.chance(p)) {
      this.completeCatch(rec, lx, ly, contest > 0.2);
      return;
    }
    if (def && contest > 0 && this.rng.chance(contest * 0.12 * (0.6 + def.sp.r.cth / 100))) {
      this.interception(def);
      return;
    }
    if (def && contest > 0.15) this.stat(def.sp.pid, 'pd', 1);
    this.incomplete(contest > 0.15 ? 'Broken up!' : 'Dropped!', contest > 0.15 ? def : null);
  }

  private completeCatch(rec: Actor, lx: number, ly: number, contested: boolean) {
    rec.x = rec.x * 0.4 + lx * 0.6;
    rec.y = rec.y * 0.4 + ly * 0.6;
    rec.anim = 'catch';
    rec.animT = 0;
    this.catchFrom = rec.x;
    const qb = this.actors[this.lastPasser];
    if (qb) this.stat(qb.sp.pid, 'pCmp', 1);
    this.stat(rec.sp.pid, 'rec', 1);
    if (rec.i !== this.lastTarget) this.stat(rec.sp.pid, 'tgt', 1);
    this.giveBall(rec, 'catch');
    if (this.scrim?.userControls) this.userActor = rec.i;
    this.popup(contested ? 'GREAT CATCH!' : 'CAUGHT', rec.x, rec.y - 2);
    this.event('catch', 'Caught');
    // slow down briefly on contact catches
    rec.vx *= contested ? 0.45 : 0.7;
    rec.vy *= contested ? 0.45 : 0.7;
  }

  private incomplete(text: string, by: Actor | null) {
    const b = this.ball;
    b.state = 'air';
    this.popup(text.toUpperCase(), b.tx, b.ty - 2);
    void by;
    this.end({ reason: 'incomplete', endX: this.los, endY: this.scrim?.ballY ?? MID_Y }, text, 'INCOMPLETE');
    if (this.outcome) this.outcome.incomplete = true;
    // let the ball fall to the ground
    this.ball = { ...b, state: 'air', fx: b.x, fy: b.y, fz: b.z, tx: b.x + (b.tx - b.fx) * 0.08, ty: b.y + (b.ty - b.fy) * 0.08, t: 0, dur: 0.35, peak: 0.1 };
  }

  private interception(d: Actor) {
    const qb = this.actors[this.lastPasser];
    if (qb) this.stat(qb.sp.pid, 'pInt', 1);
    this.stat(d.sp.pid, 'dInt', 1);
    this.turnoverHappened = true;
    this.popup('INTERCEPTED!', d.x, d.y - 2);
    this.event('int', 'Intercepted');
    this.ball.state = 'held';
    // defender returns the ball toward the offense's goal (x decreasing)
    this.giveBall(d, 'int');
    this.carrierDir = -1;
    d.anim = 'catch';
    d.animT = 0;
    if (this.setup.kind === 'scrimmage' && this.setup.userControls) this.userActor = -1;
  }

  private fumble(c: Actor, by: Actor | null, x: number, y: number) {
    this.stat(c.sp.pid, 'fum', 1);
    if (by) this.stat(by.sp.pid, 'ff', 1);
    this.ball = { ...this.ball, state: 'loose', holder: -1, x, y, z: 1, t: 0 };
    this.carrier = -1;
    c.mode = 'down';
    c.downT = 0.8;
    c.anim = 'down';
    this.popup('FUMBLE!', x, y - 2);
    this.event('fumble', 'Fumble');
    for (const a of this.actors) if (a.mode !== 'down' && a.engaged < 0) a.mode = 'pursue';
    this.looseT = this.t;
  }

  private looseT = 0;
  private resolveLooseBall() {
    const b = this.ball;
    // everyone dives on it; first player in range recovers
    for (const a of this.actors) {
      if (a.mode === 'down' || a.stun > 0) continue;
      this.steer(a, b.x, b.y, 1);
    }
    let best: Actor | null = null;
    let bd = 1e9;
    for (const a of this.actors) {
      if (a.mode === 'down') continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    if (best && (bd < 0.8 || this.t - this.looseT > 2.5)) {
      const kick = this.setup.kind !== 'scrimmage';
      if (best.side === OFF) {
        this.stat(best.sp.pid, 'fr', 1);
        this.turnoverHappened = false;
        this.end({ reason: 'fumble', endX: b.x, endY: b.y }, 'Fumble recovered by the offense', 'RECOVERED');
      } else {
        this.stat(best.sp.pid, 'fr', 1);
        this.turnoverHappened = true;
        this.end({ reason: 'fumble', endX: b.x, endY: b.y }, kick ? 'Muffed! Kicking team recovers' : 'Fumble lost!', 'TURNOVER');
        if (this.outcome) this.outcome.turnover = true;
      }
      best.anim = 'down';
      best.mode = 'down';
    }
  }

  private resolveKickLanding() {
    this.kickLanded = true;
    const b = this.ball;
    const s = this.setup as ReturnSetup;
    const isPunt = s.kind === 'punt';
    if (b.ty < 0 || b.ty > FIELD_W) {
      // out of bounds
      const spot = isPunt ? clamp(b.tx, 1, 99) : 40;
      this.end({ reason: 'oob', endX: spot, endY: MID_Y }, isPunt ? 'Punt out of bounds' : 'Kickoff out of bounds', '');
      return;
    }
    if (b.tx < -10 || (isPunt && b.tx < 0)) {
      this.end({ reason: 'touchback', endX: -1, endY: MID_Y }, 'Touchback', 'TOUCHBACK');
      return;
    }
    const ret = this.actors.find((a) => a.isReturner);
    if (!ret) return;
    const d = dist(ret.x, ret.y, b.tx, b.ty);
    if (d < 2.4) {
      if (isPunt && (this.faircatchCalled || (!s.userControls && this.coverageNear(ret, 4.5)))) {
        this.end({ reason: 'faircatch', endX: b.tx, endY: b.ty }, 'Fair catch', 'FAIR CATCH');
        return;
      }
      const muff = this.setup.weather === 'rain' ? 0.035 : 0.015;
      if (this.rng.chance(muff * (1.3 - ret.sp.r.cth / 100))) {
        this.fumble(ret, null, b.tx, b.ty);
        return;
      }
      ret.x = b.tx;
      ret.y = b.ty;
      this.giveBall(ret, 'return');
      if (s.userControls) this.userActor = ret.i;
      // AI returner: take a knee deep in the end zone
      if (!s.userControls && ret.x < -3 && this.rng.chance(0.75)) {
        this.end({ reason: 'touchback', endX: -1, endY: ret.y }, 'Touchback', 'TOUCHBACK');
      }
      return;
    }
    // ball hits the ground: punts roll, kickoffs are treated as picked up
    if (isPunt) {
      const roll = this.rng.range(2, 9);
      const spot = b.tx - roll;
      if (spot <= 0) this.end({ reason: 'touchback', endX: -1, endY: MID_Y }, 'Touchback', 'TOUCHBACK');
      else this.end({ reason: 'downed', endX: spot, endY: b.ty }, 'Punt downed', '');
    } else {
      ret.x = b.tx;
      ret.y = b.ty;
      if (b.tx < 0) {
        this.end({ reason: 'touchback', endX: -1, endY: MID_Y }, 'Touchback', 'TOUCHBACK');
        return;
      }
      this.giveBall(ret, 'return');
      if (s.userControls) this.userActor = ret.i;
    }
  }

  private coverageNear(a: Actor, r: number) {
    return this.actors.some((o) => o.side !== a.side && dist(o.x, o.y, a.x, a.y) < r);
  }

  // ------------------------------------------------------------------ carrier rules

  private checkCarrier(dt: number) {
    const c = this.carrierActor();
    if (!c) {
      // QB holding the ball can be sacked
      const s = this.scrim;
      if (s && this.ball.state === 'held' && this.ball.holder === this.qb) {
        const q = this.actors[this.qb];
        for (const o of this.actors) {
          if (o.side !== DEF || o.engaged >= 0 || o.stun > 0 || o.mode === 'down' || o.tackleCd > 0) continue;
          if (this.t < 0.35) continue;
          if (dist(o.x, o.y, q.x, q.y) < 0.85) {
            this.tryTackle(o, q, true);
            if (this.phase !== 'live') return;
          }
        }
      }
      return;
    }
    const dir = this.carrierDir;
    // touchdowns
    if (dir === 1 && c.x >= 100) {
      this.touchdown(c);
      return;
    }
    if (dir === -1 && c.x <= 0) {
      this.touchdown(c);
      return;
    }
    // out of bounds
    if (c.y < 0 || c.y > FIELD_W) {
      this.end({ reason: 'oob', endX: c.x, endY: clamp(c.y, 0, FIELD_W) }, 'Out of bounds', '');
      if (this.outcome) this.outcome.outOfBounds = true;
      return;
    }
    if (c.x > 110 || c.x < -10) {
      this.end({ reason: 'oob', endX: c.x, endY: c.y }, 'Out of the back of the end zone', '');
      if (this.outcome) this.outcome.outOfBounds = true;
      return;
    }
    // tackles
    for (const o of this.actors) {
      if (o.side === c.side || o.stun > 0 || o.mode === 'down' || o.tackleCd > 0) continue;
      if (this.t < o.readT && o.mode !== 'rush') continue;
      const d = dist(o.x, o.y, c.x, c.y);
      // runner hugging the sideline gets shoved out
      const edge = Math.min(c.y, FIELD_W - c.y);
      if (edge < 2.2 && d < 1.7 && o.engaged < 0 && Math.abs(o.y - MID_Y) < Math.abs(c.y - MID_Y) + 0.3 && this.rng.chance(0.55)) {
        c.y = c.y < MID_Y ? -0.2 : FIELD_W + 0.2;
        this.end({ reason: 'oob', endX: c.x, endY: clamp(c.y, 0, FIELD_W) }, `Pushed out of bounds`, '');
        if (this.outcome) this.outcome.outOfBounds = true;
        return;
      }
      if (d < 1.6 && d >= 1.05 && o.engaged < 0 && o.lunged === false) {
        // diving / lunging tackle when the runner is about to get away
        const closing = (o.vx * (c.x - o.x) + o.vy * (c.y - o.y)) / d;
        const runnerAway = (c.vx * (c.x - o.x) + c.vy * (c.y - o.y)) / d;
        if (runnerAway >= closing - 0.2) {
          o.lunged = true;
          this.tryTackle(o, c, false, 0.92, true);
          if (this.phase !== 'live') return;
          continue;
        }
      }
      if (d < 1.05) {
        if (o.engaged >= 0) {
          // arm tackle from a blocked defender
          if (this.rng.chance(dt * 1.5)) this.tryTackle(o, c, false, 0.2);
          continue;
        }
        this.tryTackle(o, c, false);
        if (this.phase !== 'live') return;
      }
    }
  }

  private tryTackle(t: Actor, c: Actor, sackAttempt: boolean, mult = 1, lunge = false) {
    t.tackleCd = 0.5;
    const tr = t.sp.r;
    const cr = c.sp.r;
    const tSkill = t.side === OFF ? this.setup.skill.off : this.setup.skill.def;
    const cSkill = c.side === OFF ? this.setup.skill.off : this.setup.skill.def;
    let p = 0.86 + (tr.tak - cr.elu) * 0.006 + (tr.str - cr.str) * 0.0025 + tSkill * 0.05 - cSkill * 0.04;
    if (sackAttempt) p = 0.8 + (tr.tak - 60) * 0.003 - (cr.elu - 50) * 0.003;
    // gang tackles
    let helpers = 0;
    for (const o of this.actors) if (o.side === t.side && o.i !== t.i && o.mode !== 'down' && o.engaged < 0 && dist(o.x, o.y, c.x, c.y) < 1.4) helpers++;
    p += helpers * 0.12;
    if (c.jukeT > 0) p *= c.jukeGood ? 0.3 + (100 - cr.elu) * 0.004 + tr.awr * 0.002 : 1.08;
    // hit from behind on a faster runner is harder
    const relV = c.vx * this.carrierDir;
    if (relV > 6 && (t.x - c.x) * this.carrierDir < 0) p -= 0.05;
    p = clamp(p * mult, 0.1, 0.97);
    if (this.rng.chance(p)) {
      this.tackleCarrier(c, t);
    } else {
      if (lunge || this.rng.chance(0.4)) {
        t.stun = 0.6;
        t.mode = 'down';
        t.downT = 0.6;
        t.anim = 'down';
      } else {
        t.stun = 0.35; // stumbles but stays on his feet
      }
      c.vx *= 0.75;
      c.vy *= 0.75;
      if (c.i === this.userActor || this.rng.chance(0.3)) this.popup(c.jukeT > 0 ? 'JUKE!' : 'BROKEN TACKLE!', c.x, c.y - 2);
    }
  }

  tackleCarrier(c: Actor, t: Actor | null) {
    const s = this.scrim;
    // forward progress
    // forward progress: momentum and strength carry the runner forward through contact
    const fwdSpeed = Math.max(0, c.vx * this.carrierDir);
    const fall = t ? clamp(0.5 + fwdSpeed * 0.13 + (c.sp.r.str - t.sp.r.str) * 0.015, 0, 2.4) : 0;
    const endX = c.x + this.carrierDir * fall;
    if (t) {
      this.stat(t.sp.pid, 'tkl', 1);
      t.anim = 'down';
      t.mode = 'down';
      t.downT = 99;
    }
    c.anim = 'down';
    c.mode = 'down';
    c.downT = 99;
    // fumble?
    if (t) {
      const hard = clamp((t.sp.r.str + t.sp.r.tak) / 160, 0.3, 1.2);
      let pf = (0.0035 + (75 - c.sp.r.car) * 0.00018) * hard;
      if (this.setup.weather === 'rain' || this.setup.weather === 'snow') pf *= 1.5;
      if (c.i === this.qb && this.ball.holder === this.qb && !this.carrierActor()) pf *= 2.2; // strip sack
      if (this.rng.chance(clamp(pf, 0.002, 0.06))) {
        const sackFumble = !this.carrierActor();
        if (sackFumble) {
          this.stat(t.sp.pid, 'sacks', 1);
          this.stat(c.sp.pid, 'sacked', 1);
        }
        this.fumble(c, t, c.x, c.y);
        return;
      }
    }
    // sack
    if (s && c.i === this.qb && !this.carrierActor() && c.x < this.los) {
      if (t) this.stat(t.sp.pid, 'sacks', 1);
      this.stat(c.sp.pid, 'sacked', 1);
      this.sackCredit = t ? t.i : -1;
      this.popup('SACKED!', c.x, c.y - 2);
      if (c.x <= 0) {
        this.end({ reason: 'safety', endX: c.x, endY: c.y }, 'Sacked in the end zone - SAFETY', 'SAFETY');
        return;
      }
      this.end({ reason: 'sack', endX: endX, endY: c.y }, `Sacked for a loss of ${Math.round(this.los - endX)}`, 'SACK');
      return;
    }
    // safety on offense tackled in own end zone
    if (this.carrierDir === 1 && endX <= 0 && c.side === OFF) {
      if (this.setup.kind !== 'scrimmage') {
        this.end({ reason: 'touchback', endX: -1, endY: c.y }, 'Downed in the end zone - touchback', 'TOUCHBACK');
        return;
      }
      if (this.carrierHow === 'catch' || this.carrierHow === 'rush' || this.carrierHow === 'qbrun') {
        this.end({ reason: 'safety', endX: endX, endY: c.y }, 'Tackled in the end zone - SAFETY', 'SAFETY');
        return;
      }
    }
    if (this.carrierDir === -1 && endX >= 100) {
      this.end({ reason: 'touchback', endX: 100, endY: c.y }, 'Downed in the end zone - touchback', 'TOUCHBACK');
      return;
    }
    this.end({ reason: 'tackle', endX, endY: c.y }, 'Tackled', '');
  }

  private touchdown(c: Actor) {
    c.anim = 'celebrate';
    c.mode = 'idle';
    this.popup('TOUCHDOWN!', c.x, c.y - 2);
    this.end({ reason: 'td', endX: this.carrierDir === 1 ? 100 : 0, endY: c.y }, 'Touchdown!', 'TOUCHDOWN!');
  }

  // ------------------------------------------------------------------ end of play

  private end(e: { reason: EndReason; endX: number; endY: number }, summary: string, big: string) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    const scrim = this.scrim;
    const c = this.carrierActor();
    const isTurnover = this.turnoverHappened || (c !== null && c.side === DEF);
    const out: SimOutcome = {
      endX: e.endX,
      endY: e.endY,
      reason: e.reason,
      incomplete: e.reason === 'incomplete' || e.reason === 'spike',
      outOfBounds: e.reason === 'oob',
      turnover: isTurnover,
      offTd: e.reason === 'td' && !isTurnover,
      defTd: e.reason === 'td' && isTurnover,
      safety: e.reason === 'safety',
      touchback: e.reason === 'touchback',
      elapsed: Math.max(1, this.t),
      summary,
      big,
      kickDist: this.kickDist,
    };
    // INT downed in the end zone (defense running toward x=0 got stopped at >=100)
    if (isTurnover && e.reason === 'touchback') out.touchback = true;
    this.outcome = out;
    // yardage stats
    if (scrim && c && !out.incomplete) {
      const gain = Math.round(e.endX - this.los);
      if (c.side === OFF) {
        if (this.carrierHow === 'catch') {
          this.stat(c.sp.pid, 'recYds', gain);
          this.stat(c.sp.pid, 'recLng', gain);
          const qb = this.actors[this.lastPasser];
          if (qb) {
            this.stat(qb.sp.pid, 'pYds', gain);
            this.stat(qb.sp.pid, 'pLng', gain);
            if (out.offTd) this.stat(qb.sp.pid, 'pTd', 1);
          }
          if (out.offTd) this.stat(c.sp.pid, 'recTd', 1);
          out.passYds = gain;
        } else if (this.carrierHow === 'rush' || this.carrierHow === 'qbrun') {
          this.stat(c.sp.pid, 'rYds', gain);
          this.stat(c.sp.pid, 'rLng', gain);
          if (out.offTd) this.stat(c.sp.pid, 'rTd', 1);
        }
      } else if (out.defTd) {
        this.stat(c.sp.pid, 'defTd', 1);
      }
    }
    if (!scrim && c && c.side === OFF) {
      const yds = Math.round(e.endX - this.ball.tx);
      this.stat(c.sp.pid, 'krYds', Math.max(0, yds));
      if (out.offTd) this.stat(c.sp.pid, 'krTd', 1);
    }
    // winners celebrate, everyone eases up
    if (out.offTd || out.defTd) {
      for (const a of this.actors) if ((a.side === OFF) === out.offTd && a.mode !== 'down') a.anim = 'celebrate';
    }
    for (const a of this.actors) {
      if (a.engaged >= 0) a.engaged = -1;
    }
    if (this.ball.state === 'held' && e.reason !== 'incomplete') {
      // ball stays with holder
    }
    void this.sackCredit;
    void this.endHold;
  }

  /** True once the post-play animation has played out. */
  get finished() {
    return this.phase === 'over' && this.overT > 1.1;
  }

  /** Run the whole play without rendering (for AI drives / tests). */
  runHeadless(maxT = 20) {
    if (this.phase === 'presnap') this.snap();
    const dt = 1 / 30;
    let guard = 0;
    while (this.phase !== 'over' && guard++ < maxT * 30) this.step(dt, NO_INPUT);
    if (!this.outcome) {
      const c = this.carrierActor() ?? this.actors[this.ball.holder] ?? this.actors[this.qb];
      if (c) this.tackleCarrier(c, null);
    }
    return this.outcome!;
  }
}

const desired = new Map<number, [number, number]>();
