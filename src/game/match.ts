// Orchestrates one playable game: rules engine + physics plays + AI coaching +
// kicking minigame + box score. The React game screen drives it and renders it.
import { Rng, clamp } from '../core/rng';
import type { ScheduledGame, Weather } from '../core/types';
import type { Career } from '../league/career';
import { BoxCollector } from '../league/boxscore';
import { buildGameRoster, type GameRoster } from '../league/depth';
import { continueStatSim } from '../league/quicksim';
import { difficultyBoost } from '../league/season';
import { shortName } from '../league/players';
import type { Settings } from '../save/settings';
import {
  applyResult, applyRunoff, callTimeout, fgDistance, newGame, other, quarterText, clockText,
  type GameState, type KickResult, type ScrimmageResult, type Side,
} from './rules';
import { decideOffense, fgMakeProb, maxFgRange, pickDefense, pickPlay, shouldKneel, wantsOnside, wantsTwoPoint, type OffDecision } from './ai';
import { DEF_BY_ID, PLAY_BY_ID, type DefCall, type PlayDef } from './playbook';
import { HASH_BOT, HASH_TOP, MID_Y, NO_INPUT, PACE, PlaySim, type PlayInput, type SimOutcome, type ReturnSetup } from './sim';

export type Stage =
  | 'coin' | 'playcall' | 'defcall' | 'presnap' | 'live' | 'result' | 'kick' | 'kickflight'
  | 'pat' | 'kickoffChoice' | 'halftime' | 'final';

export interface KickMeter {
  kind: 'fg' | 'xp' | 'punt' | 'kickoff';
  phase: 'aim' | 'power' | 'done';
  aim: number;
  aimDir: number;
  aimLocked: number;
  power: number;
  powerDir: number;
  powerLocked: number;
  distance: number;
  speed: number;
}

export interface KickFlight {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  peak: number;
  good: boolean;
  label: string;
  kickerSide: Side;
}

export interface Banner {
  text: string;
  sub: string;
  color: string;
  t: number;
}

export interface MatchSnapshot {
  gameId: number;
  g: GameState;
  box: { players: [number, { teamId: number; s: Record<string, number> }][]; team: BoxCollector['team']; quarters: BoxCollector['quarters']; keyPlays: string[] };
  rng: number;
  wind: number;
  halftimeShown: boolean;
  otTossed: boolean;
  ballY: number;
}

const AI_SKILL = { rookie: -0.8, pro: 0, allpro: 0.45, legend: 0.9 };

export class Match {
  c: Career;
  game: ScheduledGame;
  settings: Settings;
  g: GameState;
  box: BoxCollector;
  rng: Rng;
  userSide: Side;
  rosters: [GameRoster, GameRoster];
  stage: Stage = 'coin';
  sim: PlaySim | null = null;
  play: PlayDef | null = null;
  defCall: DefCall | null = null;
  pendingAi: { decision: OffDecision; play: PlayDef | null } | null = null;
  meter: KickMeter | null = null;
  flight: KickFlight | null = null;
  banner: Banner | null = null;
  resultT = 0;
  weather: Weather;
  wind: number;
  ballY = MID_Y;
  sounds: string[] = [];
  log: string[] = [];
  halftimeShown = false;
  otTossed = false;
  coinResult: string | null = null;
  lastOutcome: SimOutcome | null = null;
  twoPointTry = false;
  private flightApply: (() => void) | null = null;
  private returnKind: 'kickoff' | 'punt' | null = null;
  private simSpeed = 1;
  time = 0;
  /** Which side was on offense (or receiving) in the current physics sim. */
  simOff: Side = 0;
  /** True when the pre-snap runoff has already been applied for the coming snap. */
  runoffDone = false;

  constructor(c: Career, game: ScheduledGame, settings: Settings, weather: Weather, snap?: MatchSnapshot) {
    this.c = c;
    this.game = game;
    this.settings = settings;
    this.weather = weather;
    this.userSide = game.home === c.userTeam ? 0 : 1;
    this.rng = new Rng((c.seed ^ (game.id * 7919)) >>> 0);
    this.wind = weather === 'wind' ? this.rng.range(-1.6, 1.6) : weather === 'dome' ? 0 : this.rng.range(-0.35, 0.35);
    const boost = difficultyBoost(c) * 0.5;
    const oc = c.staff.find((s) => s.role === 'OC')?.rating ?? 2;
    const dc = c.staff.find((s) => s.role === 'DC')?.rating ?? 2;
    const homeAdv = 1 + c.facilities.stadium * 0.3;
    const mods = (side: Side) => {
      const user = side === this.userSide;
      const home = side === 0 ? (user ? homeAdv : 1.2) : 0;
      if (user) return { off: home + (oc - 3) * 0.8, def: home + (dc - 3) * 0.8 };
      return { off: home + boost, def: home + boost };
    };
    this.rosters = [buildGameRoster(c, game.home, mods(0)), buildGameRoster(c, game.away, mods(1))];
    this.box = new BoxCollector(game.home, game.away);
    this.g = newGame({ quarterLength: settings.quarterMinutes * 60, playoff: !!game.playoff, openingKicker: 0 });
    if (snap) this.restore(snap);
  }

  // ------------------------------------------------------------------ helpers

  teamId(side: Side) {
    return side === 0 ? this.game.home : this.game.away;
  }
  team(side: Side) {
    return this.c.teams[this.teamId(side)];
  }
  get userOnOffense() {
    return this.g.possession === this.userSide;
  }
  private sideOfPid(pid: number): Side {
    return this.rosters[0].all.some((p) => p.id === pid) ? 0 : 1;
  }
  private sound(s: string) {
    this.sounds.push(s);
  }
  private say(text: string, sub = '', color = '#ffffff') {
    this.banner = { text, sub, color, t: 0 };
  }
  private kicker(side: Side) {
    return this.rosters[side].lineup.k[0];
  }
  aiSkill() {
    return AI_SKILL[this.c.difficulty];
  }

  /** The user's kicker's FG range, used to enable the FG option. */
  fgRange(side: Side = this.userSide) {
    const k = this.kicker(side);
    return maxFgRange(k?.r.kpw ?? 60, k?.r.kac ?? 60);
  }

  // ------------------------------------------------------------------ coin toss

  callCoin(call: 'heads' | 'tails') {
    const flip = this.rng.chance(0.5) ? 'heads' : 'tails';
    const won = flip === call;
    let receiver: Side;
    if (won) receiver = this.userSide;
    else receiver = other(this.userSide); // AI elects to receive
    this.coinResult = `${flip.toUpperCase()}! ${won ? 'You won the toss and will receive.' : `${this.team(receiver).abbr} won the toss and will receive.`}`;
    this.g.openingKicker = other(receiver);
    this.g.possession = other(receiver);
    this.sound('whistle');
    this.next();
  }

  // ------------------------------------------------------------------ flow

  /** Decide what happens next based on the rules state. */
  next() {
    const g = this.g;
    this.sim = this.stage === 'live' || this.stage === 'result' ? this.sim : this.sim;
    this.meter = null;
    this.flight = null;
    if (g.phase === 'final') {
      this.stage = 'final';
      this.sound('final');
      return;
    }
    if (g.quarter === 3 && !this.halftimeShown) {
      this.halftimeShown = true;
      this.stage = 'halftime';
      return;
    }
    if (g.quarter >= 5 && !this.otTossed) {
      this.otTossed = true;
      const receiver: Side = this.rng.chance(0.5) ? 0 : 1;
      g.possession = other(receiver);
      g.phase = 'kickoff';
      g.ballOn = 35;
      this.say('OVERTIME', `${this.team(receiver).abbr} win the toss and receive`, '#ffd23f');
    }
    this.sim = null;
    if (g.phase === 'kickoff' || g.phase === 'freekick') {
      if (g.possession === this.userSide) {
        if (g.phase === 'freekick') this.startMeter('kickoff');
        else this.stage = 'kickoffChoice';
      } else this.aiKickoff();
      return;
    }
    if (g.phase === 'pat') {
      if (g.possession === this.userSide) this.stage = 'pat';
      else this.aiPat();
      return;
    }
    // scrimmage
    if (g.possession === this.userSide) {
      this.twoPointTry = false;
      this.stage = 'playcall';
      return;
    }
    this.aiOffense();
  }

  private ballYForSnap() {
    return clamp(this.ballY, HASH_TOP, HASH_BOT);
  }

  // ------------------------------------------------------------------ user offense

  canFieldGoal() {
    return this.g.phase === 'scrimmage' && fgDistance(this.g.ballOn) <= this.fgRange() + 8;
  }

  userTimeout(): boolean {
    if (!this.g.clockRunning || this.runoffDone) return false;
    const ok = callTimeout(this.g, this.userSide);
    if (ok) {
      this.say('TIMEOUT', `${this.team(this.userSide).abbr} - ${this.g.timeouts[this.userSide]} left`, '#9be8ff');
      this.sound('whistle');
    }
    return ok;
  }

  /** User picks an offensive play (or a special) from the play-call screen. */
  choosePlay(id: string) {
    const g = this.g;
    if (id === 'punt') return this.startMeter('punt');
    if (id === 'fg') return this.startMeter('fg');
    const play = PLAY_BY_ID[id];
    if (!play) return;
    if (g.phase === 'scrimmage' && !this.runoffDone) {
      this.aiDefenseTimeout();
      const kneel = play.id === 'kneel';
      const q = g.quarter;
      if (applyRunoff(g, kneel ? 'kneel' : 'normal')) {
        this.periodEndedBeforeSnap(q);
        return;
      }
      this.runoffDone = true;
    }
    this.play = play;
    const def = pickDefense(g, this.team(other(this.userSide)).aggression, 'balanced', this.rng);
    this.defCall = def;
    this.startScrimmage(play, def, true);
  }

  private periodEndedBeforeSnap(prevQuarter: number) {
    this.say(prevQuarter === 2 ? 'HALFTIME' : prevQuarter >= 4 ? 'END OF REGULATION' : `END OF ${quarterText(prevQuarter)}`, '', '#ffd23f');
    this.sound('whistle');
    this.stage = 'result';
    this.resultT = 0;
  }

  private startScrimmage(play: PlayDef, def: DefCall, userOffense: boolean) {
    const g = this.g;
    const off = g.possession;
    const two = g.phase === 'pat';
    const los = two ? 98 : g.ballOn;
    const offL = this.rosters[off].lineup;
    const defL = this.rosters[other(off)].lineup;
    const skill = this.aiSkill();
    const scale = g.quarterLength / 900;
    const diff = g.score[off] - g.score[other(off)];
    this.simOff = off;
    this.sim = new PlaySim({
      kind: 'scrimmage', los, ballY: this.ballYForSnap(), toGo: two ? 2 : g.toGo, down: two ? 4 : g.down, play, defCall: def,
      offense: offL, defense: defL, userControls: userOffense,
      skill: userOffense ? { off: 0, def: skill } : { off: skill * 0.6, def: 0 },
      weather: this.weather, seed: this.rng.int(1, 2 ** 30),
      twoPoint: two, clockUrgent: (g.quarter === 2 || g.quarter >= 4) && g.clock < 120 * scale && diff <= 0,
    });
    this.play = play;
    this.defCall = def;
    this.stage = userOffense ? 'presnap' : 'presnap';
    this.simSpeed = 1;
    if (!userOffense) {
      // AI offense: snap after a short beat; speed depends on settings
      const view = this.settings.defenseView;
      this.simSpeed = view === 'fast' ? 2.2 : 1;
      if (view === 'skip' || this.autoDrive) {
        this.sim.runHeadless();
        this.resolveScrimmage();
        return;
      }
    }
  }

  /** Back to the play-call screen from the line of scrimmage (no extra clock runoff). */
  changePlay() {
    if (this.stage !== 'presnap' || !this.userOnOffense) return;
    this.sim = null;
    this.stage = 'playcall';
  }

  snap() {
    if (this.stage !== 'presnap' || !this.sim) return;
    this.runoffDone = false;
    this.sim.snap();
    this.stage = 'live';
    this.sound('snap');
    if (this.sim.phase === 'over') {
      // kneel / spike resolve immediately
    }
  }

  // ------------------------------------------------------------------ AI offense / user defense

  private aiTendencies(side: Side) {
    const t = this.team(side);
    const k = this.kicker(side);
    return { passBias: t.passBias, aggression: t.aggression, kickRange: maxFgRange(k?.r.kpw ?? 60, k?.r.kac ?? 60) };
  }

  private aiDefenseTimeout() {
    const g = this.g;
    const def = other(g.possession);
    if (def === this.userSide) return;
    const diff = g.score[def] - g.score[g.possession];
    const scale = g.quarterLength / 900;
    if (g.clockRunning && g.quarter >= 4 && g.clock < 150 * scale && diff < 0 && diff >= -16 && g.timeouts[def] > 0) {
      callTimeout(g, def);
      this.say('TIMEOUT', `${this.team(def).abbr} stop the clock`, '#9be8ff');
    }
  }

  private aiOffense() {
    const g = this.g;
    const off = g.possession;
    // AI offense uses its own timeouts in a two-minute drill
    const scale = g.quarterLength / 900;
    const od = g.score[off] - g.score[other(off)];
    if (g.clockRunning && (g.quarter === 2 || g.quarter >= 4) && g.clock < 60 * scale && od <= 0 && g.timeouts[off] > 0 && !shouldKneel(g)) {
      callTimeout(g, off);
    }
    const decision = decideOffense(g, this.aiTendencies(off), this.rng);
    if (decision === 'punt') return this.aiPunt();
    if (decision === 'fg') return this.aiFieldGoal();
    const play = pickPlay(g, decision, this.rng);
    this.pendingAi = { decision, play };
    if (this.settings.defenseView === 'drive' && !this.autoDrive) {
      // "sim drive" mode: the whole possession plays out at once
      this.stage = 'defcall';
      this.simDrive();
      return;
    }
    if (this.settings.defenseMode === 'call' && !this.autoDrive && decision !== 'kneel' && decision !== 'spike') {
      this.stage = 'defcall';
      return;
    }
    this.chooseDefense(null);
  }

  /** User (or auto) picks the defensive call against the AI's pending play. */
  chooseDefense(id: string | null) {
    const g = this.g;
    const pend = this.pendingAi;
    if (!pend || !pend.play) return;
    this.aiDefenseTimeoutUser();
    const kneel = pend.play.id === 'kneel';
    if (g.phase === 'scrimmage') {
      const q = g.quarter;
      if (applyRunoff(g, kneel ? 'kneel' : 'normal')) {
        this.pendingAi = null;
        this.periodEndedBeforeSnap(q);
        return;
      }
    }
    const def = id ? DEF_BY_ID[id] : pickDefense(g, 0.5, this.c.strategy.def, this.rng);
    this.pendingAi = null;
    this.startScrimmage(pend.play, def, false);
    if (this.stage === 'presnap') {
      this.sim!.snap();
      this.stage = 'live';
      this.sound('snap');
    }
  }

  private aiDefenseTimeoutUser() {
    /* user manages their own timeouts on defense */
  }

  // ------------------------------------------------------------------ kicking

  startMeter(kind: KickMeter['kind']) {
    const g = this.g;
    const dist = kind === 'xp' ? 33 : kind === 'fg' ? fgDistance(g.ballOn) : 0;
    if ((kind === 'fg' || kind === 'punt') && !this.runoffDone) {
      this.aiDefenseTimeout();
      const q = g.quarter;
      if (g.phase === 'scrimmage' && applyRunoff(g)) {
        this.periodEndedBeforeSnap(q);
        return;
      }
    }
    this.runoffDone = false;
    const k = this.kicker(this.userSide);
    const acc = k?.r.kac ?? 60;
    const speed = (kind === 'fg' ? 1.2 + dist / 45 : kind === 'xp' ? 1.1 : 1) * (1.25 - acc / 250) * { rookie: 0.8, pro: 1, allpro: 1.12, legend: 1.25 }[this.c.difficulty];
    this.meter = { kind, phase: 'aim', aim: 0, aimDir: 1, aimLocked: 0, power: 0, powerDir: 1, powerLocked: 0, distance: dist, speed };
    this.stage = 'kick';
  }

  kickTap() {
    const m = this.meter;
    if (!m || this.stage !== 'kick') return;
    if (m.phase === 'aim') {
      m.aimLocked = m.aim;
      m.phase = 'power';
      this.sound('tick');
      return;
    }
    if (m.phase === 'power') {
      m.powerLocked = m.power;
      m.phase = 'done';
      this.sound('kick');
      this.executeUserKick(m);
    }
  }

  private updateMeter(dt: number) {
    const m = this.meter;
    if (!m) return;
    if (m.phase === 'aim') {
      m.aim += m.aimDir * dt * m.speed * 1.6;
      if (m.aim > 1) {
        m.aim = 1;
        m.aimDir = -1;
      } else if (m.aim < -1) {
        m.aim = -1;
        m.aimDir = 1;
      }
    } else if (m.phase === 'power') {
      m.power += m.powerDir * dt * 1.15 * (0.8 + m.speed * 0.25);
      if (m.power > 1) {
        m.power = 1;
        m.powerDir = -1;
      } else if (m.power < 0) {
        m.power = 0;
        m.powerDir = 1;
      }
    }
  }

  private executeUserKick(m: KickMeter) {
    const side = this.userSide;
    const k = this.kicker(side);
    const kpw = k?.r.kpw ?? 60;
    const kac = k?.r.kac ?? 60;
    if (m.kind === 'fg' || m.kind === 'xp') {
      const dist = m.distance;
      const maxD = 46 + (kpw - 50) * 0.55;
      const carry = m.powerLocked * maxD;
      const noise = this.rng.normal(0, (100 - kac) / 70);
      const lateral = (m.aimLocked * 6 + this.wind * (dist / 40) + noise) * (dist / 35);
      const good = carry >= dist - 0.5 && Math.abs(lateral) <= 3.05;
      this.kickFlight(side, dist, carry, lateral, good, m.kind);
      return;
    }
    if (m.kind === 'punt' || m.kind === 'kickoff') {
      this.startReturn(m.kind, side, { kickPower: 0.55 + m.powerLocked * 0.45, aimY: clamp(m.aimLocked + this.wind * 0.15, -1.2, 1.2) });
    }
  }

  /** Animate a field goal / PAT and then apply it. */
  private kickFlight(kicker: Side, dist: number, carry: number, lateral: number, good: boolean, kind: 'fg' | 'xp') {
    const g = this.g;
    const ballOn = kind === 'xp' ? 85 : g.ballOn;
    const spotX = ballOn - 7;
    const endX = spotX + Math.min(carry, dist + 12);
    this.flight = {
      x0: spotX, y0: this.ballYForSnap(), x1: endX, y1: MID_Y + lateral * 1.2, t: 0, dur: 1.4 + Math.min(carry, 60) * 0.012,
      peak: 6 + carry * 0.12, good, label: kind === 'xp' ? 'EXTRA POINT' : `${dist}-YARD ATTEMPT`, kickerSide: kicker,
    };
    this.stage = 'kickflight';
    this.sound('kick');
    const k = this.kicker(kicker);
    this.flightApply = () => {
      if (kind === 'xp') {
        if (k) this.box.add(k.pid, kicker, { xpA: 1, xpM: good ? 1 : 0 });
        if (good) this.box.points(g, kicker, 1);
        applyResult(g, { kind: 'pat', points: good ? 1 : 0 });
        this.say(good ? 'GOOD!' : 'NO GOOD', good ? 'Extra point' : 'The kick is no good', good ? '#7dff7a' : '#ff6b6b');
      } else {
        if (k) this.box.add(k.pid, kicker, { fgA: 1, fgM: good ? 1 : 0, fgLng: good ? dist : 0 });
        if (good) {
          this.box.points(g, kicker, 3);
          this.box.key(g, `${k ? k.name : 'Kicker'} ${dist}-yd field goal (${this.team(kicker).abbr})`);
        }
        const q = g.quarter;
        applyResult(g, { kind: 'fg', good, elapsed: 4 });
        this.say(good ? "IT'S GOOD!" : 'NO GOOD!', `${dist}-yard field goal`, good ? '#7dff7a' : '#ff6b6b');
        if (g.quarter !== q) this.quarterNote(q);
      }
      this.sound(good ? 'cheer' : 'groan');
      this.ballY = MID_Y;
      this.stage = 'result';
      this.resultT = 0;
    };
  }

  private aiFieldGoal() {
    const g = this.g;
    const side = g.possession;
    this.aiDefenseTimeout();
    const q = g.quarter;
    if (applyRunoff(g)) {
      this.periodEndedBeforeSnap(q);
      return;
    }
    const k = this.kicker(side);
    const dist = fgDistance(g.ballOn);
    const good = this.rng.chance(fgMakeProb(dist, k?.r.kpw ?? 60, k?.r.kac ?? 60, this.weather));
    const lateral = good ? this.rng.range(-1.5, 1.5) : this.rng.chance(0.5) ? this.rng.range(3.3, 6) : -this.rng.range(3.3, 6);
    const carry = good ? dist + 6 : this.rng.chance(0.3) ? dist - 4 : dist + 3;
    this.kickFlight(side, dist, carry, good ? lateral : carry < dist ? 0 : lateral, good, 'fg');
  }

  private aiPat() {
    const g = this.g;
    const side = g.possession;
    if (wantsTwoPoint(g, this.rng, this.team(side).aggression)) {
      const play = pickPlay({ ...g, toGo: 2, ballOn: 98 }, this.rng.chance(0.55) ? 'pass' : 'run', this.rng);
      this.pendingAi = { decision: 'pass', play };
      this.say('2-POINT TRY', `${this.team(side).abbr} go for two`, '#ffd23f');
      if (this.settings.defenseMode === 'call' && !this.autoDrive) {
        this.stage = 'defcall';
        return;
      }
      this.chooseDefense(null);
      return;
    }
    const k = this.kicker(side);
    const good = this.rng.chance(fgMakeProb(33, k?.r.kpw ?? 60, k?.r.kac ?? 60, this.weather) + 0.02);
    this.kickFlight(side, 33, good ? 40 : 36, good ? this.rng.range(-1, 1) : 4.2, good, 'xp');
  }

  choosePat(kind: 'xp' | '2pt') {
    if (kind === 'xp') return this.startMeter('xp');
    this.twoPointTry = true;
    this.stage = 'playcall';
  }

  chooseKickoff(kind: 'normal' | 'onside') {
    if (kind === 'onside') {
      const k = this.kicker(this.userSide);
      const rec = this.rng.chance(0.1 + ((k?.r.kac ?? 60) - 60) * 0.002);
      this.resolveOnside(this.userSide, rec);
      return;
    }
    this.startMeter('kickoff');
  }

  private resolveOnside(kicker: Side, rec: boolean) {
    const g = this.g;
    const res: KickResult = { kind: 'kickoff', recvBallOn: 55, returnTd: false, kickingRecovers: rec, outOfBounds: false, elapsed: 3, kickBallOn: 46 };
    const q = g.quarter;
    applyResult(g, res);
    this.say(rec ? 'ONSIDE RECOVERED!' : 'ONSIDE FAILS', rec ? `${this.team(kicker).abbr} keep the ball` : `${this.team(other(kicker)).abbr} recover`, rec ? '#7dff7a' : '#ff6b6b');
    this.box.key(g, rec ? `${this.team(kicker).abbr} recover an onside kick` : `${this.team(other(kicker)).abbr} recover an onside kick`);
    if (g.quarter !== q) this.quarterNote(q);
    this.ballY = MID_Y;
    this.stage = 'result';
    this.resultT = 0;
  }

  private aiKickoff() {
    const g = this.g;
    const kicker = g.possession;
    if (g.phase === 'kickoff' && wantsOnside(g)) {
      const rec = this.rng.chance(0.12);
      this.resolveOnside(kicker, rec);
      return;
    }
    this.startReturn('kickoff', kicker, {});
  }

  private aiPunt() {
    const g = this.g;
    this.aiDefenseTimeout();
    const q = g.quarter;
    if (applyRunoff(g)) {
      this.periodEndedBeforeSnap(q);
      return;
    }
    this.startReturn('punt', g.possession, {});
  }

  /** Kickoffs and punts are played out with the physics sim from the receiving team's view. */
  private startReturn(kind: 'kickoff' | 'punt', kicker: Side, opts: { kickPower?: number; aimY?: number }) {
    const g = this.g;
    const recv = other(kicker);
    const free = g.phase === 'freekick';
    const kickFrom = kind === 'punt' ? 100 - g.ballOn : free ? 80 : 65;
    const setup: ReturnSetup = {
      kind, kickFrom, receiving: this.rosters[recv].lineup, kicking: this.rosters[kicker].lineup,
      userControls: recv === this.userSide, skill: recv === this.userSide ? { off: 0, def: this.aiSkill() * 0.6 } : { off: this.aiSkill() * 0.5, def: 0 },
      weather: this.weather, seed: this.rng.int(1, 2 ** 30), kickPower: opts.kickPower, aimY: opts.aimY, touchbackSpot: kind === 'punt' ? 20 : 30,
    };
    this.simOff = recv;
    this.sim = new PlaySim(setup);
    this.returnKind = kind;
    this.stage = 'live';
    this.simSpeed = recv === this.userSide ? 1 : this.settings.defenseView === 'fast' ? 1.8 : 1;
    this.sound('kick');
    if (recv !== this.userSide && this.settings.defenseView === 'skip') {
      this.sim.runHeadless();
      this.resolveReturn();
    }
  }

  // ------------------------------------------------------------------ per-frame update

  update(dt: number, input: PlayInput = NO_INPUT) {
    this.time += dt;
    if (this.banner) this.banner.t += dt;
    if (this.stage === 'kick') this.updateMeter(dt);
    if (this.stage === 'kickflight' && this.flight) {
      this.flight.t += dt;
      if (this.flight.t >= this.flight.dur + 0.5) {
        const f = this.flightApply;
        this.flightApply = null;
        f?.();
      }
      return;
    }
    if (this.stage === 'presnap' && this.sim) {
      this.sim.step(dt, NO_INPUT);
      return;
    }
    if (this.stage === 'live' && this.sim) {
      const speed = this.simSpeed * this.settings.gameSpeed * PACE;
      const steps = Math.max(1, Math.ceil((dt * speed) / (1 / 60)));
      const sub = (dt * speed) / steps;
      for (let i = 0; i < steps; i++) {
        this.sim.step(sub, i === 0 ? input : { ...input, juke: false, dive: false, tuck: false, throwAt: null, kneel: false, fairCatch: false, scoot: 0 });
        this.collectSimSounds();
        if (this.sim.finished) break;
      }
      if (this.sim.finished) {
        if (this.returnKind) this.resolveReturn();
        else this.resolveScrimmage();
      }
      return;
    }
    if (this.stage === 'result') {
      this.resultT += dt;
      if (this.resultT > 2.4) this.next();
    }
  }

  /** Tap to skip the result banner. */
  continueResult() {
    if (this.stage === 'result' && this.resultT > 0.35) this.next();
  }

  private lastEventIdx = 0;
  private lastPopupIdx = 0;
  private collectSimSounds() {
    const sim = this.sim!;
    while (this.lastEventIdx < sim.events.length) {
      const e = sim.events[this.lastEventIdx++];
      if (e.type === 'throw') this.sound('throw');
      if (e.type === 'catch') this.sound('catch');
      if (e.type === 'int') this.sound('int');
      if (e.type === 'fumble') this.sound('fumble');
    }
    while (this.lastPopupIdx < sim.popups.length) {
      const p = sim.popups[this.lastPopupIdx++];
      if (p.text.includes('TACKLE') || p.text.includes('JUKE')) this.sound('juke');
    }
  }

  // ------------------------------------------------------------------ resolution

  private resolveScrimmage() {
    const sim = this.sim!;
    const o = sim.outcome!;
    this.lastOutcome = o;
    this.lastEventIdx = 0;
    this.lastPopupIdx = 0;
    const g = this.g;
    const off = g.possession;
    const def = other(off);
    const two = g.phase === 'pat';
    const los = two ? 98 : g.ballOn;
    const downBefore = g.down;
    const toGoBefore = g.toGo;
    const q = g.quarter;
    // stats
    this.box.addMap(sim.stats, (pid) => this.sideOfPid(pid));
    const gain = Math.round(o.endX - los);
    const T = this.box.team;
    if (!two) {
      T[off].plays++;
      if (downBefore === 3) T[off].thirdAtt++;
      if (o.reason === 'sack') {
        T[def].sacks++;
        T[off].passYds += gain;
        T[off].yds += gain;
      } else if (!o.turnover && !o.incomplete) {
        T[off].yds += gain;
        if (sim.carrierHow === 'catch') T[off].passYds += gain;
        else T[off].rushYds += gain;
        if (gain >= toGoBefore || o.offTd) {
          T[off].firstDowns++;
          if (downBefore === 3) T[off].thirdConv++;
        }
      }
      if (o.turnover) T[off].turnovers++;
      T[off].top += o.elapsed + (g.clockRunning ? 10 : 0);
    }
    const res: ScrimmageResult = {
      kind: 'scrimmage', endX: o.endX, incomplete: o.incomplete, outOfBounds: o.outOfBounds, turnover: o.turnover,
      offTd: o.offTd, defTd: o.defTd, safety: o.safety, touchback: o.touchback, elapsed: o.elapsed,
      spike: o.reason === 'spike', kneel: o.reason === 'kneel',
    };
    const offAbbr = this.team(off).abbr;
    const defAbbr = this.team(def).abbr;
    // headline
    let text = '';
    let sub = o.summary;
    let color = '#ffffff';
    const carrier = sim.carrier >= 0 ? sim.actors[sim.carrier] : null;
    const passer = sim.lastPasser >= 0 ? sim.actors[sim.lastPasser] : null;
    if (two) {
      const ok = o.offTd && !o.turnover;
      text = ok ? 'CONVERSION GOOD!' : 'NO GOOD';
      color = ok ? '#7dff7a' : '#ff6b6b';
      sub = ok ? '2 points' : 'Two-point try fails';
      if (ok) this.box.points(g, off, 2);
      this.sound(ok ? 'cheer' : 'groan');
    } else if (o.offTd) {
      text = 'TOUCHDOWN!';
      color = '#ffd23f';
      const who = carrier ? carrier.sp.name : 'Offense';
      sub = sim.carrierHow === 'catch' && passer ? `${who} ${gain}-yd catch from ${passer.sp.name}` : `${who} ${gain}-yd run`;
      this.box.key(g, `${offAbbr}: ${sub}`);
      this.box.points(g, off, 6);
      this.sound('td');
    } else if (o.defTd) {
      text = 'PICK SIX!';
      if (o.reason === 'td' && !sim.passThrown) text = 'SCOOP AND SCORE!';
      color = '#ff6b6b';
      sub = `${carrier ? carrier.sp.name : 'Defense'} returns it for a touchdown`;
      this.box.key(g, `${defAbbr}: ${sub}`);
      this.box.points(g, def, 6);
      this.sound('td');
    } else if (o.safety) {
      text = 'SAFETY!';
      color = '#ff6b6b';
      this.box.key(g, `${defAbbr}: safety`);
      this.box.points(g, def, 2);
      this.sound('whistle');
    } else if (o.turnover) {
      text = sim.events.some((e) => e.type === 'int') ? 'INTERCEPTED!' : 'FUMBLE!';
      color = '#ff6b6b';
      sub = `${defAbbr} take over`;
      this.box.key(g, `${defAbbr} ${text === 'FUMBLE!' ? 'recover a fumble' : 'intercept a pass'}`);
      this.sound('groan');
    } else if (o.reason === 'sack') {
      text = 'SACKED!';
      color = '#ff9d4d';
      this.sound('tackle');
    } else if (o.incomplete) {
      text = o.reason === 'spike' ? 'SPIKE' : 'INCOMPLETE';
      color = '#c8c8c8';
      this.sound('whistle');
    } else if (o.reason === 'kneel') {
      text = 'KNEEL';
      color = '#c8c8c8';
    } else {
      const fd = gain >= toGoBefore;
      if (fd && downBefore === 4) text = 'CONVERTED!';
      else if (fd) text = 'FIRST DOWN!';
      else if (downBefore === 4) text = 'TURNOVER ON DOWNS';
      else text = gain > 0 ? `+${gain} YARDS` : gain < 0 ? `LOSS OF ${-gain}` : 'NO GAIN';
      color = fd ? '#7dff7a' : downBefore === 4 ? '#ff6b6b' : '#ffffff';
      if (gain >= 20) {
        const who = carrier ? carrier.sp.name : '';
        this.box.key(g, `${offAbbr}: ${who} ${sim.carrierHow === 'catch' ? 'catch' : 'run'} for ${gain} yards`);
      }
      this.sound(fd ? 'first' : 'tackle');
      sub = o.summary === 'Tackled' ? (carrier ? `${carrier.sp.name} ${sim.carrierHow === 'catch' ? 'catch' : 'run'}, ${gain} yds` : '') : o.summary;
    }
    applyResult(g, res);
    // next spot laterally
    this.ballY = o.turnover || o.offTd || o.defTd ? MID_Y : clamp(o.endY, HASH_TOP, HASH_BOT);
    if (g.lastEvent === 'Two-minute warning') sub = sub + ' - Two-minute warning';
    this.say(text, sub, color);
    if (g.quarter !== q) this.quarterNote(q);
    this.stage = 'result';
    this.resultT = 0;
    this.sim = sim; // keep for the post-play view
  }

  private quarterNote(prevQ: number) {
    if (!this.banner) return;
    const label = prevQ === 2 ? 'Halftime' : prevQ === 4 ? (this.g.phase === 'final' ? 'Final' : 'End of regulation') : prevQ >= 5 ? 'End of overtime' : `End of ${quarterText(prevQ)}`;
    this.banner.sub = (this.banner.sub ? this.banner.sub + ' - ' : '') + label;
  }

  private resolveReturn() {
    const sim = this.sim!;
    const o = sim.outcome!;
    const g = this.g;
    const kind = this.returnKind!;
    this.returnKind = null;
    this.lastEventIdx = 0;
    this.lastPopupIdx = 0;
    const kicker = g.possession;
    const recv = other(kicker);
    const q = g.quarter;
    // stats: sim OFF = receiving team
    const sideOf = (pid: number) => this.sideOfPid(pid);
    this.box.addMap(sim.stats, sideOf);
    const k = this.kicker(kicker);
    if (kind === 'punt' && k) this.box.add(k.pid, kicker, { punts: 1, puntYds: Math.round(Math.max(0, sim.kickDist - 13)) });
    let recvBallOn = o.touchback ? (kind === 'punt' ? 20 : 30) : Math.round(clamp(o.endX, 1, 99));
    const res: KickResult = { kind, recvBallOn, returnTd: o.offTd, kickingRecovers: o.turnover, outOfBounds: o.outOfBounds, elapsed: o.elapsed, kickBallOn: Math.round(clamp(100 - o.endX, 1, 99)) };
    if (kind === 'kickoff' && o.reason === 'oob') res.recvBallOn = 40;
    recvBallOn = res.recvBallOn;
    let text = kind === 'punt' ? 'PUNT' : 'KICKOFF';
    let sub = o.summary;
    let color = '#ffffff';
    const carrier = sim.carrier >= 0 ? sim.actors[sim.carrier] : null;
    if (o.offTd) {
      text = 'RETURN TOUCHDOWN!';
      color = recv === this.userSide ? '#ffd23f' : '#ff6b6b';
      sub = `${carrier ? carrier.sp.name : 'Returner'} takes it to the house`;
      this.box.key(g, `${this.team(recv).abbr}: ${sub}`);
      this.box.points(g, recv, 6);
      this.sound('td');
    } else if (o.turnover) {
      text = 'MUFFED!';
      color = recv === this.userSide ? '#ff6b6b' : '#7dff7a';
      sub = `${this.team(kicker).abbr} recover`;
      this.box.key(g, `${this.team(kicker).abbr} recover a muffed ${kind}`);
      this.sound('fumble');
    } else if (o.touchback) {
      text = 'TOUCHBACK';
      sub = `Ball on the ${this.spotName(recv, recvBallOn)}`;
    } else if (o.reason === 'faircatch') {
      text = 'FAIR CATCH';
      sub = `Ball on the ${this.spotName(recv, recvBallOn)}`;
    } else {
      sub = carrier ? `${carrier.sp.name} returns it to the ${this.spotName(recv, recvBallOn)}` : o.summary;
      this.sound('tackle');
    }
    applyResult(g, res);
    this.ballY = MID_Y;
    this.say(text, sub, color);
    if (g.quarter !== q) this.quarterNote(q);
    this.stage = 'result';
    this.resultT = 0;
  }

  /** "BUF 25" style field position from a team's perspective. */
  spotName(side: Side, ballOn: number) {
    const b = Math.round(ballOn);
    if (b === 50) return '50';
    return b < 50 ? `${this.team(side).abbr} ${b}` : `${this.team(other(side)).abbr} ${100 - b}`;
  }

  // ------------------------------------------------------------------ simulate a defensive drive

  /** True while simDrive() is fast-forwarding the opponent's possession. */
  private autoDrive = false;

  /** The opponent has the ball and nothing is mid-play: a drive can be simulated. */
  canSimDrive() {
    const g = this.g;
    return g.possession !== this.userSide && (g.phase === 'scrimmage' || g.phase === 'pat') && (this.stage === 'defcall' || this.stage === 'result');
  }

  /**
   * Play out the rest of the opponent's possession instantly (auto defense calls,
   * headless plays), stopping when the user gets the ball back, at halftime or at the end.
   */
  simDrive() {
    if (!this.canSimDrive()) return;
    const g = this.g;
    const opp = g.possession;
    const startPts = [...g.score];
    const startYds = this.box.team[opp].yds;
    let plays = 0;
    this.autoDrive = true;
    try {
      for (let guard = 0; guard < 400; guard++) {
        if (this.stage === 'defcall') {
          this.chooseDefense(null);
          plays++;
        } else if (this.stage === 'kickflight' && this.flightApply) {
          const f = this.flightApply;
          this.flightApply = null;
          this.flight = null;
          f();
        } else if (this.stage === 'live' && this.sim && !this.sim.setup.userControls) {
          // the AI's own kick or punt with the user not involved
          this.sim.runHeadless();
          if (this.returnKind) this.resolveReturn();
          else this.resolveScrimmage();
        } else if (this.stage === 'result') {
          const stillTheirs = g.phase !== 'final' && (g.phase === 'scrimmage' || g.phase === 'pat') && g.possession === opp
            && !(g.quarter === 3 && !this.halftimeShown) && !(g.quarter >= 5 && !this.otTossed);
          if (!stillTheirs) break;
          this.next();
          // next() may hand straight to an AI decision (punt/FG) or a 'defcall'; count plays when they run
          if (this.stage === 'result' || this.stage === 'kickflight') plays++;
        } else break;
      }
    } finally {
      this.autoDrive = false;
    }
    const abbr = this.team(opp).abbr;
    const pts = g.score[opp] - startPts[opp];
    const ours = g.score[this.userSide] - startPts[this.userSide];
    const yds = this.box.team[opp].yds - startYds;
    const punting = this.stage === 'live' && this.returnKind === 'punt';
    const how = punting ? 'Punt' : ours > 0 ? (ours === 2 ? 'Safety!' : 'Defensive touchdown!') : pts >= 6 ? 'Touchdown' : pts === 3 ? 'Field goal' : this.banner?.text ? this.banner.text.replace(/!+$/, '').toLowerCase().replace(/^\w/, (ch) => ch.toUpperCase()) : 'Drive over';
    const good = pts === 0;
    this.say(`${abbr} DRIVE: ${how}`, `${plays} play${plays === 1 ? '' : 's'}, ${yds} yds${pts ? `, ${pts} pts` : ''}`, good ? '#7dff7a' : '#ff9d4d');
    if (this.stage === 'result') this.resultT = 0;
  }

  // ------------------------------------------------------------------ simulate the rest

  simulateRest() {
    const boost = difficultyBoost(this.c);
    continueStatSim(this.c, this.g, this.box, this.rng, {
      week: this.game.week, weather: this.weather, quarterLength: this.g.quarterLength, playoff: this.game.playoff,
      homeBoost: this.userSide === 1 ? boost : 0, awayBoost: this.userSide === 0 ? boost : 0,
    });
    this.sim = null;
    this.stage = 'final';
  }

  finishBox() {
    return this.box.finish(this.game.id, this.c.year, this.game.week, this.g, this.weather, true, this.game.playoff);
  }

  // ------------------------------------------------------------------ text helpers

  situation(): string {
    const g = this.g;
    if (g.phase === 'pat') return 'Point after touchdown';
    if (g.phase === 'kickoff' || g.phase === 'freekick') return 'Kickoff';
    const ord = ['1st', '2nd', '3rd', '4th'][g.down - 1];
    const goal = g.ballOn + g.toGo >= 100;
    const togo = goal ? 'Goal' : g.toGo < 1 ? 'Inches' : String(Math.round(g.toGo));
    const b = Math.round(g.ballOn);
    const spot = b === 50 ? 'midfield' : b < 50 ? `own ${b}` : `opp ${100 - b}`;
    return `${ord} & ${togo} at ${spot}`;
  }

  clockLine(): string {
    return `${quarterText(this.g.quarter)} ${clockText(this.g.clock)}`;
  }

  describePlayer(pid: number) {
    const p = [...this.rosters[0].all, ...this.rosters[1].all].find((x) => x.id === pid);
    return p ? shortName(p) : '';
  }

  // ------------------------------------------------------------------ save / resume

  canSnapshot() {
    return ['playcall', 'defcall', 'pat', 'kickoffChoice', 'halftime', 'result'].includes(this.stage);
  }

  snapshot(): MatchSnapshot {
    return {
      gameId: this.game.id,
      g: JSON.parse(JSON.stringify(this.g)),
      box: {
        players: [...this.box.players.entries()].map(([k, v]) => [k, { teamId: v.teamId, s: { ...(v.s as Record<string, number>) } }]),
        team: JSON.parse(JSON.stringify(this.box.team)),
        quarters: JSON.parse(JSON.stringify(this.box.quarters)),
        keyPlays: [...this.box.keyPlays],
      },
      rng: this.rng.state,
      wind: this.wind,
      halftimeShown: this.halftimeShown,
      otTossed: this.otTossed,
      ballY: this.ballY,
    };
  }

  private restore(s: MatchSnapshot) {
    this.g = s.g;
    for (const [k, v] of s.box.players) this.box.players.set(k, v);
    this.box.team = s.box.team;
    this.box.quarters = s.box.quarters;
    this.box.keyPlays = s.box.keyPlays;
    this.rng.state = s.rng;
    this.wind = s.wind;
    this.halftimeShown = s.halftimeShown;
    this.otTossed = s.otTossed;
    this.ballY = s.ballY;
    this.stage = 'result';
    this.say('GAME RESUMED', this.situation(), '#9be8ff');
    this.resultT = 1.2;
  }
}
