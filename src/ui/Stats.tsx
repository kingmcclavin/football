import { useState } from 'react';
import { Panel, Tabs, TopBar, useApp, Empty, TeamBadge } from './common';
import type { Player, StatLine } from '../core/types';
import { fullName } from '../league/players';
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
  const [sel, setSel] = useState<Player | null>(null);
  const active = c.players.filter((p) => p.teamId >= 0);
  return (
    <div className="screen">
      <TopBar title={`${c.year} STATISTICS`} />
      <Tabs tabs={[{ id: 'leaders', label: 'League Leaders' }, { id: 'team', label: 'My Team' }, { id: 'teams', label: 'Team Stats' }]} value={tab} onChange={setTab} />
      {tab === 'leaders' && (
        <div className="grid2">
          {LEADERS.map(({ key, label }) => {
            const top = [...active].filter((p) => (p.season[key] ?? 0) > 0).sort((a, b) => b.season[key] - a.season[key]).slice(0, 5);
            return (
              <Panel key={key} title={label.toUpperCase()}>
                {top.length === 0 ? <div className="muted small">No stats yet</div> : top.map((p, i) => (
                  <div key={p.id} className={`spread small ${p.teamId === c.userTeam ? 'gold' : ''}`} onClick={() => setSel(p)} style={{ cursor: 'pointer' }}>
                    <span>{i + 1}. {fullName(p)} <span className="muted">{c.teams[p.teamId].abbr} {p.pos}</span></span>
                    <span>{p.season[key]}</span>
                  </div>
                ))}
              </Panel>
            );
          })}
        </div>
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
  const ps = teamPlayers(c, c.userTeam);
  const pass = ps.filter((p) => p.season.pAtt > 0).sort((a, b) => b.season.pYds - a.season.pYds);
  const rush = ps.filter((p) => p.season.rAtt > 0).sort((a, b) => b.season.rYds - a.season.rYds);
  const recv = ps.filter((p) => p.season.rec > 0 || p.season.tgt > 0).sort((a, b) => b.season.recYds - a.season.recYds);
  const def = ps.filter((p) => p.season.tkl + p.season.sacks + p.season.dInt > 0).sort((a, b) => b.season.tkl - a.season.tkl);
  const kick = ps.filter((p) => p.season.fgA + p.season.xpA + p.season.punts > 0);
  const T = (cols: string[], rows: (string | number)[][], players: Player[]) => (
    <div className="tablewrap">
      <table className="t">
        <thead><tr><th>PLAYER</th>{cols.map((h) => <th key={h} className="num">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="click" onClick={() => onPick(players[i])}>
              <td>{players[i].first[0]}. {players[i].last}</td>
              {r.map((v, j) => <td key={j} className="num">{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <Panel title="PASSING">{pass.length ? T(['CMP', 'ATT', 'PCT', 'YDS', 'TD', 'INT', 'LNG'], pass.map((p) => { const s = p.season; return [s.pCmp, s.pAtt, ((s.pCmp / Math.max(1, s.pAtt)) * 100).toFixed(0), s.pYds, s.pTd, s.pInt, s.pLng]; }), pass) : <Empty>No passing stats</Empty>}</Panel>
      <Panel title="RUSHING">{rush.length ? T(['ATT', 'YDS', 'AVG', 'TD', 'LNG', 'FUM'], rush.map((p) => { const s = p.season; return [s.rAtt, s.rYds, (s.rYds / Math.max(1, s.rAtt)).toFixed(1), s.rTd, s.rLng, s.fum]; }), rush) : <Empty>No rushing stats</Empty>}</Panel>
      <Panel title="RECEIVING">{recv.length ? T(['TGT', 'REC', 'YDS', 'AVG', 'TD', 'LNG'], recv.map((p) => { const s = p.season; return [s.tgt, s.rec, s.recYds, (s.recYds / Math.max(1, s.rec)).toFixed(1), s.recTd, s.recLng]; }), recv) : <Empty>No receiving stats</Empty>}</Panel>
      <Panel title="DEFENSE">{def.length ? T(['TKL', 'SCK', 'INT', 'PD', 'FF', 'TD'], def.map((p) => { const s = p.season; return [s.tkl, s.sacks, s.dInt, s.pd, s.ff, s.defTd]; }), def) : <Empty>No defensive stats</Empty>}</Panel>
      <Panel title="KICKING">{kick.length ? T(['FGM', 'FGA', 'LNG', 'XPM', 'XPA', 'PUNT', 'AVG'], kick.map((p) => { const s = p.season; return [s.fgM, s.fgA, s.fgLng, s.xpM, s.xpA, s.punts, s.punts ? (s.puntYds / s.punts).toFixed(1) : '-']; }), kick) : <Empty>No kicking stats</Empty>}</Panel>
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
    return { t, ppg: t.rec.pf / g, papg: t.rec.pa / g, pass: sum('pYds') / g, rush: sum('rYds') / g, sacks: sum('sacks'), ints: sum('dInt'), to: sum('pInt') + sum('fum') };
  });
  const [k, setK] = useState<'ppg' | 'papg' | 'pass' | 'rush' | 'sacks' | 'ints'>('ppg');
  const sorted = [...rows].sort((a, b) => (k === 'papg' ? a[k] - b[k] : b[k] - a[k]));
  const h = (id: typeof k, l: string) => <th className="num" style={{ cursor: 'pointer', color: k === id ? 'var(--gold)' : undefined }} onClick={() => setK(id)}>{l}</th>;
  return (
    <Panel dark>
      <div className="tablewrap">
        <table className="t">
          <thead><tr><th>TEAM</th>{h('ppg', 'PPG')}{h('papg', 'OPP')}{h('pass', 'PASS/G')}{h('rush', 'RUSH/G')}{h('sacks', 'SACKS')}{h('ints', 'INT')}</tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.t.id} className={r.t.id === c.userTeam ? 'me' : ''}>
                <td><div className="row" style={{ gap: 6 }}><TeamBadge team={r.t} size={20} />{r.t.abbr}</div></td>
                <td className="num">{r.ppg.toFixed(1)}</td>
                <td className="num">{r.papg.toFixed(1)}</td>
                <td className="num">{r.pass.toFixed(0)}</td>
                <td className="num">{r.rush.toFixed(0)}</td>
                <td className="num">{r.sacks}</td>
                <td className="num">{r.ints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function RecordsScreen() {
  const app = useApp();
  const c = app.career!;
  const [tab, setTab] = useState<'records' | 'champs' | 'awards' | 'hof' | 'coach'>('records');
  const recTable = (title: string, rec: Record<string, { value: number; name: string; team: string; year: number }>) => (
    <Panel title={title}>
      {RECORD_KEYS.map(({ key, label }) => {
        const r = rec[key];
        return (
          <div key={key} className="spread small">
            <span>{label}</span>
            <span>{r ? <>{r.value} <span className="muted">- {r.name} ({r.team}, {r.year})</span></> : <span className="muted">-</span>}</span>
          </div>
        );
      })}
    </Panel>
  );
  return (
    <div className="screen">
      <TopBar title="RECORDS & HISTORY" />
      <Tabs tabs={[{ id: 'records', label: 'Records' }, { id: 'champs', label: 'Champions' }, { id: 'awards', label: 'Awards' }, { id: 'hof', label: 'Hall of Fame' }, { id: 'coach', label: 'Coach' }]} value={tab} onChange={setTab} />
      {tab === 'records' && (
        <>
          {recTable('SINGLE GAME', c.records.game)}
          {recTable('SINGLE SEASON', c.records.season)}
          {recTable('CAREER', c.records.career)}
          <Panel title="FRANCHISE (YOUR TEAMS)">
            {Object.entries(TEAM_RECORD_LABEL).map(([k, l]) => {
              const r = c.records.team[k];
              return (
                <div key={k} className="spread small">
                  <span>{l}</span>
                  <span>{r ? `${r.value} - ${r.team} ${r.year}` : '-'}</span>
                </div>
              );
            })}
          </Panel>
        </>
      )}
      {tab === 'champs' && (
        <Panel title="GRIDIRON BOWL HISTORY">
          {c.champions.length === 0 ? <Empty>No champions yet. Make history!</Empty> : [...c.champions].reverse().map((ch) => (
            <div key={ch.year} className={`spread ${ch.team === c.userTeam ? 'gold' : ''}`}>
              <span>{ch.year}</span>
              <span>{c.teams[ch.team].city} {c.teams[ch.team].name}</span>
              <span className="muted small">def. {c.teams[ch.runnerUp].abbr} {ch.score}</span>
            </div>
          ))}
        </Panel>
      )}
      {tab === 'awards' && (
        <>
          {c.awards.length === 0 && <Empty>Season awards are handed out after the playoffs.</Empty>}
          {[...c.awards].reverse().map((a) => (
            <Panel key={a.year} title={`${a.year} AWARDS`}>
              {Object.entries(a.names).map(([k, v]) => (
                <div key={k} className="spread small"><span className="cyan">{k}</span><span>{v}</span></div>
              ))}
            </Panel>
          ))}
        </>
      )}
      {tab === 'hof' && (
        <Panel title="HALL OF FAME">
          {c.hof.length === 0 ? <Empty>No inductees yet. Legends are made over many seasons.</Empty> : c.hof.map((h, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div className="gold">{h.name} <span className="muted small">{h.pos} - {h.team} - {h.years}</span></div>
              <div className="small muted">Class of {h.inducted}: {h.summary}</div>
            </div>
          ))}
        </Panel>
      )}
      {tab === 'coach' && (
        <Panel title={`COACH ${c.coach.name.toUpperCase()}`}>
          <div className="small">Reputation {c.coach.reputation}/100 - Titles {c.coach.titles}</div>
          {c.coach.history.length === 0 ? <Empty>Your first season is underway.</Empty> : (
            <div className="tablewrap">
              <table className="t">
                <thead><tr><th>YEAR</th><th>TEAM</th><th>REC</th><th>RESULT</th></tr></thead>
                <tbody>
                  {[...c.coach.history].reverse().map((h) => (
                    <tr key={h.year}><td>{h.year}</td><td>{c.teams[h.teamId].abbr}</td><td>{h.w}-{h.l}{h.t ? `-${h.t}` : ''}</td><td>{h.result}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

export function AchievementsScreen() {
  const app = useApp();
  const c = app.career!;
  const got = ACHIEVEMENTS.filter((a) => c.achievements[a.id]).length;
  return (
    <div className="screen">
      <TopBar title={`ACHIEVEMENTS ${got}/${ACHIEVEMENTS.length}`} />
      <div className="grid2">
        {ACHIEVEMENTS.map((a) => {
          const y = c.achievements[a.id];
          return (
            <Panel key={a.id} dark={!y}>
              <div className="spread">
                <div>
                  <div className={`pixel ${y ? 'gold' : 'muted'}`} style={{ fontSize: 9 }}>{y ? '★ ' : '☆ '}{a.name}</div>
                  <div className="small">{a.desc}</div>
                </div>
                <div className="small right">{y ? <span className="green">{y}</span> : <span className="muted">+{a.cc} CC</span>}</div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
