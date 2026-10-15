// Canvas renderer for the playable game. Draws into a low-resolution buffer that is
// scaled up with nearest-neighbour filtering for a crisp pixel-art look.
import type { Team } from '../core/types';
import { clamp, lerp } from '../core/rng';
import type { Match } from '../game/match';
import { FIELD_W, MID_Y, type Actor } from '../game/sim';
import { ROUTES } from '../game/playbook';
import { clockText, quarterText, other, type Side } from '../game/rules';
import { getSprite, poseSize, drawBall, shade, SKINS, type SpriteColors } from './sprites';

export const PPY = 6; // logical pixels per yard
const WORLD_X0 = -14;
const WORLD_X1 = 114;
const WORLD_Y0 = -11;
const WORLD_Y1 = FIELD_W + 9;
const HUD_H = 22;

export interface AimView {
  active: boolean;
  tx: number; // target in sim (offense) coords
  ty: number;
  err: number; // expected error radius (yards)
}

export interface ViewState {
  aim: AimView | null;
  keyboardAim: { x: number; y: number } | null;
  joystick: { x: number; y: number; dx: number; dy: number } | null;
  portrait: boolean;
}

const FONT = '"Press Start 2P", monospace';

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  buf: HTMLCanvasElement;
  b: CanvasRenderingContext2D;
  W = 400;
  H = 240;
  scale = 2;
  camX = 30;
  camY = MID_Y;
  private field: HTMLCanvasElement | null = null;
  private fieldKey = '';
  private crowdT = 0;
  private particles: { x: number; y: number; v: number }[] = [];
  private shake = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.buf = document.createElement('canvas');
    this.b = this.buf.getContext('2d')!;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    const target = cssW > cssH ? 250 : 300;
    this.scale = Math.max(1, Math.min(cssW, cssH) / target);
    this.W = Math.round(cssW / this.scale);
    this.H = Math.round(cssH / this.scale);
    this.buf.width = this.W;
    this.buf.height = this.H;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
  }

  /** CSS pixels per yard on screen. */
  get screenPPY() {
    return PPY * (this.canvas.clientWidth / this.W);
  }

  // ------------------------------------------------------------------ coordinates

  /** World coords: the user's goal line is x=0 and they attack toward +x. */
  private flipFor(m: Match): boolean {
    if (!m.sim) return false;
    return m.simOff !== m.userSide;
  }

  toWorldX(m: Match, x: number) {
    return this.flipFor(m) ? 100 - x : x;
  }

  sx(wx: number) {
    return Math.round((wx - this.camX) * PPY + this.W / 2);
  }
  sy(wy: number) {
    return Math.round((wy - this.camY) * PPY + (this.H + HUD_H) / 2);
  }

  /** Convert a screen (css px relative to canvas) point to sim coordinates. */
  screenToSim(m: Match, px: number, py: number): { x: number; y: number } {
    const lx = px / (this.canvas.clientWidth / this.W);
    const ly = py / (this.canvas.clientHeight / this.H);
    const wx = (lx - this.W / 2) / PPY + this.camX;
    const wy = (ly - (this.H + HUD_H) / 2) / PPY + this.camY;
    return { x: this.flipFor(m) ? 100 - wx : wx, y: wy };
  }

  simToScreen(m: Match, x: number, y: number): { x: number; y: number } {
    const k = this.canvas.clientWidth / this.W;
    return { x: this.sx(this.toWorldX(m, x)) * k, y: this.sy(y) * k };
  }

  // ------------------------------------------------------------------ field

  private buildField(user: Team, opp: Team, weather: string) {
    const key = `${user.id}-${opp.id}-${weather}`;
    if (this.field && this.fieldKey === key) return;
    this.fieldKey = key;
    const w = (WORLD_X1 - WORLD_X0) * PPY;
    const h = (WORLD_Y1 - WORLD_Y0) * PPY;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d')!;
    const X = (x: number) => Math.round((x - WORLD_X0) * PPY);
    const Y = (y: number) => Math.round((y - WORLD_Y0) * PPY);
    const snow = weather === 'snow';
    const g1 = snow ? '#8fb98a' : '#3f9a3a';
    const g2 = snow ? '#9cc497' : '#48a842';
    // surroundings
    c.fillStyle = snow ? '#c9d9c6' : '#2f7a2d';
    c.fillRect(0, 0, w, h);
    // stands (top)
    c.fillStyle = '#2a2d45';
    c.fillRect(0, 0, w, Y(-4.5));
    c.fillStyle = '#3b3f62';
    for (let yy = 4; yy < Y(-4.5) - 3; yy += 6) c.fillRect(0, yy, w, 1);
    // track / sideline strip
    c.fillStyle = snow ? '#e9efe8' : '#6d6f72';
    c.fillRect(0, Y(-4.5), w, Y(-1.2) - Y(-4.5));
    c.fillRect(0, Y(FIELD_W + 1.2), w, Y(FIELD_W + 3.5) - Y(FIELD_W + 1.2));
    // grass stripes every 5 yards
    for (let x = -10; x < 110; x += 5) {
      c.fillStyle = Math.floor((x + 10) / 5) % 2 === 0 ? g1 : g2;
      c.fillRect(X(x), Y(-1.2), X(x + 5) - X(x), Y(FIELD_W + 1.2) - Y(-1.2));
    }
    // end zones
    const ez = (x0: number, t: Team) => {
      c.fillStyle = t.colors.primary;
      c.fillRect(X(x0), Y(0), 10 * PPY, FIELD_W * PPY);
      c.fillStyle = shade(t.colors.primary, 0.82);
      for (let k = -FIELD_W * PPY; k < 10 * PPY + FIELD_W * PPY; k += 8) {
        c.save();
        c.beginPath();
        c.rect(X(x0), Y(0), 10 * PPY, FIELD_W * PPY);
        c.clip();
        c.fillRect(X(x0) + k, Y(0), 3, FIELD_W * PPY);
        c.restore();
      }
      c.save();
      c.translate(X(x0 + 5), Y(MID_Y));
      c.rotate(x0 < 0 ? -Math.PI / 2 : Math.PI / 2);
      c.fillStyle = t.colors.secondary;
      c.font = `16px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillText(t.name.toUpperCase(), 2, 2);
      c.fillStyle = t.colors.secondary === t.colors.primary ? '#ffffff' : t.colors.secondary;
      c.fillText(t.name.toUpperCase(), 0, 0);
      c.restore();
    };
    ez(-10, user);
    ez(100, opp);
    // lines
    c.fillStyle = '#f4f4f4';
    c.fillRect(X(-10), Y(0) - 1, 120 * PPY, 2);
    c.fillRect(X(-10), Y(FIELD_W) - 1, 120 * PPY, 2);
    c.fillRect(X(-10) - 1, Y(0), 2, FIELD_W * PPY);
    c.fillRect(X(110) - 1, Y(0), 2, FIELD_W * PPY);
    for (let x = 0; x <= 100; x += 5) c.fillRect(X(x), Y(0), x === 0 || x === 100 ? 2 : 1, FIELD_W * PPY);
    // hash marks
    for (let x = 1; x < 100; x++) {
      if (x % 5 === 0) continue;
      for (const hy of [0.4, 23.58, 29.75, FIELD_W - 0.6]) c.fillRect(X(x), Y(hy), 1, 2);
    }
    // numbers
    c.font = `8px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let x = 10; x <= 90; x += 10) {
      const n = String(x <= 50 ? x : 100 - x);
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fillText(n, X(x), Y(9));
      c.fillText(n, X(x), Y(FIELD_W - 9));
    }
    // midfield logo
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.beginPath();
    c.arc(X(50), Y(MID_Y), 22, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.font = `8px ${FONT}`;
    c.fillText('GL', X(50), Y(MID_Y) + 1);
    // benches on the far sideline
    const bench = (x0: number, t: Team) => {
      c.fillStyle = shade(t.colors.primary, 0.8);
      c.fillRect(X(x0), Y(FIELD_W + 4), 20 * PPY, 5);
      c.fillStyle = t.colors.secondary;
      c.fillRect(X(x0), Y(FIELD_W + 4) + 5, 20 * PPY, 1);
    };
    bench(25, user);
    bench(55, opp);
    this.field = cv;
  }

  private drawCrowd(b: CanvasRenderingContext2D, user: Team, opp: Team) {
    const top = this.sy(-11);
    const bottom = this.sy(-4.5);
    if (bottom < HUD_H) return;
    const cols = [user.colors.primary, opp.colors.primary, '#e8e8e8', '#c9a26b', '#704030', user.colors.secondary, '#3a4b7a'];
    const t = Math.floor(this.crowdT * 4);
    for (let y = Math.max(top, HUD_H); y < bottom - 2; y += 3) {
      for (let x = 0; x < this.W; x += 3) {
        const wx = Math.floor((x / PPY + this.camX) * 2);
        const hsh = (wx * 73856093) ^ (y * 19349663);
        const cIdx = Math.abs(hsh) % cols.length;
        const bob = (hsh + t) % 9 === 0 ? -1 : 0;
        b.fillStyle = cols[cIdx];
        b.fillRect(x, y + bob, 2, 2);
      }
    }
  }

  // ------------------------------------------------------------------ main draw

  draw(m: Match, view: ViewState, dt: number) {
    const b = this.b;
    b.imageSmoothingEnabled = false;
    this.crowdT += dt;
    const user = m.team(m.userSide);
    const opp = m.team(other(m.userSide));
    this.buildField(user, opp, m.weather);
    this.updateCamera(m, dt);
    b.fillStyle = '#1b1f3a';
    b.fillRect(0, 0, this.W, this.H);
    // field
    const fx = Math.round((this.camX - WORLD_X0) * PPY - this.W / 2);
    const fy = Math.round((this.camY - WORLD_Y0) * PPY - (this.H + HUD_H) / 2);
    let shx = 0;
    let shy = 0;
    if (this.shake > 0) {
      this.shake -= dt;
      shx = Math.round((Math.random() - 0.5) * 3);
      shy = Math.round((Math.random() - 0.5) * 3);
    }
    b.drawImage(this.field!, fx - shx, fy - shy, this.W, this.H, 0, 0, this.W, this.H);
    this.drawCrowd(b, user, opp);
    this.drawGoalposts(b);
    this.drawLines(m);
    if (view.portrait) {
      // nothing special; HUD adapts
    }
    if (m.stage === 'kickflight' && m.flight) this.drawKickFlight(m);
    if (m.sim) this.drawPlay(m, view);
    else this.drawIdleFormation(m);
    this.drawWeather(m, dt);
    this.drawHud(m);
    if (m.stage === 'kick' && m.meter) this.drawMeter(m);
    this.drawBanner(m);
    // blit
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
  }

  private updateCamera(m: Match, dt: number) {
    let tx = this.camX;
    let ty = this.camY;
    const sim = m.sim;
    const g = m.g;
    if (m.stage === 'kickflight' && m.flight) {
      const f = m.flight;
      const u = clamp(f.t / f.dur, 0, 1);
      const flip = f.kickerSide !== m.userSide;
      const x = lerp(f.x0, f.x1, u);
      tx = flip ? 100 - x : x;
      ty = lerp(f.y0, f.y1, u);
    } else if (sim) {
      const ball = sim.ball;
      let bx = ball.x;
      let by = ball.y;
      if (ball.state === 'air' && sim.phase === 'live') {
        bx = lerp(ball.x, ball.tx, 0.35);
        by = lerp(ball.y, ball.ty, 0.35);
      }
      if (sim.phase === 'presnap') {
        bx = sim.los + 6;
        by = sim.setup.kind === 'scrimmage' ? sim.setup.ballY : MID_Y;
      }
      tx = this.toWorldX(m, bx);
      ty = by;
    } else {
      const wx = g.possession === m.userSide ? g.ballOn : 100 - g.ballOn;
      tx = wx + (g.possession === m.userSide ? 6 : -6);
      ty = m.ballY;
    }
    const halfW = this.W / 2 / PPY;
    const halfH = (this.H - HUD_H) / 2 / PPY;
    tx = clamp(tx, WORLD_X0 + halfW, WORLD_X1 - halfW);
    ty = clamp(ty, WORLD_Y0 + halfH, WORLD_Y1 - halfH);
    const k = 1 - Math.pow(0.0008, dt);
    this.camX = lerp(this.camX, tx, k);
    this.camY = lerp(this.camY, ty, k * 0.8);
  }

  private drawGoalposts(b: CanvasRenderingContext2D) {
    for (const gx of [-10, 110]) {
      const x = this.sx(gx);
      if (x < -20 || x > this.W + 20) continue;
      const yTop = this.sy(MID_Y - 3.1);
      const yBot = this.sy(MID_Y + 3.1);
      const yMid = this.sy(MID_Y);
      b.fillStyle = 'rgba(0,0,0,0.25)';
      b.fillRect(x + 2, yTop, 2, yBot - yTop);
      b.fillStyle = '#f5d33b';
      b.fillRect(x - 1, yMid - 1, gx < 0 ? -6 : 6, 3); // base support
      b.fillRect(x, yTop, 2, yBot - yTop); // crossbar seen from above
      b.fillRect(x - 1, yTop - 12, 2, 13); // left upright (raised)
      b.fillRect(x - 1, yBot - 12, 2, 13);
    }
  }

  private drawLines(m: Match) {
    const b = this.b;
    const g = m.g;
    const sim = m.sim;
    if (g.phase !== 'scrimmage' && g.phase !== 'pat' && !(sim && sim.setup.kind === 'scrimmage')) return;
    if (sim && sim.setup.kind !== 'scrimmage') return;
    const losSim = sim ? sim.los : g.phase === 'pat' ? 98 : g.ballOn;
    const fdSim = sim ? sim.firstDownX : g.ballOn + g.toGo;
    const offIsUser = sim ? m.simOff === m.userSide : g.possession === m.userSide;
    const wl = offIsUser ? losSim : 100 - losSim;
    const wf = offIsUser ? fdSim : 100 - fdSim;
    const y0 = this.sy(0);
    const y1 = this.sy(FIELD_W);
    b.fillStyle = 'rgba(80,150,255,0.85)';
    b.fillRect(this.sx(wl), y0, 2, y1 - y0);
    if (fdSim <= 100 && g.phase !== 'pat') {
      b.fillStyle = 'rgba(255,220,40,0.9)';
      b.fillRect(this.sx(wf), y0, 2, y1 - y0);
    }
  }

  /** Home team wears its colour jersey; the away team wears white with colour trim. */
  private colorsFor(t: Team, skin: number, side: 'home' | 'away'): SpriteColors {
    const sk = SKINS[skin % SKINS.length];
    if (side === 'away') {
      const trim = t.colors.primary === '#151515' ? t.colors.secondary : t.colors.primary;
      return { helmet: t.colors.helmet, jersey: '#eeeeee', trim, pants: t.colors.pants === '#ffffff' ? t.colors.secondary : t.colors.pants, skin: sk };
    }
    return { helmet: t.colors.helmet, jersey: t.colors.primary, trim: t.colors.secondary, pants: t.colors.pants, skin: sk };
  }

  private sideOf(m: Match, t: Team): 'home' | 'away' {
    return t.id === m.team(0).id ? 'home' : 'away';
  }

  /** Before the first play or between plays: show the teams lined up loosely. */
  private drawIdleFormation(m: Match) {
    const b = this.b;
    const g = m.g;
    const offSide = g.possession;
    const offT = m.team(offSide);
    const defT = m.team(other(offSide));
    const flip = offSide !== m.userSide;
    const los = g.phase === 'kickoff' || g.phase === 'freekick' ? (g.phase === 'freekick' ? 20 : 35) : g.ballOn;
    const placeholders: [number, number, boolean][] = [];
    for (let i = 0; i < 11; i++) placeholders.push([los - 1 - (i % 3) * 2, MID_Y - 15 + i * 3, true]);
    for (let i = 0; i < 11; i++) placeholders.push([los + 2 + (i % 3) * 3, MID_Y - 15 + i * 3, false]);
    for (const [x, y, isOff] of placeholders) {
      const wx = flip ? 100 - x : x;
      const t = isOff ? offT : defT;
      const spr = getSprite('stand', this.colorsFor(t, (x * 7 + y) | 0, this.sideOf(m, t)));
      const sx = this.sx(wx);
      const sy = this.sy(y);
      b.fillStyle = 'rgba(0,0,0,0.25)';
      b.fillRect(sx - 3, sy, 7, 2);
      const facing = isOff !== flip ? 1 : -1;
      this.blit(spr, sx, sy, facing);
    }
    const wx = flip ? 100 - los : los;
    drawBall(b, this.sx(wx), this.sy(m.ballY));
  }

  private blit(spr: HTMLCanvasElement, sx: number, sy: number, facing: number) {
    const b = this.b;
    const w = spr.width;
    const h = spr.height;
    if (facing >= 0) b.drawImage(spr, sx - Math.floor(w / 2), sy - h + 1);
    else {
      b.save();
      b.translate(sx + Math.ceil(w / 2), sy - h + 1);
      b.scale(-1, 1);
      b.drawImage(spr, 0, 0);
      b.restore();
    }
  }

  private poseFor(a: Actor): string {
    switch (a.anim) {
      case 'run': {
        const f = Math.floor(a.animT * (6 + Math.hypot(a.vx, a.vy) * 0.9)) % 4;
        return `run${f}`;
      }
      case 'down':
        return 'down';
      case 'dive':
        return 'dive';
      case 'throw':
        return 'throw';
      case 'block':
        return 'block';
      case 'celebrate':
        return 'celebrate';
      case 'kneel':
      case 'spike':
        return a.anim === 'kneel' ? 'kneel' : 'throw';
      case 'catch':
        return 'catch';
      case 'kick':
        return 'kick';
      default:
        return 'stand';
    }
  }

  private drawPlay(m: Match, view: ViewState) {
    const b = this.b;
    const sim = m.sim!;
    const flip = this.flipFor(m);
    const offSide: Side = m.simOff;
    const offT = m.team(offSide);
    const defT = m.team(other(offSide));
    // routes preview for the user's offense
    if (sim.phase === 'presnap' && sim.setup.kind === 'scrimmage' && sim.setup.userControls && m.settings.showRoutes) this.drawRoutes(m);
    // depth-sort by y
    const order = [...sim.actors].sort((a, c) => a.y - c.y);
    for (const a of order) {
      const t = a.side === 0 ? offT : defT;
      const col = this.colorsFor(t, a.sp.look.skin, this.sideOf(m, t));
      const pose = this.poseFor(a);
      const spr = getSprite(pose, col);
      const wx = flip ? 100 - a.x : a.x;
      const sx = this.sx(wx);
      const sy = this.sy(a.y);
      if (sx < -20 || sx > this.W + 20 || sy < -20 || sy > this.H + 30) continue;
      // shadow
      b.fillStyle = 'rgba(0,0,0,0.28)';
      const [pw] = poseSize(pose);
      b.fillRect(sx - Math.floor(pw / 2) + 1, sy - 1, pw - 2, 2);
      let facing = a.facing * (flip ? -1 : 1);
      if (sim.phase === 'presnap') facing = (a.side === 0) !== flip ? 1 : -1;
      this.blit(spr, sx, sy, facing);
      // user-controlled marker
      if (a.i === sim.userActor && sim.phase !== 'over') {
        const blink = Math.floor(m.time * 4) % 2 === 0;
        b.fillStyle = blink ? '#ffe34a' : '#ffffff';
        b.fillRect(sx - 2, sy - 20, 5, 1);
        b.fillRect(sx - 1, sy - 19, 3, 1);
        b.fillRect(sx, sy - 18, 1, 1);
        // sprint stamina bar
        if (sim.carrier === a.i) {
          b.fillStyle = '#000';
          b.fillRect(sx - 5, sy + 3, 10, 2);
          b.fillStyle = a.stamina > 0.3 ? '#5be05b' : '#e05b5b';
          b.fillRect(sx - 5, sy + 3, Math.round(10 * a.stamina), 2);
        }
      }
      // ball carrier ball
      if (sim.ball.state === 'held' && sim.ball.holder === a.i && pose !== 'down') {
        drawBall(b, sx + (facing > 0 ? 3 : -3), sy - 7, 0);
      }
      // eligible receiver tags while aiming
      if (sim.setup.kind === 'scrimmage' && sim.setup.userControls && a.side === 0 && a.mode === 'route' && sim.canThrow()) {
        b.fillStyle = '#ffffff';
        b.font = `8px ${FONT}`;
        b.textAlign = 'center';
        const idx = this.receiverIndex(m, a);
        if (idx > 0) {
          b.fillStyle = 'rgba(0,0,0,0.6)';
          b.fillRect(sx - 4, sy - 25, 9, 9);
          b.fillStyle = '#ffe34a';
          b.fillText(String(idx), sx + 1, sy - 20);
        }
      }
    }
    // ball in flight
    const ball = sim.ball;
    if (ball.state === 'air' || ball.state === 'loose' || ball.state === 'dead') {
      const wx = flip ? 100 - ball.x : ball.x;
      const sx = this.sx(wx);
      const sy = this.sy(ball.y);
      b.fillStyle = 'rgba(0,0,0,0.35)';
      b.fillRect(sx - 1, sy, 3, 1);
      drawBall(b, sx, sy - Math.round(ball.z * PPY), Math.floor(m.time * 12));
      if (ball.state === 'air' && ball.kind === 'kick') {
        // landing marker for returns
        const lx = this.sx(flip ? 100 - ball.tx : ball.tx);
        const ly = this.sy(ball.ty);
        b.strokeStyle = 'rgba(255,255,255,0.6)';
        b.strokeRect(lx - 3, ly - 2, 7, 4);
      }
    }
    // aiming UI
    if (view.aim && view.aim.active && sim.canThrow()) this.drawAim(m, view.aim.tx, view.aim.ty, view.aim.err);
    else if (view.keyboardAim && sim.canThrow()) this.drawAim(m, view.keyboardAim.x, view.keyboardAim.y, 1.5);
    // popups
    b.font = `8px ${FONT}`;
    b.textAlign = 'center';
    for (const p of sim.popups) {
      const age = sim.t - p.t;
      if (age > 1.2 || age < 0) continue;
      const wx = flip ? 100 - p.x : p.x;
      const sx = this.sx(wx);
      const sy = this.sy(p.y) - 22 - Math.round(age * 12);
      b.fillStyle = '#000';
      b.fillText(p.text, sx + 1, sy + 1);
      b.fillStyle = p.text.includes('INTERCEPT') || p.text.includes('FUMBLE') || p.text.includes('SACK') ? '#ff6b6b' : '#ffe34a';
      b.fillText(p.text, sx, sy);
    }
    if (view.joystick) this.drawJoystick(view.joystick);
  }

  private receiverIndex(m: Match, a: Actor): number {
    const sim = m.sim!;
    const recs = sim.actors.filter((x) => x.side === 0 && ['X', 'Z', 'SLOT', 'SLOT2', 'TE', 'TE2', 'RB', 'FB'].includes(x.role) && x.route).sort((p, q) => p.hy - q.hy);
    return recs.indexOf(a) + 1;
  }

  private drawRoutes(m: Match) {
    const b = this.b;
    const sim = m.sim!;
    const play = m.play;
    if (!play) return;
    for (const a of sim.actors) {
      if (a.side !== 0) continue;
      if (a.route) {
        const pts = [[a.x, a.y], ...a.route.pts];
        b.fillStyle = 'rgba(255,255,255,0.75)';
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, y0] = pts[i];
          let [x1, y1] = pts[i + 1];
          if (i === pts.length - 2 && a.route.end === 'continue') {
            const d = Math.hypot(x1 - x0, y1 - y0);
            if (d > 14) {
              x1 = x0 + ((x1 - x0) / d) * 14;
              y1 = y0 + ((y1 - y0) / d) * 14;
            }
          }
          const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
          for (let s = 0; s < steps; s += 2) {
            const u = s / steps;
            b.fillRect(this.sx(lerp(x0, x1, u)), this.sy(lerp(y0, y1, u)), 1, 1);
          }
          if (i === pts.length - 2) {
            b.fillStyle = '#ffe34a';
            b.fillRect(this.sx(x1) - 1, this.sy(y1) - 1, 3, 3);
            b.fillStyle = 'rgba(255,255,255,0.75)';
          }
        }
      } else if (a.runPath) {
        b.fillStyle = 'rgba(255,170,60,0.85)';
        const pts = [[a.x, a.y], ...a.runPath];
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, y0] = pts[i];
          const [x1, y1] = pts[i + 1];
          const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
          for (let s = 0; s < steps; s += 2) {
            const u = s / steps;
            b.fillRect(this.sx(lerp(x0, x1, u)), this.sy(lerp(y0, y1, u)), 1, 1);
          }
        }
      }
    }
    void ROUTES;
  }

  private drawAim(m: Match, tx: number, ty: number, err: number) {
    const b = this.b;
    const sim = m.sim!;
    const q = sim.actors[sim.qb];
    if (!q) return;
    const d = Math.hypot(tx - q.x, ty - q.y);
    const peak = 0.4 + d * 0.085;
    const steps = 18;
    for (let i = 1; i < steps; i++) {
      const u = i / steps;
      const x = lerp(q.x, tx, u);
      const y = lerp(q.y, ty, u);
      const z = 2 * (1 - u) + 1.3 * u + 4 * peak * u * (1 - u);
      b.fillStyle = i % 2 ? 'rgba(255,255,255,0.9)' : 'rgba(255,227,74,0.9)';
      b.fillRect(this.sx(x), this.sy(y) - Math.round(z * PPY), 1, 1);
    }
    const sx = this.sx(tx);
    const sy = this.sy(ty);
    const r = Math.max(3, Math.round(err * PPY));
    b.strokeStyle = 'rgba(255,227,74,0.95)';
    b.beginPath();
    b.ellipse(sx + 0.5, sy + 0.5, r, Math.max(2, r * 0.7), 0, 0, Math.PI * 2);
    b.stroke();
    b.fillStyle = '#ffffff';
    b.fillRect(sx - 3, sy, 7, 1);
    b.fillRect(sx, sy - 3, 1, 7);
    // too far indicator
    if (d > sim.maxThrow()) {
      b.fillStyle = '#ff6b6b';
      b.font = `8px ${FONT}`;
      b.textAlign = 'center';
      b.fillText('MAX', sx, sy - 8);
    }
  }

  private drawJoystick(j: { x: number; y: number; dx: number; dy: number }) {
    const b = this.b;
    const k = this.W / this.canvas.clientWidth;
    const cx = j.x * k;
    const cy = j.y * k;
    b.strokeStyle = 'rgba(255,255,255,0.35)';
    b.beginPath();
    b.arc(cx, cy, 16, 0, Math.PI * 2);
    b.stroke();
    b.fillStyle = 'rgba(255,255,255,0.5)';
    b.beginPath();
    b.arc(cx + j.dx * 14, cy + j.dy * 14, 5, 0, Math.PI * 2);
    b.fill();
  }

  private drawKickFlight(m: Match) {
    const b = this.b;
    const f = m.flight!;
    const u = clamp(f.t / f.dur, 0, 1);
    const flip = f.kickerSide !== m.userSide;
    const x = lerp(f.x0, f.x1, u);
    const y = lerp(f.y0, f.y1, u);
    const z = 4 * f.peak * u * (1 - u) * (u < 1 ? 1 : 0) + (1 - u) * 0.3;
    const wx = flip ? 100 - x : x;
    // holder and kicker
    const kt = m.team(f.kickerSide);
    const col = this.colorsFor(kt, 2, this.sideOf(m, kt));
    const hx = flip ? 100 - f.x0 : f.x0;
    const facing = flip ? -1 : 1;
    this.blit(getSprite(u < 0.15 ? 'kick' : 'stand', col), this.sx(hx - facing * 1.2), this.sy(f.y0), facing);
    this.blit(getSprite('kneel', col), this.sx(hx + facing * 0.6), this.sy(f.y0 + 1), facing);
    const sx = this.sx(wx);
    const sy = this.sy(y);
    b.fillStyle = 'rgba(0,0,0,0.3)';
    b.fillRect(sx - 1, sy, 3, 1);
    drawBall(b, sx, sy - Math.round(z * PPY), Math.floor(f.t * 14));
    if (u >= 1) {
      b.font = `8px ${FONT}`;
      b.textAlign = 'center';
      b.fillStyle = f.good ? '#7dff7a' : '#ff6b6b';
      b.fillText(f.good ? 'GOOD!' : 'NO GOOD', sx, sy - 20);
    }
    b.font = `8px ${FONT}`;
    b.textAlign = 'center';
    b.fillStyle = '#ffffff';
    b.fillText(f.label, this.W / 2, HUD_H + 14);
  }

  private drawWeather(m: Match, dt: number) {
    const b = this.b;
    const w = m.weather;
    if (w !== 'rain' && w !== 'snow') return;
    const n = w === 'rain' ? 90 : 70;
    while (this.particles.length < n) this.particles.push({ x: Math.random() * this.W, y: Math.random() * this.H, v: 0.6 + Math.random() * 0.8 });
    for (const p of this.particles) {
      if (w === 'rain') {
        p.y += dt * 260 * p.v;
        p.x -= dt * 50 * p.v;
        b.fillStyle = 'rgba(180,200,255,0.45)';
        b.fillRect(Math.round(p.x), Math.round(p.y), 1, 4);
      } else {
        p.y += dt * 30 * p.v;
        p.x += Math.sin((p.y + p.x) * 0.05) * dt * 12;
        b.fillStyle = 'rgba(255,255,255,0.85)';
        b.fillRect(Math.round(p.x), Math.round(p.y), p.v > 1 ? 2 : 1, p.v > 1 ? 2 : 1);
      }
      if (p.y > this.H) {
        p.y = HUD_H;
        p.x = Math.random() * this.W;
      }
      if (p.x < 0) p.x += this.W;
    }
  }

  // ------------------------------------------------------------------ HUD

  private drawHud(m: Match) {
    const b = this.b;
    const g = m.g;
    const home = m.team(0);
    const away = m.team(1);
    b.fillStyle = '#0d0f1f';
    b.fillRect(0, 0, this.W, HUD_H);
    b.fillStyle = '#f4f4f4';
    b.fillRect(0, HUD_H - 1, this.W, 1);
    b.font = `8px ${FONT}`;
    b.textBaseline = 'middle';
    const cx = Math.round(this.W / 2);
    const box = (x: number, t: Team, score: number, side: Side, align: 'left' | 'right') => {
      const w = 64;
      const x0 = align === 'left' ? x - w : x;
      b.fillStyle = t.colors.primary;
      b.fillRect(x0, 2, w, HUD_H - 5);
      b.fillStyle = shade(t.colors.primary, 0.7);
      b.fillRect(x0, HUD_H - 5, w, 2);
      b.fillStyle = t.colors.secondary === t.colors.primary ? '#ffffff' : t.colors.secondary;
      b.textAlign = 'left';
      b.fillText(t.abbr, x0 + 4, 9);
      b.textAlign = 'right';
      b.fillStyle = '#ffffff';
      b.fillText(String(score), x0 + w - 4, 9);
      // timeouts
      for (let i = 0; i < 3; i++) {
        b.fillStyle = i < g.timeouts[side] ? '#ffe34a' : 'rgba(0,0,0,0.4)';
        b.fillRect(x0 + 4 + i * 6, 15, 4, 2);
      }
      if (g.possession === side && g.phase !== 'final') {
        drawBall(b, x0 + w - 8, 16, 0);
      }
    };
    box(cx - 34, home, g.score[0], 0, 'left');
    box(cx + 34, away, g.score[1], 1, 'right');
    b.fillStyle = '#1c2140';
    b.fillRect(cx - 32, 2, 64, HUD_H - 5);
    b.textAlign = 'center';
    b.fillStyle = '#ffe34a';
    b.fillText(quarterText(g.quarter), cx, 7);
    b.fillStyle = g.clockRunning ? '#ffffff' : '#9be8ff';
    b.fillText(clockText(g.clock), cx, 15);
    // down & distance (if room)
    const left = cx - 104;
    if (left > 64) {
      b.textAlign = 'right';
      b.fillStyle = '#ffffff';
      b.fillText(this.downShort(m), left, 9);
      b.fillStyle = '#9be8ff';
      b.fillText(this.spotShort(m), left, 17);
    }
    const right = cx + 104;
    if (right < this.W - 20) {
      b.textAlign = 'left';
      b.fillStyle = '#c8c8c8';
      const wl = m.weather === 'dome' ? 'DOME' : m.weather === 'clear' ? 'CLEAR' : m.weather.toUpperCase();
      b.fillText(wl, right, 9);
      if (Math.abs(m.wind) > 0.5) {
        b.fillText(`WIND ${m.wind > 0 ? 'v' : '^'}${Math.round(Math.abs(m.wind) * 8)}`, right, 17);
      }
    }
    b.textBaseline = 'alphabetic';
  }

  private downShort(m: Match) {
    const g = m.g;
    if (g.phase === 'pat') return 'PAT';
    if (g.phase === 'kickoff' || g.phase === 'freekick') return 'KICKOFF';
    if (g.phase === 'final') return 'FINAL';
    const ord = ['1ST', '2ND', '3RD', '4TH'][g.down - 1] ?? '';
    const goal = g.ballOn + g.toGo >= 100;
    return `${ord}&${goal ? 'G' : g.toGo < 1 ? 'IN' : Math.round(g.toGo)}`;
  }

  private spotShort(m: Match) {
    const g = m.g;
    if (g.phase !== 'scrimmage') return '';
    const b = Math.round(g.ballOn);
    const off = m.team(g.possession).abbr;
    const def = m.team(other(g.possession)).abbr;
    if (b === 50) return 'MID';
    return b < 50 ? `${off} ${b}` : `${def} ${100 - b}`;
  }

  private drawMeter(m: Match) {
    const b = this.b;
    const k = m.meter!;
    const cx = Math.round(this.W / 2);
    const top = this.H - 62;
    b.fillStyle = 'rgba(10,12,30,0.82)';
    b.fillRect(cx - 80, top - 14, 160, 70);
    b.strokeStyle = '#ffffff';
    b.strokeRect(cx - 80 + 0.5, top - 14 + 0.5, 159, 69);
    b.font = `8px ${FONT}`;
    b.textAlign = 'center';
    b.fillStyle = '#ffe34a';
    const label = k.kind === 'fg' ? `FIELD GOAL ${k.distance} YDS` : k.kind === 'xp' ? 'EXTRA POINT' : k.kind === 'punt' ? 'PUNT' : 'KICKOFF';
    b.fillText(label, cx, top - 3);
    // aim bar
    b.fillStyle = '#2a2f55';
    b.fillRect(cx - 60, top + 6, 120, 8);
    const zone = k.kind === 'fg' || k.kind === 'xp' ? Math.max(6, 30 - k.distance * 0.35) : 40;
    b.fillStyle = '#3fae3b';
    b.fillRect(cx - zone / 2, top + 6, zone, 8);
    b.fillStyle = '#7dff7a';
    b.fillRect(cx - 1, top + 6, 2, 8);
    const aimV = k.phase === 'aim' ? k.aim : k.aimLocked;
    b.fillStyle = '#ffffff';
    b.fillRect(Math.round(cx + aimV * 58) - 1, top + 3, 3, 14);
    b.fillStyle = '#c8c8c8';
    b.fillText('AIM', cx - 70, top + 13);
    // power bar
    b.fillStyle = '#2a2f55';
    b.fillRect(cx - 60, top + 24, 120, 8);
    const pw = k.phase === 'power' ? k.power : k.phase === 'done' ? k.powerLocked : 0;
    const grad = pw > 0.85 ? '#ff6b3d' : pw > 0.5 ? '#ffd23f' : '#7dff7a';
    b.fillStyle = grad;
    b.fillRect(cx - 60, top + 24, Math.round(120 * pw), 8);
    if (k.kind === 'fg' || k.kind === 'xp') {
      // required power marker
      const kick = m.rosters[m.userSide].lineup.k[0];
      const maxD = 46 + ((kick?.r.kpw ?? 60) - 50) * 0.55;
      const need = clamp(k.distance / maxD, 0, 1.2);
      b.fillStyle = '#ffffff';
      b.fillRect(cx - 60 + Math.round(120 * Math.min(1, need)), top + 21, 1, 14);
    }
    b.fillStyle = '#c8c8c8';
    b.fillText('PWR', cx - 70, top + 31);
    b.fillStyle = '#ffffff';
    b.fillText(k.phase === 'aim' ? 'TAP TO SET AIM' : k.phase === 'power' ? 'TAP TO KICK' : '', cx, top + 48);
  }

  private drawBanner(m: Match) {
    const bn = m.banner;
    if (!bn || bn.t > 2.6) return;
    if (m.stage === 'live' || m.stage === 'presnap' || m.stage === 'kick') {
      if (bn.t > 1.4) return;
    }
    const b = this.b;
    const cx = Math.round(this.W / 2);
    const cy = Math.round(this.H * 0.42);
    const pop = Math.min(1, bn.t * 6);
    b.textAlign = 'center';
    const size = bn.text.length > 14 ? 12 : 16;
    b.font = `${size}px ${FONT}`;
    const w = Math.min(this.W - 8, b.measureText(bn.text).width + 24);
    b.fillStyle = 'rgba(10,12,30,0.78)';
    b.fillRect(cx - w / 2, cy - 18 * pop, w, 34 * pop + (bn.sub ? 12 : 0));
    if (pop < 1) return;
    b.fillStyle = '#000000';
    b.fillText(bn.text, cx + 1, cy + 2);
    b.fillStyle = bn.color;
    b.fillText(bn.text, cx, cy + 1);
    if (bn.sub) {
      b.font = `8px ${FONT}`;
      b.fillStyle = '#e8e8e8';
      const sub = bn.sub.length > 46 ? bn.sub.slice(0, 45) + '.' : bn.sub;
      b.fillText(sub, cx, cy + 16);
    }
    if (bn.t < 0.05 && (bn.text.includes('TOUCHDOWN') || bn.text.includes('SACK') || bn.text.includes('INTERCEPT'))) this.shake = 0.25;
  }
}
