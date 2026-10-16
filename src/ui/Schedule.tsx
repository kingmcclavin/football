import { useState } from 'react';
import { Btn, Panel, TeamBadge, TopBar, useApp, Empty, Tabs } from './common';
import { ROUND_NAME } from '../league/season';
import type { BoxScore, Career } from '../league/career';
import { playerMap } from '../league/career';
import type { StatLine } from '../core/types';
import { fullName } from '../league/players';
import { Paged, PagedTable } from './paged';

export function ScheduleScreen() {
  const app = useApp();
  const c = app.career!;
  const [tab, setTab] = useState<'mine' | 'week'>('mine');
  const games = c.schedule.filter((g) => g.home === c.userTeam || g.away === c.userTeam).sort((a, b) => a.week - b.week);
  return (
    <div className="screen">
      <TopBar title={`${c.year} SCHEDULE`} />
      <Tabs tabs={[{ id: 'mine', label: 'My Games' }, { id: 'week', label: 'League Scores' }]} value={tab} onChange={setTab} />
      <Panel dark className="fill">
        {tab === 'mine' ? (
          <PagedTable
            rows={games}
            rowKey={(g) => g.id}
            head={<tr><th>WK</th><th>OPPONENT</th><th>RESULT</th><th /></tr>}
            row={(g) => {
              const home = g.home === c.userTeam;
              const opp = c.teams[home ? g.away : g.home];
              const my = home ? g.hs : g.as;
              const their = home ? g.as : g.hs;
              const res = !g.played ? '' : my > their ? 'W' : my < their ? 'L' : 'T';
              const box = c.boxes.find((b) => b.gameId === g.id);
              return (
                <tr key={g.id} className={g.week === c.week && !g.played ? 'me' : ''}>
                  <td>{g.playoff ? g.playoff : g.week}</td>
                  <td>
                    <div className="row" style={{ gap: 5 }}>
                      <span className="muted">{home ? 'vs' : '@'}</span>
                      <TeamBadge team={opp} size={18} />
                      <span>{opp.abbr} <span className="wide-only">{opp.name}</span></span>
                    </div>
                  </td>
                  <td>
                    {g.played ? (
                      <span className={res === 'W' ? 'green' : res === 'L' ? 'red' : ''}>{res} {my}-{their}{g.ot ? ' OT' : ''}</span>
                    ) : g.week === c.week ? <span className="gold">Next</span> : ''}
                  </td>
                  <td>{box && <Btn size="small" kind="blue" onClick={() => app.go('box', { gameId: g.id })}>Box</Btn>}</td>
                </tr>
              );
            }}
          />
        ) : (
          <LeagueWeek c={c} />
        )}
      </Panel>
    </div>
  );
}

function LeagueWeek({ c }: { c: Career }) {
  const maxWeek = Math.max(0, ...c.schedule.filter((g) => g.played).map((g) => g.week));
  const [wk, setWk] = useState(maxWeek || 1);
  const games = c.schedule.filter((g) => g.week === wk && g.played);
  const label = wk >= 17 ? ROUND_NAME[games[0]?.playoff ?? 'WC'] : `Week ${wk}`;
  return (
    <div className="fill">
      <div className="spread">
        <button className="tab" disabled={wk <= 1} onClick={() => setWk(wk - 1)}>◀</button>
        <span className="pixel" style={{ fontSize: 9 }}>{label}</span>
        <button className="tab" disabled={wk >= maxWeek} onClick={() => setWk(wk + 1)}>▶</button>
      </div>
      {games.length === 0 ? (
        <Empty>No games played yet.</Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2px 10px', marginTop: 6 }}>
          {games.map((g) => (
            <div key={g.id} className={`small ${g.home === c.userTeam || g.away === c.userTeam ? 'gold' : ''}`}>
              {c.teams[g.away].abbr} {g.as} @ {c.teams[g.home].abbr} {g.hs}{g.ot ? ' OT' : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BoxScoreView({ c, box }: { c: Career; box: BoxScore }) {
  const [tab, setTab] = useState<'sum' | 'team' | 'away' | 'home' | 'plays'>('sum');
  const pm = playerMap(c);
  const H = c.teams[box.home];
  const A = c.teams[box.away];
  const entries = Object.entries(box.players).map(([id, e]) => ({ p: pm.get(Number(id)), teamId: e.teamId, s: e.s as Partial<StatLine> }));
  const cats: [string, keyof StatLine, (s: Partial<StatLine>) => string, keyof StatLine][] = [
    ['Passing', 'pAtt', (s) => `${s.pCmp ?? 0}/${s.pAtt ?? 0}, ${s.pYds ?? 0} yds, ${s.pTd ?? 0} TD, ${s.pInt ?? 0} INT`, 'pYds'],
    ['Rushing', 'rAtt', (s) => `${s.rAtt} car, ${s.rYds ?? 0} yds, ${s.rTd ?? 0} TD`, 'rYds'],
    ['Receiving', 'rec', (s) => `${s.rec} rec, ${s.recYds ?? 0} yds, ${s.recTd ?? 0} TD`, 'recYds'],
    ['Defense', 'tkl', (s) => `${s.tkl ?? 0} tkl${s.sacks ? `, ${s.sacks} sck` : ''}${s.dInt ? `, ${s.dInt} INT` : ''}`, 'tkl'],
    ['Kicking', 'fgA', (s) => `FG ${s.fgM ?? 0}/${s.fgA ?? 0}, XP ${s.xpM ?? 0}/${s.xpA ?? 0}`, 'fgM'],
  ];
  const playerItems = (teamId: number) => {
    const out: JSX.Element[] = [];
    for (const [label, key, fmt, sk] of cats) {
      const rows = entries.filter((e) => e.teamId === teamId && (e.s[key] ?? 0) !== 0 && e.p).sort((a, b) => (b.s[sk] ?? 0) - (a.s[sk] ?? 0)).slice(0, 4);
      if (!rows.length) continue;
      out.push(<h3 key={label} style={{ margin: '4px 0 1px' }}>{label}</h3>);
      for (const e of rows) out.push(<div key={label + e.p!.id} className="small">{e.p!.pos} {fullName(e.p!)}: {fmt(e.s)}</div>);
    }
    return out;
  };
  const T = box.team;
  const top = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const qn = Math.max(box.quarters[0].length, 4);
  return (
    <>
      <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
        <TeamBadge team={A} size={30} />
        <div className="pixel" style={{ fontSize: 16 }}>
          <span className={box.as > box.hs ? 'gold' : ''}>{A.abbr} {box.as}</span> - <span className={box.hs > box.as ? 'gold' : ''}>{box.hs} {H.abbr}</span>
        </div>
        <TeamBadge team={H} size={30} />
      </div>
      <div className="center muted tiny">
        {box.playoff ? ROUND_NAME[box.playoff] + ' - ' : `Week ${box.week} - `}{box.year}{box.ot ? ' - OT' : ''} - {box.weather}
      </div>
      <Tabs tabs={[{ id: 'sum', label: 'Score' }, { id: 'team', label: 'Team' }, { id: 'away', label: A.abbr }, { id: 'home', label: H.abbr }, { id: 'plays', label: 'Plays' }]} value={tab} onChange={setTab} />
      <Panel dark className="fill">
        {tab === 'sum' && (
          <table className="t">
            <thead>
              <tr>
                <th>TEAM</th>
                {Array.from({ length: qn }, (_, i) => <th key={i} className="num">{i < 4 ? `Q${i + 1}` : 'OT'}</th>)}
                <th className="num">T</th>
              </tr>
            </thead>
            <tbody>
              {[1, 0].map((side) => (
                <tr key={side}>
                  <td>{side === 0 ? H.abbr : A.abbr}</td>
                  {Array.from({ length: qn }, (_, i) => <td key={i} className="num">{box.quarters[side][i] ?? 0}</td>)}
                  <td className="num gold">{side === 0 ? box.hs : box.as}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'team' && (
          <PagedTable
            rows={[
              ['Total yards', T[1].yds, T[0].yds],
              ['Passing', T[1].passYds, T[0].passYds],
              ['Rushing', T[1].rushYds, T[0].rushYds],
              ['First downs', T[1].firstDowns, T[0].firstDowns],
              ['3rd down', `${T[1].thirdConv}/${T[1].thirdAtt}`, `${T[0].thirdConv}/${T[0].thirdAtt}`],
              ['Turnovers', T[1].turnovers, T[0].turnovers],
              ['Sacks', T[1].sacks, T[0].sacks],
              ['Plays', T[1].plays, T[0].plays],
              ['Possession', top(T[1].top), top(T[0].top)],
            ]}
            rowKey={(r) => String(r[0])}
            head={<tr><th /><th className="num">{A.abbr}</th><th className="num">{H.abbr}</th></tr>}
            row={([l, a, h]) => <tr key={String(l)}><td>{l}</td><td className="num">{a}</td><td className="num">{h}</td></tr>}
          />
        )}
        {tab === 'away' && <Paged resetKey="away" items={playerItems(box.away)} />}
        {tab === 'home' && <Paged resetKey="home" items={playerItems(box.home)} />}
        {tab === 'plays' && (box.keyPlays.length ? <Paged resetKey="plays" items={box.keyPlays.map((k, i) => <div key={i} className="small" style={{ padding: '2px 0' }}>{k}</div>)} /> : <Empty>No key plays recorded.</Empty>)}
      </Panel>
    </>
  );
}

export function BoxScoreScreen({ gameId }: { gameId: number }) {
  const app = useApp();
  const c = app.career!;
  const box = c.boxes.find((b) => b.gameId === gameId);
  return (
    <div className="screen">
      <TopBar title="BOX SCORE" />
      {box ? <BoxScoreView c={c} box={box} /> : <Empty>Box score not available.</Empty>}
    </div>
  );
}
