import { useState } from 'react';
import { Panel, Tabs, TopBar, useApp, Empty, TeamBadge } from './common';
import { Paged, PagedTable } from './paged';
import type { Player, StatLine } from '../core/types';
import { RECORD_KEYS, TEAM_RECORD_LABEL } from '../league/records';
import { ACHIEVEMENTS } from '../league/achievements';
import { teamPlayers } from '../league/career';
import { PlayerModal } from './Roster';

const LEADERS: { key: keyof StatLine; label: string }[] = [
  { key: 'pYds', label: 'Passing Yards' },
  { key: 'pTd', label: 'Passing TD' },
  { key: 'rYds', label: 'Rushing Yards' },
  { key: 'rTd', label: 'Rushing TD' },
  { key: 'recYds', label: 'Receiving Yards' },
  { key: 'rec', label: 'Receptions' },
  { key: 'recTd', label: 'Receiving TD' },
  { key: 'tkl', label: 'Tackles' },
  { key: 'sacks', label: 'Sacks' },
  { key: 'dInt', label: 'Interceptions' },
  { key: 'fgM', label: 'Field Goals' },
  { key: 'krYds', label: 'Return Yards' },
];

export function StatsScreen() {
  const app = useApp();
  const c = app.career!;
  const [tab, setTab] = useState<'leaders' | 'team' | 'teams'>('leaders');
  const [cat, setCat] = useState<keyof StatLine>('pYds');
  const [sel, setSel] = useState<Player | null>(null);
  const active = c.players.filter((p) => p.teamId >= 0);
  const top = [...active].filter((p) => (p.season[cat] ?? 0) > 0).sort((a, b) => b.season[cat] - a.season[cat]).slice(0, 30);
  return (
    <div className="screen">
      <TopBar title={`${c.year} STATS`} />
      <Tabs tabs={[{ id: 'leaders', label: 'Leaders' }, { id: 'team', label: 'My Team' }, { id: 'teams', label: 'Teams' }]} value={tab} onChange={setTab} />
      {tab === 'leaders' && (
        <>
          <select value={cat} onChange={(e) => setCat(e.target.value as keyof StatLine)} aria-label="Stat category">
            {LEADERS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
          <Panel dark className="fill">
            {top.length === 0 ? <Empty>No stats yet.</Empty> : (
              <PagedTable
                rows={top.map((p, i) => ({ p, i }))}
                rowKey={(r) => r.p.id}
                resetKey={cat}
                head={<tr><th>#</th><th>PLAYER</th><th>TM</th><th className="num">{LEADERS.find((l) => l.key === cat)!.label.toUpperCase()}</th></tr>}
                row={({ p, i }) => (
                  <tr key={p.id} className={`click ${p.teamId === c.userTeam ? 'me' : ''}`} onClick={() => setSel(p)}>
                    <td>{i + 1}</td><td>{p.pos} {p.first[0]}. {p.last}</td><td>{c.teams[p.teamId].abbr}</td><td className="num">{p.season[cat]}</td>
                  </tr>
                )}
              />
            )}
          </Panel>
        </>
      )}
      {tab === 'team' && <MyTeamStats onPick={setSel} />}
      {tab === 'teams' && <TeamStats />}
      {sel && <PlayerModal p={sel} onClose={() => setSel(null)} mode={sel.teamId === c.userTeam ? 'own' : 'view'} />}
    </div>
  );
}

function MyTeamStats({ onPick }: { onPick: (p: Player) => void }) {
  const app = useApp();
  const c = app.career!;
  const [k, setK] = useState<'pass' | 'rush' | 'rec' | 'def' | 'kick'>('pass');
  const ps = teamPlayers(c, c.userTeam);
  const defs: Record<typeof k, { cols: string[]; list: Player[]; vals: (p: Player) => (string | number)[] }> = {
    pass: { cols: ['CMP', 'ATT', 'YDS', 'TD', 'INT'], list: ps.filter((p) => p.season.pAtt > 0).sort((a, b) => b.season.pYds - a.season.pYds), vals: (p) => [p.season.pCmp, p.season.pAtt, p.season.pYds, p.season.pTd, p.season.pInt] },
    rush: { cols: ['ATT', 'YDS', 'AVG', 'TD'], list: ps.filter((p) => p.season.rAtt > 0).sort((a, b) => b.season.rYds - a.season.rYds), vals: (p) => [p.season.rAtt, p.season.rYds, (p.season.rYds / Math.max(1, p.season.rAtt)).toFixed(1), p.season.rTd] },
    rec: { cols: ['REC', 'YDS', 'AVG', 'TD'], list: ps.filter((p) => p.season.rec > 0).sort((a, b) => b.season.recYds - a.season.recYds), vals: (p) => [p.season.rec, p.season.recYds, (p.season.recYds / Math.max(1, p.season.rec)).toFixed(1), p.season.recTd] },
    def: { cols: ['TKL', 'SCK', 'INT', 'PD'], list: ps.filter((p) => p.season.tkl + p.season.sacks + p.season.dInt > 0).sort((a, b) => b.season.tkl - a.season.tkl), vals: (p) => [p.season.tkl, p.season.sacks, p.season.dInt, p.season.pd] },
    kick: { cols: ['FGM', 'FGA', 'LNG', 'XP', 'PUNT'], list: ps.filter((p) => p.season.fgA + p.season.xpA + p.season.punts > 0), vals: (p) => [p.season.fgM, p.season.fgA, p.season.fgLng, `${p.season.xpM}/${p.season.xpA}`, p.season.punts] },
  };
  const d = defs[k];
  return (
    <>
      <div className="row" style={{ gap: 3 }}>
        {(['pass', 'rush', 'rec', 'def', 'kick'] as const).map((x) => (
          <button key={x} className={`tab ${k === x ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => setK(x)}>{{ pass: 'Pass', rush: 'Rush', rec: 'Rec', def: 'Def', kick: 'Kick' }[x]}</button>
        ))}
      </div>
      <Panel dark className="fill">
        {d.list.length === 0 ? <Empty>No stats yet.</Empty> : (
          <PagedTable
            rows={d.list}
            rowKey={(p) => p.id}
            resetKey={k}
            head={<tr><th>PLAYER</th>{d.cols.map((h) => <th key={h} className="num">{h}</th>)}</tr>}
            row={(p) => <tr key={p.id} className="click" onClick={() => onPick(p)}><td>{p.first[0]}. {p.last}</td>{d.vals(p).map((v, j) => <td key={j} className="num">{v}</td>)}</tr>}
          />
        )}
      </Panel>
    </>
  );
}

function TeamStats() {
  const app = useApp();
  const c = app.career!;
  const rows = c.teams.map((t) => {
    const g = Math.max(1, t.rec.w + t.rec.l + t.rec.t);
    const ps = teamPlayers(c, t.id);
    const sum = (k: keyof StatLine) => ps.reduce((s, p) => s + (p.season[k] ?? 0), 0);
    return { t, ppg: t.rec.pf / g, papg: t.rec.pa / g, pass: sum('pYds') / g, rush: sum('rYds') / g, sacks: sum('sacks'), ints: sum('dInt') };
  });
  const [k, setK] = useState<'ppg' | 'papg' | 'pass' | 'rush' | 'sacks' | 'ints'>('ppg');
  const sorted = [...rows].sort((a, b) => (k === 'papg' ? a[k] - b[k] : b[k] - a[k]));
  const h = (id: typeof k, l: string) => <th className="num" style={{ cursor: 'pointer', color: k === id ? 'var(--gold)' : undefined }} onClick={() => setK(id)}>{l}</th>;
  return (
    <Panel dark className="fill">
      <PagedTable
        rows={sorted}
        rowKey={(r) => r.t.id}
        resetKey={k}
        head={<tr><th>TEAM</th>{h('ppg', 'PPG')}{h('papg', 'OPP')}{h('pass', 'PASS')}{h('rush', 'RUSH')}{h('sacks', 'SCK')}{h('ints', 'INT')}</tr>}
        row={(r) => (
          <tr key={r.t.id} className={r.t.id === c.userTeam ? 'me' : ''}>
            <td><div className="row" style={{ gap: 4 }}><TeamBadge team={r.t} size={18} />{r.t.abbr}</div></td>
            <td className="num">{r.ppg.toFixed(1)}</td><td className="num">{r.papg.toFixed(1)}</td><td className="num">{r.pass.toFixed(0)}</td><td className="num">{r.rush.toFixed(0)}</td><td className="num">{r.sacks}</td><td className="num">{r.ints}</td>
          </tr>
        )}
      />
    </Panel>
  );
}

export function RecordsScreen() {
  const app = useApp();
  const c = app.career!;
  const [tab, setTab] = useState<'records' | 'champs' | 'awards' | 'hof' | 'coach'>('records');
  const [scope, setScope] = useState<'game' | 'season' | 'career' | 'team'>('season');
  const [ai, setAi] = useState(c.awards.length - 1);
  const rec = scope === 'team' ? null : c.records[scope];
  return (
    <div className="screen">
      <TopBar title="RECORDS & HISTORY" />
      <Tabs tabs={[{ id: 'records', label: 'Records' }, { id: 'champs', label: 'Champs' }, { id: 'awards', label: 'Awards' }, { id: 'hof', label: 'HOF' }, { id: 'coach', label: 'Coach' }]} value={tab} onChange={setTab} />
      {tab === 'records' && (
        <div className="row" style={{ gap: 3 }}>
          {(['game', 'season', 'career', 'team'] as const).map((x) => (
            <button key={x} className={`tab ${scope === x ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => setScope(x)}>{{ game: 'Game', season: 'Season', career: 'Career', team: 'Franchise' }[x]}</button>
          ))}
        </div>
      )}
      <Panel dark className="fill">
        {tab === 'records' && (
          <Paged
            resetKey={scope}
            items={
              rec
                ? RECORD_KEYS.map(({ key, label }) => {
                    const r = rec[key];
                    return (
                      <div key={key} className="spread small" style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <span>{label}</span>
                        <span className="right">{r ? <>{r.value} <span className="muted">{r.name} ({r.team} {r.year})</span></> : <span className="muted">-</span>}</span>
                      </div>
                    );
                  })
                : Object.entries(TEAM_RECORD_LABEL).map(([k, l]) => {
                    const r = c.records.team[k];
                    return <div key={k} className="spread small" style={{ padding: '2px 0' }}><span>{l}</span><span>{r ? `${r.value} - ${r.team} ${r.year}` : '-'}</span></div>;
                  })
            }
          />
        )}
        {tab === 'champs' && (c.champions.length === 0 ? <Empty>No champions yet. Make history!</Empty> : (
          <Paged items={[...c.champions].reverse().map((ch) => (
            <div key={ch.year} className={`spread small ${ch.team === c.userTeam ? 'gold' : ''}`} style={{ padding: '2px 0' }}>
              <span>{ch.year}</span><span>{c.teams[ch.team].city} {c.teams[ch.team].name}</span><span className="muted">def. {c.teams[ch.runnerUp].abbr} {ch.score}</span>
            </div>
          ))} />
        ))}
        {tab === 'awards' && (c.awards.length === 0 ? <Empty>Season awards are handed out after the playoffs.</Empty> : (() => {
          const a = c.awards[Math.max(0, Math.min(ai, c.awards.length - 1))];
          return (
            <div className="col" style={{ gap: 3 }}>
              <div className="spread">
                <button className="tab" disabled={ai <= 0} onClick={() => setAi(ai - 1)}>◀</button>
                <span className="pixel" style={{ fontSize: 9 }}>{a.year} AWARDS</span>
                <button className="tab" disabled={ai >= c.awards.length - 1} onClick={() => setAi(ai + 1)}>▶</button>
              </div>
              {Object.entries(a.names).map(([k, v]) => <div key={k} className="spread small"><span className="cyan">{k}</span><span className="right">{v}</span></div>)}
            </div>
          );
        })())}
        {tab === 'hof' && (c.hof.length === 0 ? <Empty>No inductees yet. Legends are made over many seasons.</Empty> : (
          <Paged items={c.hof.map((h, i) => (
            <div key={i} style={{ padding: '2px 0' }}>
              <div className="gold small">{h.name} <span className="muted">{h.pos} - {h.team} - {h.years}</span></div>
              <div className="tiny muted">Class of {h.inducted}: {h.summary}</div>
            </div>
          ))} />
        ))}
        {tab === 'coach' && (
          <>
            <div className="small">Coach {c.coach.name} - Reputation {c.coach.reputation}/100 - Titles {c.coach.titles}</div>
            {c.coach.history.length === 0 ? <Empty>Your first season is underway.</Empty> : (
              <PagedTable
                rows={[...c.coach.history].reverse()}
                rowKey={(h) => h.year}
                head={<tr><th>YEAR</th><th>TEAM</th><th>REC</th><th>RESULT</th></tr>}
                row={(h) => <tr key={h.year}><td>{h.year}</td><td>{c.teams[h.teamId].abbr}</td><td>{h.w}-{h.l}{h.t ? `-${h.t}` : ''}</td><td>{h.result}</td></tr>}
              />
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

export function AchievementsScreen() {
  const app = useApp();
  const c = app.career!;
  const got = ACHIEVEMENTS.filter((a) => c.achievements[a.id]).length;
  return (
    <div className="screen">
      <TopBar title={`AWARDS ${got}/${ACHIEVEMENTS.length}`} />
      <Panel dark className="fill">
        <Paged
          items={ACHIEVEMENTS.map((a) => {
            const y = c.achievements[a.id];
            return (
              <div key={a.id} className="spread" style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ minWidth: 0 }}>
                  <div className={`pixel ${y ? 'gold' : 'muted'}`} style={{ fontSize: 8 }}>{y ? '★ ' : '☆ '}{a.name}</div>
                  <div className="tiny">{a.desc}</div>
                </div>
                <div className="small right">{y ? <span className="green">{y}</span> : <span className="muted">+{a.cc}CC</span>}</div>
              </div>
            );
          })}
        />
      </Panel>
    </div>
  );
}
