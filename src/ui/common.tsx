import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { Player, Team } from '../core/types';
import type { Career } from '../league/career';
import type { Settings } from '../save/settings';
import { drawEmblem, SKINS, HAIR, shade } from '../render/sprites';
import { sfx } from '../audio/sfx';
import { portraitCanvas, portraitsReady } from '../render/assets';
import { potGrade } from '../league/players';

export type ScreenName =
  | 'title' | 'new' | 'slots' | 'hub' | 'roster' | 'depth' | 'league' | 'schedule' | 'stats' | 'records'
  | 'office' | 'trades' | 'freeagents' | 'offseason' | 'pregame' | 'game' | 'postgame' | 'settings' | 'help'
  | 'achievements' | 'box' | 'team';

export interface Route {
  name: ScreenName;
  params?: Record<string, unknown>;
}

export interface AppCtx {
  career: Career | null;
  setCareer: (c: Career | null) => void;
  refresh: () => void;
  persist: (quiet?: boolean) => Promise<void>;
  settings: Settings;
  setSettings: (s: Settings) => void;
  go: (name: ScreenName, params?: Record<string, unknown>) => void;
  replace: (name: ScreenName, params?: Record<string, unknown>) => void;
  back: () => void;
  reset: (r: Route) => void;
  toast: (msg: string) => void;
  version: number;
}

export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);

export function Btn(p: { children: ReactNode; onClick?: () => void; kind?: 'gold' | 'blue' | 'green' | 'red' | 'ghost'; size?: 'small' | 'big'; wide?: boolean; disabled?: boolean; title?: string }) {
  const cls = ['btn', p.kind && p.kind !== 'gold' ? p.kind : '', p.size ?? '', p.wide ? 'wide' : ''].join(' ');
  return (
    <button
      className={cls}
      disabled={p.disabled}
      title={p.title}
      onClick={() => {
        sfx('click');
        p.onClick?.();
      }}
    >
      {p.children}
    </button>
  );
}

export function Panel(p: { title?: string; children: ReactNode; dark?: boolean; className?: string }) {
  return (
    <div className={`panel ${p.dark ? 'dark' : ''} ${p.className ?? ''}`} style={p.title ? { paddingTop: 16 } : undefined}>
      {p.title && <div className="ptitle">{p.title}</div>}
      {p.children}
    </div>
  );
}

export function TopBar(p: { title: string; right?: ReactNode; noBack?: boolean }) {
  const app = useApp();
  return (
    <div className="topbar">
      {!p.noBack && (
        <Btn kind="blue" size="small" onClick={app.back}>
          ◀ Back
        </Btn>
      )}
      <div className="title">{p.title}</div>
      {p.right}
    </div>
  );
}

export function Tabs<T extends string>(p: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs">
      {p.tabs.map((t) => (
        <button
          key={t.id}
          className={`tab ${p.value === t.id ? 'on' : ''}`}
          onClick={() => {
            sfx('click');
            p.onChange(t.id);
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ovrColor(v: number) {
  if (v >= 85) return '#5fd35b';
  if (v >= 75) return '#b5e85a';
  if (v >= 65) return '#ffd23f';
  if (v >= 55) return '#ff9d4d';
  return '#ff6b6b';
}

export function Ovr({ v }: { v: number | string }) {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return (
    <span className="ovr" style={{ background: ovrColor(isNaN(n) ? 60 : n) }}>
      {v}
    </span>
  );
}

export function Bar({ v, max = 99, color }: { v: number; max?: number; color?: string }) {
  return (
    <div className="bar">
      <div style={{ width: `${Math.max(0, Math.min(100, (v / max) * 100))}%`, background: color ?? ovrColor(v) }} />
    </div>
  );
}

export function Stars({ n, max = 5 }: { n: number; max?: number }) {
  return <span className="stars">{'★'.repeat(n) + '☆'.repeat(Math.max(0, max - n))}</span>;
}

export function Modal(p: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && p.onClose?.()}>
      <div className="modal" style={p.wide ? { maxWidth: 900 } : undefined}>
        {p.children}
      </div>
    </div>
  );
}

export function TeamBadge({ team, size = 36 }: { team: Team; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const px = 32;
    cv.width = px;
    cv.height = px;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, px, px);
    const sec = team.colors.secondary === team.colors.primary ? '#ffffff' : team.colors.secondary;
    drawEmblem(ctx, 1, 1, 30, team.colors.primary, sec, team.abbr[0], team.emblem);
  }, [team]);
  return <canvas ref={ref} style={{ width: size, height: size, imageRendering: 'pixelated', flex: 'none' }} />;
}

/** Original procedural pixel portraits (head and shoulders in team colours). */
export function Face({ player, team, size = 56 }: { player: { id: number; look: Player['look'] }; team?: Team; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const artOn = portraitsReady();
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const art = portraitCanvas('players', player.id * 7 + player.look.skin, team?.colors.primary ?? '#3fd35b', team?.colors.secondary ?? '#ff4fd8');
    if (art) {
      cv.width = art.width;
      cv.height = art.height;
      const c2 = cv.getContext('2d')!;
      c2.clearRect(0, 0, cv.width, cv.height);
      c2.drawImage(art, 0, 0);
      return;
    }
    const W = 20;
    const H = 24;
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d')!;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, H);
    const skin = SKINS[player.look.skin % SKINS.length];
    const skinD = shade(skin, 0.82);
    const hair = HAIR[player.look.hairColor % HAIR.length];
    const jersey = team?.colors.primary ?? '#3fd35b';
    const trim = team?.colors.secondary ?? '#ff4fd8';
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(x, y, w, h);
    };
    // shoulders / jersey
    px(2, 17, 16, 7, jersey);
    px(1, 19, 18, 5, jersey);
    px(7, 17, 6, 2, trim);
    px(8, 17, 4, 1, skin);
    px(4, 21, 2, 3, shade(jersey, 0.75));
    px(14, 21, 2, 3, shade(jersey, 0.75));
    // neck
    px(8, 14, 4, 3, skinD);
    // head
    px(5, 4, 10, 11, skin);
    px(4, 6, 1, 6, skin);
    px(15, 6, 1, 6, skin);
    px(6, 14, 8, 1, skin);
    // hair styles
    const style = player.look.hair % 5;
    if (style === 0) px(5, 3, 10, 2, hair);
    if (style === 1) {
      px(5, 2, 10, 3, hair);
      px(4, 4, 1, 3, hair);
      px(15, 4, 1, 3, hair);
    }
    if (style === 2) {
      px(4, 1, 12, 4, hair);
      px(3, 3, 2, 5, hair);
      px(15, 3, 2, 5, hair);
    }
    if (style === 3) px(6, 3, 8, 1, hair);
    if (style === 4) {
      px(5, 2, 10, 3, hair);
      px(3, 4, 2, 9, hair);
      px(15, 4, 2, 9, hair);
    }
    // eyes, brows, mouth
    px(7, 8, 1, 1, '#1b1b1b');
    px(12, 8, 1, 1, '#1b1b1b');
    px(6, 7, 3, 1, shade(hair, 0.9));
    px(11, 7, 3, 1, shade(hair, 0.9));
    px(9, 9, 2, 2, skinD);
    px(8, 12, 4, 1, '#8a3b3b');
    if (player.look.beard) {
      px(5, 11, 10, 3, hair);
      px(6, 14, 8, 1, hair);
      px(8, 12, 4, 1, '#8a3b3b');
    }
    if (player.look.visor) px(5, 7, 10, 2, 'rgba(30,30,60,0.35)');
  }, [player, team, artOn]);
  return <canvas ref={ref} className="face" style={{ width: size, height: (size * 4) / 3 }} />;
}

export function money(v: number) {
  return `$${v.toFixed(1)}M`;
}

export function PotBadge({ p, known = true }: { p: Player; known?: boolean }) {
  return <span className="badge">{known ? potGrade(p.pot) : '?'}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="muted center" style={{ padding: 16 }}>{children}</div>;
}
