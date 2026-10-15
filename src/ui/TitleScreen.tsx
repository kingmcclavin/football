import { useEffect, useState } from 'react';
import { Btn, Modal, Panel, TopBar, useApp } from './common';
import { deleteSlot, exportRaw, importCareerFile, lastSlot, listSlots, loadCareer, SLOTS, type SlotMeta } from '../save/storage';
import { recordText } from '../league/standings';
import { userGameThisWeek } from '../league/season';
import { drawEmblem } from '../render/sprites';
import { useRef } from 'react';

function TitleArt() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    cv.width = 160;
    cv.height = 40;
    const c = cv.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    // a little field strip with a ball
    for (let x = 0; x < 160; x += 16) {
      c.fillStyle = (x / 16) % 2 ? '#3f9a3a' : '#48a842';
      c.fillRect(x, 8, 16, 26);
    }
    c.fillStyle = '#fff';
    for (let x = 0; x < 160; x += 16) c.fillRect(x, 8, 1, 26);
    c.fillStyle = '#8b4a1f';
    c.fillRect(74, 16, 12, 7);
    c.fillStyle = '#f4e6d0';
    c.fillRect(78, 18, 4, 1);
    c.fillRect(79, 17, 1, 3);
    c.fillRect(81, 17, 1, 3);
    drawEmblem(c, 2, 2, 20, '#c8102e', '#ffffff', 'G', 0);
    drawEmblem(c, 138, 2, 20, '#1f4fb4', '#ffd23f', 'L', 1);
  }, []);
  return <canvas ref={ref} style={{ width: '100%', maxWidth: 480, imageRendering: 'pixelated', display: 'block', margin: '0 auto' }} />;
}

export function TitleScreen() {
  const app = useApp();
  const [slots, setSlots] = useState<(SlotMeta | null)[] | null>(null);
  const [err, setErr] = useState<{ msg: string; raw?: string } | null>(null);
  useEffect(() => {
    listSlots().then(setSlots);
  }, []);
  const last = lastSlot();
  const contSlot = slots ? (last !== null && slots[last] ? last : slots.findIndex((s) => !!s)) : -1;
  const cont = contSlot >= 0 && slots ? slots[contSlot] : null;
  const c = app.career;

  const open = async (slot: number) => {
    const r = await loadCareer(slot);
    if (!r.career) {
      setErr({ msg: r.error ?? 'Could not load', raw: r.raw });
      return;
    }
    if (r.error) app.toast(r.error);
    app.setCareer(r.career);
    app.reset({ name: 'hub' });
  };

  const next = c ? userGameThisWeek(c) : null;
  // menu shortcuts load the most recent career first if needed
  const via = async (screen: 'roster' | 'league' | 'schedule' | 'stats') => {
    if (app.career) return app.go(screen);
    if (contSlot < 0) return;
    const r = await loadCareer(contSlot);
    if (!r.career) {
      setErr({ msg: r.error ?? 'Could not load', raw: r.raw });
      return;
    }
    app.setCareer(r.career);
    app.reset({ name: 'hub' });
    app.go(screen);
  };
  const canVia = !!c || !!cont;
  return (
    <div className="screen">
      <div className="logo">
        GRIDIRON
        <br />
        LEGENDS
        <small>RETRO FOOTBALL CAREER</small>
      </div>
      <TitleArt />
      <div className="col" style={{ maxWidth: 520, margin: '14px auto 0' }}>
        {c ? (
          <Panel title="CURRENT CAREER">
            <div className="spread">
              <div>
                <div className="pixel" style={{ fontSize: 10 }}>{c.teams[c.userTeam].city} {c.teams[c.userTeam].name}</div>
                <div className="muted small">
                  {c.year} season - {recordText(c.teams[c.userTeam])} - {c.phase === 'offseason' ? 'Offseason' : c.phase === 'playoffs' ? 'Playoffs' : `Week ${c.week}`}
                </div>
                {next && <div className="small">Next: {next.home === c.userTeam ? 'vs' : '@'} {c.teams[next.home === c.userTeam ? next.away : next.home].abbr}</div>}
              </div>
              <Btn kind="green" onClick={() => app.reset({ name: 'hub' })}>Resume</Btn>
            </div>
          </Panel>
        ) : cont ? (
          <Btn size="big" kind="green" wide onClick={() => open(contSlot)}>
            Continue Career
            <div className="small" style={{ fontFamily: 'var(--font-body)', textTransform: 'none', marginTop: 4 }}>
              {cont.team} - {cont.year} ({cont.record})
            </div>
          </Btn>
        ) : null}
        <Btn size="big" wide onClick={() => app.go('slots', { mode: 'new' })}>New Career</Btn>
        <Btn size="big" kind="blue" wide onClick={() => app.go('slots', { mode: 'load' })}>Load Career</Btn>
        <div className="grid2">
          <Btn kind="blue" wide disabled={!canVia} onClick={() => via('roster')}>Team & Roster</Btn>
          <Btn kind="blue" wide disabled={!canVia} onClick={() => via('league')}>League & Standings</Btn>
          <Btn kind="blue" wide disabled={!canVia} onClick={() => via('schedule')}>Schedule</Btn>
          <Btn kind="blue" wide disabled={!canVia} onClick={() => via('stats')}>Stats & Records</Btn>
          <Btn kind="blue" wide onClick={() => app.go('settings')}>Settings</Btn>
          <Btn kind="blue" wide onClick={() => app.go('help')}>Help & Controls</Btn>
        </div>
        <div className="muted tiny center" style={{ marginTop: 10 }}>
          Original game. All teams, players and art are fictional. Saves are stored on this device.
        </div>
      </div>
      {err && (
        <Modal onClose={() => setErr(null)}>
          <h2>Save problem</h2>
          <p>{err.msg}</p>
          <p className="muted small">Your data has not been deleted. You can download the raw save file to keep it safe.</p>
          <div className="row wrap">
            {err.raw && <Btn onClick={() => exportRaw(err.raw!, 'gridiron-damaged-save.json')}>Download raw save</Btn>}
            <Btn kind="blue" onClick={() => setErr(null)}>Close</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function SlotsScreen({ mode }: { mode: 'load' | 'new' }) {
  const app = useApp();
  const [slots, setSlots] = useState<(SlotMeta | null)[] | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [err, setErr] = useState<{ msg: string; raw?: string } | null>(null);
  const reload = () => listSlots().then(setSlots);
  useEffect(() => {
    reload();
  }, []);
  const open = async (slot: number) => {
    const r = await loadCareer(slot);
    if (!r.career) {
      setErr({ msg: r.error ?? 'Could not load', raw: r.raw });
      return;
    }
    if (r.error) app.toast(r.error);
    app.setCareer(r.career);
    app.reset({ name: 'hub' });
  };
  const importTo = (slot: number) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      const r = await importCareerFile(f, slot);
      if (!r.career) {
        setErr({ msg: r.error ?? 'Import failed' });
        return;
      }
      app.toast('Career imported');
      app.setCareer(r.career);
      app.reset({ name: 'hub' });
    };
    inp.click();
  };
  return (
    <div className="screen">
      <TopBar title={mode === 'new' ? 'NEW CAREER - CHOOSE SLOT' : 'LOAD CAREER'} />
      {!slots ? (
        <div className="muted">Loading...</div>
      ) : (
        Array.from({ length: SLOTS }, (_, i) => {
          const s = slots[i];
          return (
            <Panel key={i} title={`SLOT ${i + 1}`}>
              {s ? (
                <div className="spread">
                  <div>
                    <div className="pixel" style={{ fontSize: 10 }}>{s.team}</div>
                    <div className="muted small">
                      Coach {s.coach} - {s.year} - {s.record} - {s.phase === 'regular' ? `Week ${s.week}` : s.phase}
                    </div>
                    <div className="muted tiny">Saved {new Date(s.saved).toLocaleString()}</div>
                  </div>
                  <div className="col">
                    {mode === 'load' ? (
                      <Btn kind="green" size="small" onClick={() => open(i)}>Load</Btn>
                    ) : (
                      <Btn kind="red" size="small" onClick={() => setConfirm(i)}>Overwrite</Btn>
                    )}
                    {mode === 'load' && <Btn kind="ghost" size="small" onClick={() => setConfirm(i)}>Delete</Btn>}
                  </div>
                </div>
              ) : (
                <div className="spread">
                  <div className="muted">Empty slot</div>
                  <div className="row">
                    {mode === 'new' && <Btn kind="green" size="small" onClick={() => app.go('new', { slot: i })}>Start here</Btn>}
                    <Btn kind="blue" size="small" onClick={() => importTo(i)}>Import JSON</Btn>
                  </div>
                </div>
              )}
            </Panel>
          );
        })
      )}
      {confirm !== null && (
        <Modal onClose={() => setConfirm(null)}>
          <h2>{mode === 'new' ? 'Overwrite this career?' : 'Delete this career?'}</h2>
          <p>
            {mode === 'new'
              ? 'Starting a new career here will replace the existing save when you begin. Consider exporting it first from Settings.'
              : 'The career will be removed from this slot. A hidden backup copy is kept until the slot is reused.'}
          </p>
          <div className="row wrap">
            <Btn
              kind="red"
              onClick={async () => {
                const slot = confirm;
                setConfirm(null);
                if (mode === 'new') app.go('new', { slot });
                else {
                  await deleteSlot(slot);
                  reload();
                }
              }}
            >
              {mode === 'new' ? 'Yes, new career' : 'Delete'}
            </Btn>
            <Btn kind="blue" onClick={() => setConfirm(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}
      {err && (
        <Modal onClose={() => setErr(null)}>
          <h2>Problem</h2>
          <p>{err.msg}</p>
          <div className="row wrap">
            {err.raw && <Btn onClick={() => exportRaw(err.raw!, 'gridiron-damaged-save.json')}>Download raw save</Btn>}
            <Btn kind="blue" onClick={() => setErr(null)}>Close</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
