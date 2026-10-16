import { useState } from 'react';
import { Btn, Panel, TopBar, useApp, Tabs } from './common';
import { exportCareer } from '../save/storage';
import type { Settings } from '../save/settings';
import { sfx } from '../audio/sfx';

function Toggle({ label, value, onChange, desc }: { label: string; value: boolean; onChange: (v: boolean) => void; desc?: string }) {
  return (
    <div className="spread" style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
      <div>
        <div>{label}</div>
        {desc && <div className="muted tiny">{desc}</div>}
      </div>
      <Btn size="small" kind={value ? 'green' : 'ghost'} onClick={() => onChange(!value)}>{value ? 'On' : 'Off'}</Btn>
    </div>
  );
}

function Choice<T extends string | number>({ label, value, options, onChange, desc }: { label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; desc?: string }) {
  return (
    <div className="spread" style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.15)', flexWrap: 'wrap' }}>
      <div className="small">{label}</div>
      {desc && <div className="muted tiny">{desc}</div>}
      <div className="row" style={{ gap: 3 }}>
        {options.map((o) => (
          <button key={String(o.v)} className={`tab ${value === o.v ? 'on' : ''}`} onClick={() => { sfx('click'); onChange(o.v); }}>{o.l}</button>
        ))}
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const app = useApp();
  const s = app.settings;
  const [tab, setTab] = useState<'sound' | 'game' | 'controls' | 'data'>('game');
  const set = (patch: Partial<Settings>) => app.setSettings({ ...s, ...patch });
  const c = app.career;
  return (
    <div className="screen">
      <TopBar title="SETTINGS" />
      <Tabs tabs={[{ id: 'game', label: 'Game' }, { id: 'controls', label: 'Controls' }, { id: 'sound', label: 'Sound' }, { id: 'data', label: 'Data' }]} value={tab} onChange={setTab} />
      <Panel dark className="fill">
        {tab === 'sound' && (
          <>
            <Toggle label="Sound effects" value={s.sound} onChange={(v) => set({ sound: v })} />
            <Toggle label="Menu music" value={s.music} onChange={(v) => set({ music: v })} />
            <div className="spread" style={{ padding: '4px 0' }}>
              <span>Volume</span>
              <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} style={{ width: 160 }} />
            </div>
          </>
        )}
        {tab === 'game' && (
          <>
            <Choice label="Quarter length (min)" value={s.quarterMinutes} options={[3, 4, 5, 6, 8, 10, 15].map((v) => ({ v, l: String(v) }))} onChange={(v) => set({ quarterMinutes: v })} />
            <Choice label="Game speed" value={s.gameSpeed} options={[{ v: 0.85, l: 'Slow' }, { v: 1, l: 'Normal' }, { v: 1.25, l: 'Fast' }]} onChange={(v) => set({ gameSpeed: v })} />
            <Choice label="Opponent drives" value={s.defenseView} options={[{ v: 'watch', l: 'Watch' }, { v: 'fast', l: 'Fast' }, { v: 'skip', l: 'Results' }, { v: 'drive', l: 'Sim drive' }]} onChange={(v) => set({ defenseView: v })} />
            <Choice label="Play calling" value={s.playCalling} options={[{ v: 'choose', l: 'I call them' }, { v: 'coach', l: 'Coach picks' }, { v: 'option', l: 'Run or pass' }]} onChange={(v) => set({ playCalling: v })} />
            <Choice label="Drive direction" value={s.driveDir} options={[{ v: 'right', l: 'Right ▶' }, { v: 'left', l: '◀ Left' }]} onChange={(v) => set({ driveDir: v })} />
            <Choice label="Art style" value={s.artStyle} options={[{ v: 'sheet', l: 'Sprite sheets' }, { v: 'original', l: 'Original' }]} onChange={(v) => set({ artStyle: v })} />
            <Toggle label="Random front-office events" value={s.randomEvents} onChange={(v) => set({ randomEvents: v })} />
          </>
        )}
        {tab === 'controls' && (
          <>
            <Choice label="Passing aim" value={s.aimStyle} options={[{ v: 'pull', l: 'Pull back' }, { v: 'point', l: 'Point at target' }]} onChange={(v) => set({ aimStyle: v })} />
            <Choice label="Defensive play calls" value={s.defenseMode} options={[{ v: 'call', l: 'I call them' }, { v: 'auto', l: 'Coordinator' }]} onChange={(v) => set({ defenseMode: v })} />
            <Toggle label="Show routes before the snap" value={s.showRoutes} onChange={(v) => set({ showRoutes: v })} />
            <Toggle label="Left-handed buttons" value={s.leftHanded} onChange={(v) => set({ leftHanded: v })} />
            <div style={{ marginTop: 6 }}><Btn kind="ghost" size="small" onClick={() => { set({ tutorialSeen: false }); app.toast('Tutorial tips reset'); }}>Reset tutorial tips</Btn></div>
          </>
        )}
        {tab === 'data' && (
          <div className="col">
            <div className="small muted">Your career saves automatically after games and important decisions. Export a JSON backup to move it to another device.</div>
            <div className="row wrap">
              {c && <Btn onClick={() => app.persist(false)}>Save Now</Btn>}
              {c && <Btn kind="blue" onClick={() => exportCareer(c)}>Export JSON</Btn>}
              <Btn kind="blue" onClick={() => app.go('slots', { mode: 'load' })}>Import / Load</Btn>
            </div>
            <div className="muted tiny">Install: Safari Share → Add to Home Screen for full-screen play.</div>
          </div>
        )}
      </Panel>
    </div>
  );
}
