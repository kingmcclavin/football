import { Btn, Panel, TeamBadge, TopBar, useApp, Empty } from './common';
import { ROUND_NAME } from '../league/season';
import type { BoxScore, Career } from '../league/career';
import { playerMap } from '../league/career';
import type { StatLine } from '../core/types';
import { fullName } from '../league/players';

export function ScheduleScreen() {
  const app = useApp();
  const c = app.career!;
  const games = c.schedule.filter((g) => g.home === c.userTeam || g.away === c.userTeam).sort((a, b) => a.week - b.week);
  return (
    <div className="screen">
      <TopBar title={`${c.year} SCHEDULE`} />
      <Panel dark>
        <div className="tablewrap">
          <table className="t">
            <thead>
              <tr><th>WK</th><th>OPPONENT</th><th>RESULT</th><th /></tr>
            </thead>
            <tbody>
              {games.map((g) => {
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
                      <div className="row" style={{ gap: 6 }}>
                        <span className="muted">{home ? 'vs' : '@'}</span>
                        <TeamBadge team={opp} size={22} />
                        <span>{opp.city} {opp.name}</span>
                      </div>
                    </td>
                    <td>
                      {g.played ? (
                        <span className={res === 'W' ? 'green' : res === 'L' ? 'red' : ''}>
                          {res} {my}-{their}
                          {g.ot ? ' OT' : ''}
                        </span>
                      ) : g.week === c.week ? (
                        <span className="gold">Next</span>
                      ) : (
                        ''
                      )}
                    </td>
                    <td>{box && <Btn size="small" kind="blue" onClick={() => app.go('box', { gameId: g.id })}>Box</Btn>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <LeagueWeek c={c} />
    </div>
  );
}

function LeagueWeek({ c }: { c: Career }) {
  const wk = Math.max(1, c.week - 1);
  const games = c.schedule.filter((g) => g.week === wk && g.played);
  if (!games.length) return null;
  return (
    <Panel title={wk >= 17 ? ROUND_NAME[games[0].playoff ?? 'WC'].toUpperCase() : `WEEK ${wk} SCORES`}>
      <div className="grid3">
        {games.map((g) => (
          <div key={g.id} className="small">
            <span className={g.as > g.hs ? 'gold' : ''}>{c.teams[g.away].abbr} {g.as}</span> @ <span className={g.hs > g.as ? 'gold' : ''}>{c.teams[g.home].abbr} {g.hs}</span>
            {g.ot ? ' OT' : ''}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function BoxScoreView({ c, box }: { c: Career; box: BoxScore }) {
  const pm = playerMap(c);
  const H = c.teams[box.home];
  const A = c.teams[box.away];
  const entries = Object.entries(box.players).map(([id, e]) => ({ p: pm.get(Number(id)), teamId: e.teamId, s: e.s as Partial<StatLine> }));
  const sec = (teamId: number, key: keyof StatLine, fmt: (s: Partial<StatLine>) => string, sortKey: keyof StatLine) =>
    entries
      .filter((e) => e.teamId === teamId && (e.s[key] ?? 0) !== 0 && e.p)
      .sort((a, b) => (b.s[sortKey] ?? 0) - (a.s[sortKey] ?? 0))
      .slice(0, 5)
      .map((e) => (
        <div key={e.p!.id} className="small">
          {e.p!.pos} {fullName(e.p!)}: {fmt(e.s)}
        </div>
      ));
  const cats: [string, keyof StatLine, (s: Partial<StatLine>) => string, keyof StatLine][] = [
    ['Passing', 'pAtt', (s) => `${s.pCmp ?? 0}/${s.pAtt ?? 0}, ${s.pYds ?? 0} yds, ${s.pTd ?? 0} TD, ${s.pInt ?? 0} INT`, 'pYds'],
    ['Rushing', 'rAtt', (s) => `${s.rAtt} car, ${s.rYds ?? 0} yds, ${s.rTd ?? 0} TD`, 'rYds'],
    ['Receiving', 'rec', (s) => `${s.rec} rec, ${s.recYds ?? 0} yds, ${s.recTd ?? 0} TD`, 'recYds'],
    ['Defense', 'tkl', (s) => `${s.tkl ?? 0} tkl${s.sacks ? `, ${s.sacks} sck` : ''}${s.dInt ? `, ${s.dInt} INT` : ''}`, 'tkl'],
    ['Kicking', 'fgA', (s) => `FG ${s.fgM ?? 0}/${s.fgA ?? 0}, XP ${s.xpM ?? 0}/${s.xpA ?? 0}`, 'fgM'],
  ];
  const T = box.team;
  const top = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const qn = Math.max(box.quarters[0].length, 4);
  return (
    <>
      <Panel>
        <div className="row" style={{ justifyContent: 'center', gap: 18 }}>
          <div className="col center" style={{ alignItems: 'center' }}>
            <TeamBadge team={A} size={44} />
            <div className="pixel" style={{ fontSize: 9 }}>{A.abbr}</div>
          </div>
          <div className="pixel" style={{ fontSize: 22 }}>
            <span className={box.as > box.hs ? 'gold' : ''}>{box.as}</span> - <span className={box.hs > box.as ? 'gold' : ''}>{box.hs}</span>
          </div>
          <div className="col center" style={{ alignItems: 'center' }}>
            <TeamBadge team={H} size={44} />
            <div className="pixel" style={{ fontSize: 9 }}>{H.abbr}</div>
          </div>
        </div>
        <div className="center muted small">
          {box.playoff ? ROUND_NAME[box.playoff] + ' - ' : `Week ${box.week} - `}
          {box.year} {box.ot ? '- Overtime' : ''} - {box.weather}
        </div>
        <div className="tablewrap" style={{ marginTop: 6 }}>
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
        </div>
      </Panel>
      <Panel title="TEAM STATS">
        <div className="tablewrap">
          <table className="t">
            <thead>
              <tr><th /> <th className="num">{A.abbr}</th><th className="num">{H.abbr}</th></tr>
            </thead>
            <tbody>
              {[
                ['Total yards', T[1].yds, T[0].yds],
                ['Passing', T[1].passYds, T[0].passYds],
                ['Rushing', T[1].rushYds, T[0].rushYds],
                ['First downs', T[1].firstDowns, T[0].firstDowns],
                ['3rd down', `${T[1].thirdConv}/${T[1].thirdAtt}`, `${T[0].thirdConv}/${T[0].thirdAtt}`],
                ['Turnovers', T[1].turnovers, T[0].turnovers],
                ['Sacks', T[1].sacks, T[0].sacks],
                ['Plays', T[1].plays, T[0].plays],
                ['Possession', top(T[1].top), top(T[0].top)],
              ].map(([l, a, h]) => (
                <tr key={String(l)}>
                  <td>{l}</td>
                  <td className="num">{a}</td>
                  <td className="num">{h}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid2">
        {[box.away, box.home].map((tid) => (
          <Panel key={tid} title={`${c.teams[tid].abbr} PLAYERS`}>
            {cats.map(([label, key, fmt, sk]) => {
              const rows = sec(tid, key, fmt, sk);
              return rows.length ? (
                <div key={label} style={{ marginBottom: 6 }}>
                  <h3>{label}</h3>
                  {rows}
                </div>
              ) : null;
            })}
          </Panel>
        ))}
      </div>
      {box.keyPlays.length > 0 && (
        <Panel title="KEY PLAYS">
          {box.keyPlays.map((k, i) => (
            <div key={i} className="small">{k}</div>
          ))}
        </Panel>
      )}
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
