import { Btn, Panel, TopBar, useApp } from './common';
import { exportCareer } from '../save/storage';
import type { Settings } from '../save/settings';
import { sfx } from '../audio/sfx';

function Toggle({ label, value, onChange, desc }: { label: string; value: boolean; onChange: (v: boolean) => void; desc?: string }) {
  return (
    <div className="spread" style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
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
    <div style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
      <div>{label}</div>
      {desc && <div className="muted tiny">{desc}</div>}
      <div className="row wrap" style={{ marginTop: 4 }}>
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
  const set = (patch: Partial<Settings>) => app.setSettings({ ...s, ...patch });
  const c = app.career;
  return (
    <div className="screen">
      <TopBar title="SETTINGS" />
      <Panel title="AUDIO">
        <Toggle label="Sound effects" value={s.sound} onChange={(v) => set({ sound: v })} />
        <Toggle label="Menu music" value={s.music} onChange={(v) => set({ music: v })} />
        <div className="spread" style={{ padding: '6px 0' }}>
          <span>Volume</span>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} style={{ width: 180 }} />
        </div>
      </Panel>
      <Panel title="GAMEPLAY">
        <Choice label="Quarter length" value={s.quarterMinutes} options={[3, 4, 5, 6, 8, 10, 15].map((v) => ({ v, l: `${v} min` }))} onChange={(v) => set({ quarterMinutes: v })} desc="Game-clock minutes per quarter. Simulated league games use the same length so stats stay comparable." />
        <Choice label="Game speed" value={s.gameSpeed} options={[{ v: 0.85, l: 'Slow' }, { v: 1, l: 'Normal' }, { v: 1.25, l: 'Fast' }]} onChange={(v) => set({ gameSpeed: v })} />
        <Choice label="Passing aim" value={s.aimStyle} options={[{ v: 'pull', l: 'Pull back (slingshot)' }, { v: 'point', l: 'Point at target' }]} onChange={(v) => set({ aimStyle: v })} desc="Pull back: drag away from where you want to throw. Point: drag to the spot." />
        <Choice label="Defensive play calls" value={s.defenseMode} options={[{ v: 'call', l: 'I call them' }, { v: 'auto', l: 'Coordinator' }]} onChange={(v) => set({ defenseMode: v })} />
        <Choice label="Opponent drives" value={s.defenseView} options={[{ v: 'watch', l: 'Watch' }, { v: 'fast', l: 'Fast' }, { v: 'skip', l: 'Results only' }]} onChange={(v) => set({ defenseView: v })} />
        <Toggle label="Show routes before the snap" value={s.showRoutes} onChange={(v) => set({ showRoutes: v })} />
        <Toggle label="Left-handed controls" value={s.leftHanded} onChange={(v) => set({ leftHanded: v })} desc="Mirrors the on-screen buttons." />
        <Toggle label="Random front-office events" value={s.randomEvents} onChange={(v) => set({ randomEvents: v })} />
      </Panel>
      <Panel title="DATA">
        {c ? (
          <div className="col">
            <div className="small muted">Your career saves automatically after games and important decisions. Export a JSON backup to move it to another device.</div>
            <div className="row wrap">
              <Btn onClick={() => app.persist(false)}>Save Now</Btn>
              <Btn kind="blue" onClick={() => exportCareer(c)}>Export Career (JSON)</Btn>
              <Btn kind="blue" onClick={() => app.go('slots', { mode: 'load' })}>Import / Load</Btn>
            </div>
          </div>
        ) : (
          <div className="row wrap">
            <Btn kind="blue" onClick={() => app.go('slots', { mode: 'load' })}>Import / Load Career</Btn>
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <Btn kind="ghost" size="small" onClick={() => { set({ tutorialSeen: false }); app.toast('Tutorial tips reset'); }}>Reset tutorial tips</Btn>
        </div>
      </Panel>
      <div className="muted tiny center">Gridiron Legends v1.0 - an original game. Installable: use "Add to Home Screen" in Safari.</div>
    </div>
  );
}
