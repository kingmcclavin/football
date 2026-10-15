import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, Btn } from './common';
import { Match, type MatchSnapshot } from '../game/match';
import { Renderer, type ViewState } from '../render/renderer';
import { NO_INPUT, type PlayInput } from '../game/sim';
import { PLAYS, DEF_CALLS, type PlayCategory } from '../game/playbook';
import { applyGameResult, completeWeekAfterUserGame, gameWeather, userGameThisWeek, ROUND_NAME } from '../league/season';
import { recordWeekFinances } from '../league/frontoffice';
import { careerRng, saveRng } from '../league/career';
import { clearLive, loadLive, saveLive } from '../save/storage';
import { sfx, unlockAudio } from '../audio/sfx';
import { playDiagram, defDiagram } from './playArt';
import { fgDistance, clockText, quarterText, other } from '../game/rules';

const CATS: { id: PlayCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'short', label: 'Short' },
  { id: 'medium', label: 'Medium' },
  { id: 'deep', label: 'Deep' },
  { id: 'run', label: 'Run' },
  { id: 'screen', label: 'Screen' },
  { id: 'pa', label: 'Play Action' },
  { id: 'special', label: 'Special' },
];

interface Ptr {
  id: number;
  sx: number;
  sy: number;
  x: number;
  y: number;
  role: 'aim' | 'stick' | 'none';
  t: number;
}

export function GameScreen({ resume }: { resume: boolean }) {
  const app = useApp();
  const c = app.career!;
  const game = useMemo(() => userGameThisWeek(c), [c]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const matchRef = useRef<Match | null>(null);
  const rendRef = useRef<Renderer | null>(null);
  const [, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [cat, setCat] = useState<PlayCategory | 'all'>('all');
  const [ready, setReady] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const input = useRef<PlayInput>({ ...NO_INPUT });
  const ptrs = useRef(new Map<number, Ptr>());
  const keys = useRef(new Set<string>());
  const sprintHeld = useRef(false);
  const kbAim = useRef<{ x: number; y: number } | null>(null);
  const view = useRef<ViewState>({ aim: null, keyboardAim: null, joystick: null, portrait: false });
  const lastSavedStage = useRef('');
  const settingsRef = useRef(app.settings);
  settingsRef.current = app.settings;

  // ------------------------------------------------------------------ setup
  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    (async () => {
      const weather = gameWeather(c, game);
      let snap: MatchSnapshot | null = null;
      if (resume) {
        snap = await loadLive<MatchSnapshot>(c.slot);
        if (snap && snap.gameId !== game.id) snap = null;
      }
      if (cancelled) return;
      matchRef.current = new Match(c, game, app.settings, weather, snap ?? undefined);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (matchRef.current) matchRef.current.settings = app.settings;
  }, [app.settings]);

  // ------------------------------------------------------------------ loop
  useEffect(() => {
    if (!ready) return;
    const cv = canvasRef.current!;
    const r = new Renderer(cv);
    rendRef.current = r;
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      r.resize(w, h, Math.min(2, window.devicePixelRatio || 1));
      view.current.portrait = h > w;
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    let raf = 0;
    let last = performance.now();
    let uiKey = '';
    const frame = (t: number) => {
      const m = matchRef.current!;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!pausedRef.current) {
        const inp = buildInput(m);
        m.update(dt, inp);
        // clear edge-triggered inputs
        input.current = { ...input.current, juke: false, dive: false, tuck: false, kneel: false, fairCatch: false, throwAt: null };
      }
      updateAimView(m);
      r.draw(m, view.current, pausedRef.current ? 0 : dt);
      while (m.sounds.length) sfx(m.sounds.shift()!);
      const sim = m.sim;
      const mode = controlMode(m);
      const key = `${m.stage}|${mode}|${m.g.down}|${m.g.quarter}|${m.meter?.phase ?? ''}|${sim?.phase ?? ''}|${m.g.timeouts.join()}`;
      if (key !== uiKey) {
        uiKey = key;
        setTick((x) => x + 1);
      }
      // save resumable progress at play boundaries
      if (m.canSnapshot() && m.stage !== lastSavedStage.current && m.stage !== 'final') {
        lastSavedStage.current = m.stage;
        saveLive(c.slot, m.snapshot()).catch(() => undefined);
      } else if (!m.canSnapshot()) lastSavedStage.current = '';
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ------------------------------------------------------------------ keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const m = matchRef.current;
      if (!m) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (k === 'escape' || k === 'p') {
        togglePause();
        return;
      }
      if (pausedRef.current) return;
      keys.current.add(k);
      if (k === 'shift') sprintHeld.current = true;
      const sim = m.sim;
      const mode = controlMode(m);
      if (k === ' ' || k === 'enter') {
        if (m.stage === 'presnap') return m.snap();
        if (m.stage === 'kick') return m.kickTap();
        if (m.stage === 'result') return m.continueResult();
        if (mode === 'aim' && kbAim.current && sim) {
          input.current.throwAt = { ...kbAim.current };
          return;
        }
        if (mode === 'carry') input.current.juke = true;
        if (mode === 'returnAir' && sim?.setup.kind === 'punt') input.current.fairCatch = true;
      }
      if (k === 'x' || k === 'c') input.current.dive = true;
      if (k === 'e' && mode === 'aim') input.current.tuck = true;
      if (k === 'k') input.current.kneel = true;
      if (k === 'f') input.current.fairCatch = true;
      if (k === 't' && (m.stage === 'playcall' || m.stage === 'defcall' || m.stage === 'presnap')) {
        m.userTimeout();
        setTick((x) => x + 1);
      }
      if (/^[1-6]$/.test(k) && mode === 'aim' && sim) {
        const recs = sim.actors.filter((a) => a.side === 0 && a.route && ['X', 'Z', 'SLOT', 'SLOT2', 'TE', 'TE2', 'RB', 'FB'].includes(a.role)).sort((p, q) => p.hy - q.hy);
        const r = recs[Number(k) - 1];
        if (r) kbAim.current = { x: r.x, y: r.y };
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current.delete(k);
      if (k === 'shift') sprintHeld.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }

  // ------------------------------------------------------------------ input helpers
  function controlMode(m: Match): 'aim' | 'carry' | 'returnAir' | 'qbPocket' | 'watch' | 'none' {
    const sim = m.sim;
    if (!sim || m.stage !== 'live' || sim.phase !== 'live') return 'none';
    if (sim.userActor < 0) return 'watch';
    if (sim.setup.kind === 'scrimmage' && sim.userActor === sim.qb && sim.canThrow()) return 'aim';
    if (sim.carrier === sim.userActor) return 'carry';
    if (sim.setup.kind !== 'scrimmage' && sim.ball.state === 'air') return 'returnAir';
    if (sim.setup.kind === 'scrimmage' && sim.userActor === sim.qb && sim.ball.holder === sim.qb) return 'qbPocket';
    return 'watch';
  }

  function stickVector(): { x: number; y: number } | null {
    for (const p of ptrs.current.values()) {
      if (p.role !== 'stick') continue;
      const dx = p.x - p.sx;
      const dy = p.y - p.sy;
      const d = Math.hypot(dx, dy);
      if (d < 6) return null;
      const s = Math.min(1, d / 45);
      return { x: (dx / d) * s, y: (dy / d) * s };
    }
    return null;
  }

  function buildInput(m: Match): PlayInput {
    const k = keys.current;
    const mode = controlMode(m);
    let mx = 0;
    let my = 0;
    const arrowsMoveQB = mode !== 'aim';
    if (k.has('w') || (arrowsMoveQB && k.has('arrowup'))) my -= 1;
    if (k.has('s') || (arrowsMoveQB && k.has('arrowdown'))) my += 1;
    if (k.has('a') || (arrowsMoveQB && k.has('arrowleft'))) mx -= 1;
    if (k.has('d') || (arrowsMoveQB && k.has('arrowright'))) mx += 1;
    // keyboard reticle while aiming
    if (mode === 'aim' && m.sim) {
      if (!kbAim.current) kbAim.current = { x: m.sim.los + 10, y: m.sim.actors[m.sim.qb]?.y ?? 26 };
      const sp = 0.6;
      if (k.has('arrowup')) kbAim.current.y -= sp;
      if (k.has('arrowdown')) kbAim.current.y += sp;
      if (k.has('arrowleft')) kbAim.current.x -= sp;
      if (k.has('arrowright')) kbAim.current.x += sp;
    } else if (mode !== 'qbPocket') kbAim.current = null;
    let move: { x: number; y: number } | null = mx || my ? { x: mx, y: my } : null;
    const stick = stickVector();
    if (stick) move = stick;
    let sprint = sprintHeld.current;
    for (const p of ptrs.current.values()) if (p.role === 'stick' && Math.hypot(p.x - p.sx, p.y - p.sy) > 40) sprint = sprint || false;
    return { ...input.current, move, sprint };
  }

  function aimTarget(m: Match, p: Ptr): { x: number; y: number } | null {
    const sim = m.sim;
    const r = rendRef.current;
    if (!sim || !r) return null;
    const q = sim.actors[sim.qb];
    if (!q) return null;
    const rect = canvasRef.current!.getBoundingClientRect();
    if (settingsRef.current.aimStyle === 'point') return r.screenToSim(m, p.x - rect.left, p.y - rect.top);
    const k = 2.4 / r.screenPPY;
    return { x: q.x + (p.sx - p.x) * k, y: q.y + (p.sy - p.y) * k };
  }

  function updateAimView(m: Match) {
    const sim = m.sim;
    view.current.aim = null;
    view.current.joystick = null;
    view.current.keyboardAim = kbAim.current && controlMode(m) === 'aim' ? kbAim.current : null;
    if (!sim) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    for (const p of ptrs.current.values()) {
      if (p.role === 'aim') {
        const t = aimTarget(m, p);
        if (t && Math.hypot(p.x - p.sx, p.y - p.sy) > 8) {
          const q = sim.actors[sim.qb];
          const d = Math.hypot(t.x - q.x, t.y - q.y);
          const err = (0.25 + d * 0.026) * (1.55 - q.sp.r.tha / 100) * 1.4;
          view.current.aim = { active: true, tx: t.x, ty: t.y, err };
        }
      } else if (p.role === 'stick' && rect) {
        const dx = p.x - p.sx;
        const dy = p.y - p.sy;
        const d = Math.hypot(dx, dy) || 1;
        const s = Math.min(1, d / 45);
        view.current.joystick = { x: p.sx - rect.left, y: p.sy - rect.top, dx: (dx / d) * s, dy: (dy / d) * s };
      }
    }
  }

  // ------------------------------------------------------------------ pointer events on the field
  const onDown = (e: React.PointerEvent) => {
    const m = matchRef.current;
    if (!m || pausedRef.current) return;
    unlockAudio();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const mode = controlMode(m);
    let role: Ptr['role'] = 'none';
    if (m.stage === 'presnap') m.snap();
    else if (m.stage === 'kick') m.kickTap();
    else if (m.stage === 'result') m.continueResult();
    else if (mode === 'aim') role = 'aim';
    else if (mode === 'carry' || mode === 'qbPocket') {
      const hasStick = [...ptrs.current.values()].some((p) => p.role === 'stick');
      if (hasStick) input.current.juke = true;
      else role = 'stick';
    }
    ptrs.current.set(e.pointerId, { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, role, t: performance.now() });
  };
  const onMove = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const m = matchRef.current;
    // an aim that starts before the QB can throw becomes a joystick once he tucks
    if (m && p.role === 'aim' && controlMode(m) === 'carry') {
      p.role = 'stick';
      p.sx = p.x;
      p.sy = p.y;
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId);
    ptrs.current.delete(e.pointerId);
    const m = matchRef.current;
    if (!p || !m) return;
    if (p.role === 'aim' && controlMode(m) === 'aim') {
      const moved = Math.hypot(p.x - p.sx, p.y - p.sy);
      if (moved > 12) {
        const t = aimTarget(m, p);
        if (t) input.current.throwAt = t;
      }
    }
  };

  // ------------------------------------------------------------------ finishing
  const finishGame = async () => {
    const m = matchRef.current!;
    if (finishing || !game) return;
    setFinishing(true);
    const box = m.finishBox();
    const rng = careerRng(c);
    applyGameResult(c, game, box, rng);
    saveRng(c, rng);
    recordWeekFinances(c, game.home === c.userTeam);
    completeWeekAfterUserGame(c);
    await clearLive(c.slot);
    await app.persist();
    app.reset({ name: 'hub' });
    app.go('postgame', { gameId: game.id });
  };

  const quit = async () => {
    const m = matchRef.current!;
    if (m.canSnapshot()) await saveLive(c.slot, m.snapshot());
    app.reset({ name: 'hub' });
  };

  if (!game) {
    return (
      <div className="screen">
        <p>No game this week.</p>
        <Btn onClick={() => app.reset({ name: 'hub' })}>Back</Btn>
      </div>
    );
  }

  const m = matchRef.current;
  const mode = m ? controlMode(m) : 'none';
  const g = m?.g;
  const fgOk = m && g ? m.canFieldGoal() : false;
  const userTeam = c.teams[c.userTeam];
  const left = app.settings.leftHanded;

  return (
    <div className="game-root" ref={rootRef}>
      <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      {m && g && (
        <div className="overlay">
          <button className="gbtn rect pausebtn" onPointerDown={(e) => { e.stopPropagation(); togglePause(); }}>II</button>

          {m.stage === 'coin' && !app.settings.tutorialSeen && (
            <div className="center-msg" style={{ zIndex: 4, textAlign: 'left' }}>
              <h1 className="center">HOW TO PLAY</h1>
              <div className="small">
                <p><b className="gold">Call a play</b> from the cards. Routes are drawn before the snap. Tap the field or SNAP to hike.</p>
                <p><b className="gold">Pass:</b> drag back like a slingshot (away from your target) and release. Lead your receiver! Numbers show who is running a route.</p>
                <p><b className="gold">Run:</b> drag anywhere to steer. JUKE right before contact, BURST to sprint, DIVE for extra yards.</p>
                <p><b className="gold">Kick:</b> tap once to set aim in the green, again to set power.</p>
                <p><b className="gold">Defense:</b> pick a call and watch your players react. Keyboard works too: Space, arrows, WASD, Shift.</p>
              </div>
              <div className="center"><Btn kind="green" onClick={() => app.setSettings({ ...app.settings, tutorialSeen: true })}>Got it</Btn></div>
            </div>
          )}

          {m.stage === 'coin' && (
            <div className="center-msg">
              <h1>{c.teams[game.away].abbr} @ {c.teams[game.home].abbr}</h1>
              <div className="small muted" style={{ marginBottom: 8 }}>{game.playoff ? ROUND_NAME[game.playoff] : `Week ${game.week}`} - {m.weather.toUpperCase()}</div>
              <h2>COIN TOSS - CALL IT</h2>
              <div className="row" style={{ justifyContent: 'center' }}>
                <Btn size="big" onClick={() => { unlockAudio(); m.callCoin('heads'); setTick((x) => x + 1); }}>Heads</Btn>
                <Btn size="big" onClick={() => { unlockAudio(); m.callCoin('tails'); setTick((x) => x + 1); }}>Tails</Btn>
              </div>
            </div>
          )}

          {m.coinResult && m.g.plays === 0 && (m.stage === 'kickoffChoice' || (m.stage === 'live' && m.sim?.setup.kind !== 'scrimmage')) && (
            <div className="rotate-tip" style={{ top: 'calc(46px + var(--safe-top))' }}>{m.coinResult}</div>
          )}

          {m.stage === 'playcall' && (
            <div className="callpanel">
              <div className="head">
                <div>
                  <div className="pixel" style={{ fontSize: 10 }}>{m.twoPointTry ? 'TWO-POINT TRY' : m.situation()}</div>
                  <div className="small muted">{quarterText(g.quarter)} {clockText(g.clock)} - {userTeam.abbr} {g.score[m.userSide]} - {c.teams[m.userSide === 0 ? game.away : game.home].abbr} {g.score[other(m.userSide)]} {g.clockRunning ? '- clock running' : '- clock stopped'}</div>
                </div>
                <div className="row wrap">
                  {!m.twoPointTry && g.down === 4 && <Btn size="small" kind="blue" onClick={() => m.choosePlay('punt')}>Punt</Btn>}
                  {!m.twoPointTry && fgOk && (g.down === 4 || g.clock < 40 || g.quarter >= 4) && (
                    <Btn size="small" kind="blue" onClick={() => m.choosePlay('fg')}>FG ({fgDistance(g.ballOn)})</Btn>
                  )}
                  {!m.twoPointTry && g.down < 4 && fgOk && !(g.clock < 40 || g.quarter >= 4) && <Btn size="small" kind="ghost" onClick={() => m.choosePlay('fg')}>FG</Btn>}
                  <Btn size="small" kind="ghost" disabled={!g.clockRunning || g.timeouts[m.userSide] === 0 || m.runoffDone} onClick={() => { m.userTimeout(); setTick((x) => x + 1); }}>Timeout ({g.timeouts[m.userSide]})</Btn>
                </div>
              </div>
              <div className="tabs" style={{ marginBottom: 6 }}>
                {CATS.map((ct) => (
                  <button key={ct.id} className={`tab ${cat === ct.id ? 'on' : ''}`} onClick={() => setCat(ct.id)}>{ct.label}</button>
                ))}
              </div>
              <div className="plays">
                {PLAYS.filter((p) => (cat === 'all' ? true : p.cat === cat) && !(m.twoPointTry && (p.id === 'spike' || p.id === 'kneel'))).map((p) => (
                  <button key={p.id} className="playcard" onClick={() => { sfx('click'); m.choosePlay(p.id); setTick((x) => x + 1); }}>
                    <img src={playDiagram(p)} alt="" style={{ width: '100%', imageRendering: 'pixelated', display: 'block', borderRadius: 3 }} />
                    <div className="nm">{p.name}</div>
                    <div className="ds">{p.desc}</div>
                    <div className="risk" style={{ color: p.risk === 3 ? 'var(--red)' : p.risk === 2 ? 'var(--gold)' : 'var(--green)' }}>{'●'.repeat(p.risk)}{'○'.repeat(3 - p.risk)} {p.cat}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {m.stage === 'defcall' && (
            <div className="callpanel">
              <div className="head">
                <div>
                  <div className="pixel" style={{ fontSize: 10 }}>DEFENSE: {m.g.phase === 'pat' ? 'TWO-POINT TRY' : m.situation()}</div>
                  <div className="small muted">{quarterText(g.quarter)} {clockText(g.clock)} - {c.teams[m.userSide === 0 ? game.away : game.home].abbr} ball</div>
                </div>
                <div className="row wrap">
                  <Btn size="small" kind="blue" onClick={() => { m.chooseDefense(null); setTick((x) => x + 1); }}>Auto (DC calls it)</Btn>
                  <Btn size="small" kind="ghost" disabled={!g.clockRunning || g.timeouts[m.userSide] === 0} onClick={() => { m.userTimeout(); setTick((x) => x + 1); }}>Timeout ({g.timeouts[m.userSide]})</Btn>
                </div>
              </div>
              <div className="plays">
                {DEF_CALLS.map((d) => (
                  <button key={d.id} className="playcard" onClick={() => { sfx('click'); m.chooseDefense(d.id); setTick((x) => x + 1); }}>
                    <img src={defDiagram(d)} alt="" style={{ width: '100%', imageRendering: 'pixelated', display: 'block', borderRadius: 3 }} />
                    <div className="nm">{d.name}</div>
                    <div className="ds">{d.desc}</div>
                    <div className="risk muted">vs {d.vs}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {m.stage === 'presnap' && m.userOnOffense && (
            <>
              <div className="hint">{m.play?.name} - tap the field or press SNAP</div>
              <button className="gbtn" style={{ [left ? 'left' : 'right']: 'calc(16px + var(--safe-right))', bottom: 'calc(16px + var(--safe-bottom))', width: 84, height: 84 }} onPointerDown={(e) => { e.stopPropagation(); m.snap(); }}>SNAP</button>
              <button className="gbtn rect blue" style={{ [left ? 'right' : 'left']: 'calc(12px + var(--safe-left))', bottom: 'calc(16px + var(--safe-bottom))' }} onPointerDown={(e) => { e.stopPropagation(); m.changePlay(); setTick((x) => x + 1); }}>CHANGE PLAY</button>
            </>
          )}

          {m.stage === 'live' && mode === 'aim' && (
            <>
              <div className="hint">{app.settings.aimStyle === 'pull' ? 'Drag back to aim, release to throw' : 'Drag to the spot, release to throw'}</div>
              <button className="gbtn red" style={{ [left ? 'right' : 'left']: 'calc(16px + var(--safe-left))', bottom: 'calc(16px + var(--safe-bottom))' }} onPointerDown={(e) => { e.stopPropagation(); input.current.tuck = true; }}>RUN</button>
            </>
          )}
          {m.stage === 'live' && (mode === 'carry' || mode === 'qbPocket') && (
            <>
              <button className="gbtn" style={{ [left ? 'left' : 'right']: 'calc(90px + var(--safe-right))', bottom: 'calc(18px + var(--safe-bottom))' }} onPointerDown={(e) => { e.stopPropagation(); input.current.juke = true; }}>JUKE</button>
              <button className="gbtn blue" style={{ [left ? 'left' : 'right']: 'calc(14px + var(--safe-right))', bottom: 'calc(64px + var(--safe-bottom))' }} onPointerDown={(e) => { e.stopPropagation(); input.current.dive = true; }}>{m.sim && m.sim.carrier === m.sim.qb ? 'SLIDE' : 'DIVE'}</button>
              <button
                className={`gbtn red ${sprintHeld.current ? 'on' : ''}`}
                style={{ [left ? 'left' : 'right']: 'calc(14px + var(--safe-right))', bottom: 'calc(140px + var(--safe-bottom))', width: 58, height: 58 }}
                onPointerDown={(e) => { e.stopPropagation(); sprintHeld.current = true; }}
                onPointerUp={(e) => { e.stopPropagation(); sprintHeld.current = false; }}
                onPointerCancel={() => { sprintHeld.current = false; }}
                onPointerLeave={() => { sprintHeld.current = false; }}
              >
                BURST
              </button>
              {m.sim && m.sim.setup.kind !== 'scrimmage' && m.sim.carrier === m.sim.userActor && m.sim.actors[m.sim.carrier].x <= 0.5 && (
                <button className="gbtn rect blue" style={{ left: '50%', transform: 'translateX(-50%)', bottom: 'calc(16px + var(--safe-bottom))' }} onPointerDown={(e) => { e.stopPropagation(); input.current.kneel = true; }}>TAKE A KNEE</button>
              )}
              {m.g.plays < 6 && <div className="hint" style={{ bottom: 'calc(90px + var(--safe-bottom))' }}>Drag anywhere to steer</div>}
            </>
          )}
          {m.stage === 'live' && mode === 'returnAir' && m.sim?.setup.kind === 'punt' && (
            <button className="gbtn rect blue" style={{ left: '50%', transform: 'translateX(-50%)', bottom: 'calc(16px + var(--safe-bottom))' }} onPointerDown={(e) => { e.stopPropagation(); input.current.fairCatch = true; }}>FAIR CATCH</button>
          )}
          {m.stage === 'live' && mode === 'watch' && m.sim && m.simOff !== m.userSide && (
            <button className="gbtn rect" style={{ right: 'calc(10px + var(--safe-right))', bottom: 'calc(14px + var(--safe-bottom))' }} onPointerDown={(e) => { e.stopPropagation(); m.sim!.runHeadless(); }}>SKIP ▶▶</button>
          )}

          {m.stage === 'kick' && (
            <button className="gbtn" style={{ [left ? 'left' : 'right']: 'calc(16px + var(--safe-right))', bottom: 'calc(16px + var(--safe-bottom))', width: 84, height: 84 }} onPointerDown={(e) => { e.stopPropagation(); m.kickTap(); }}>KICK</button>
          )}

          {m.stage === 'pat' && (
            <div className="center-msg">
              <h2>TOUCHDOWN! POINT AFTER</h2>
              <div className="row" style={{ justifyContent: 'center' }}>
                <Btn size="big" onClick={() => { m.choosePat('xp'); setTick((x) => x + 1); }}>Kick Extra Point</Btn>
                <Btn size="big" kind="blue" onClick={() => { m.choosePat('2pt'); setTick((x) => x + 1); }}>Go For Two</Btn>
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>Score: {userTeam.abbr} {g.score[m.userSide]} - {g.score[other(m.userSide)]}</div>
            </div>
          )}

          {m.stage === 'kickoffChoice' && (
            <div className="center-msg">
              <h2>KICKOFF</h2>
              <div className="row" style={{ justifyContent: 'center' }}>
                <Btn size="big" onClick={() => { m.chooseKickoff('normal'); setTick((x) => x + 1); }}>Kick Deep</Btn>
                <Btn size="big" kind="blue" onClick={() => { m.chooseKickoff('onside'); setTick((x) => x + 1); }}>Onside Kick</Btn>
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>Onside kicks are recovered only about 1 time in 9.</div>
            </div>
          )}

          {m.stage === 'result' && <div className="hint">Tap to continue</div>}

          {m.stage === 'halftime' && (
            <div className="center-msg">
              <h1>HALFTIME</h1>
              <HalfStats m={m} />
              <Btn size="big" kind="green" onClick={() => { m.next(); setTick((x) => x + 1); }}>Start Second Half</Btn>
            </div>
          )}

          {m.stage === 'final' && (
            <div className="center-msg">
              <h1>FINAL{g.quarter >= 5 ? ' / OT' : ''}</h1>
              <div className="pixel" style={{ fontSize: 16, margin: '8px 0' }}>
                {c.teams[game.away].abbr} {g.score[1]} - {g.score[0]} {c.teams[game.home].abbr}
              </div>
              <div className={`pixel ${g.score[m.userSide] > g.score[other(m.userSide)] ? 'green' : g.score[m.userSide] < g.score[other(m.userSide)] ? 'red' : 'gold'}`} style={{ fontSize: 12, marginBottom: 10 }}>
                {g.score[m.userSide] > g.score[other(m.userSide)] ? 'VICTORY!' : g.score[m.userSide] < g.score[other(m.userSide)] ? 'DEFEAT' : 'TIE'}
              </div>
              <HalfStats m={m} />
              <Btn size="big" kind="green" disabled={finishing} onClick={finishGame}>{finishing ? 'Saving...' : 'Continue'}</Btn>
            </div>
          )}

          {view.current.portrait && m.stage === 'live' && <div className="rotate-tip">Rotate for a wider view</div>}

          {paused && (
            <div className="center-msg" style={{ zIndex: 5 }}>
              <h1>PAUSED</h1>
              <div className="small muted" style={{ marginBottom: 8 }}>{m.clockLine()} - {c.teams[game.away].abbr} {g.score[1]} @ {c.teams[game.home].abbr} {g.score[0]}</div>
              <div className="col">
                <Btn kind="green" wide onClick={togglePause}>Resume</Btn>
                <div className="grid2">
                  <Btn kind="blue" wide onClick={() => app.setSettings({ ...app.settings, sound: !app.settings.sound })}>Sound: {app.settings.sound ? 'On' : 'Off'}</Btn>
                  <Btn kind="blue" wide onClick={() => app.setSettings({ ...app.settings, gameSpeed: app.settings.gameSpeed >= 1.2 ? 0.85 : app.settings.gameSpeed >= 1 ? 1.25 : 1 })}>Speed: {app.settings.gameSpeed >= 1.2 ? 'Fast' : app.settings.gameSpeed >= 1 ? 'Normal' : 'Slow'}</Btn>
                  <Btn kind="blue" wide onClick={() => app.setSettings({ ...app.settings, defenseMode: app.settings.defenseMode === 'call' ? 'auto' : 'call' })}>Defense calls: {app.settings.defenseMode === 'call' ? 'You' : 'Auto'}</Btn>
                  <Btn kind="blue" wide onClick={() => app.setSettings({ ...app.settings, defenseView: app.settings.defenseView === 'watch' ? 'fast' : app.settings.defenseView === 'fast' ? 'skip' : 'watch' })}>Defense view: {app.settings.defenseView}</Btn>
                  <Btn kind="blue" wide onClick={() => app.setSettings({ ...app.settings, aimStyle: app.settings.aimStyle === 'pull' ? 'point' : 'pull' })}>Aim: {app.settings.aimStyle === 'pull' ? 'Pull back' : 'Point'}</Btn>
                  <Btn kind="blue" wide onClick={() => app.setSettings({ ...app.settings, showRoutes: !app.settings.showRoutes })}>Routes: {app.settings.showRoutes ? 'Shown' : 'Hidden'}</Btn>
                </div>
                <Btn kind="blue" wide onClick={() => { if (confirm('Simulate the rest of this game?')) { m.simulateRest(); togglePause(); setTick((x) => x + 1); } }}>Simulate Rest of Game</Btn>
                <Btn kind="ghost" wide onClick={quit}>Save & Quit to Hub</Btn>
              </div>
              <div className="tiny muted" style={{ marginTop: 8 }}>Keyboard: WASD move, arrows aim, Space snap/throw/juke, Shift burst, X dive, E run, T timeout, P pause</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HalfStats({ m }: { m: Match }) {
  const T = m.box.team;
  const H = m.team(0);
  const A = m.team(1);
  const rows: [string, string | number, string | number][] = [
    ['Total yards', T[1].yds, T[0].yds],
    ['Passing', T[1].passYds, T[0].passYds],
    ['Rushing', T[1].rushYds, T[0].rushYds],
    ['First downs', T[1].firstDowns, T[0].firstDowns],
    ['Turnovers', T[1].turnovers, T[0].turnovers],
    ['Sacks', T[1].sacks, T[0].sacks],
  ];
  return (
    <table className="t" style={{ margin: '6px 0 12px' }}>
      <thead><tr><th /><th className="num">{A.abbr}</th><th className="num">{H.abbr}</th></tr></thead>
      <tbody>{rows.map(([l, a, h]) => <tr key={l}><td>{l}</td><td className="num">{a}</td><td className="num">{h}</td></tr>)}</tbody>
    </table>
  );
}
