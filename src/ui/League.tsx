import { useState } from 'react';
import { Panel, Tabs, TeamBadge, TopBar, useApp, Ovr } from './common';
import { CONFERENCES, DIVISIONS } from '../data/teams';
import { conferenceSeeds, divisionStandings, pct, recordText } from '../league/standings';
import { unitRatings } from '../league/depth';
import type { Career } from '../league/career';
import { ROUND_NAME } from '../league/season';

type Tab = 'div' | 'conf' | 'playoffs' | 'power';

export function LeagueScreen({ tab }: { tab?: string }) {
  const app = useApp();
  const c = app.career!;
  const [t, setT] = useState<Tab>((tab as Tab) ?? 'div');
  const [conf, setConf] = useState<'0' | '1'>(String(c.teams[c.userTeam].conf) as '0' | '1');
  return (
    <div className="screen">
      <TopBar title={`LEAGUE - ${c.year}`} />
      <Tabs tabs={[{ id: 'div', label: 'Divisions' }, { id: 'conf', label: 'Conference' }, { id: 'playoffs', label: 'Playoffs' }, { id: 'power', label: 'Power Rank' }]} value={t} onChange={setT} />
      {(t === 'div' || t === 'conf') && <Tabs tabs={[{ id: '0', label: CONFERENCES[0] }, { id: '1', label: CONFERENCES[1] }]} value={conf} onChange={setConf} />}
      {t === 'div' && DIVISIONS.map((d, i) => <DivTable key={i} c={c} conf={Number(conf)} div={i} name={`${CONFERENCES[Number(conf)].split(' ')[0]} ${d}`} />)}
      {t === 'conf' && <ConfTable c={c} conf={Number(conf)} />}
      {t === 'playoffs' && <Bracket c={c} />}
      {t === 'power' && <Power c={c} />}
    </div>
  );
}

function Row({ c, id, rank, extra }: { c: Career; id: number; rank?: string; extra?: string }) {
  const app = useApp();
  const t = c.teams[id];
  const r = t.rec;
  return (
    <tr className={`click ${id === c.userTeam ? 'me' : ''}`} onClick={() => app.go('team', { teamId: id })}>
      {rank !== undefined && <td>{rank}</td>}
      <td>
        <div className="row" style={{ gap: 6 }}>
          <TeamBadge team={t} size={22} />
          <span>{t.city} {t.name}</span>
        </div>
      </td>
      <td className="num">{recordText(t)}</td>
      <td className="num">{pct(r.w, r.l, r.t).toFixed(3).replace(/^0/, '')}</td>
      <td className="num">{r.pf}</td>
      <td className="num">{r.pa}</td>
      <td className="num">{r.divW}-{r.divL}</td>
      <td className="num">{r.streak > 0 ? `W${r.streak}` : r.streak < 0 ? `L${-r.streak}` : '-'}</td>
      {extra !== undefined && <td>{extra}</td>}
    </tr>
  );
}

function DivTable({ c, conf, div, name }: { c: Career; conf: number; div: number; name: string }) {
  const ids = divisionStandings(c, conf, div);
  return (
    <Panel title={name.toUpperCase()}>
      <div className="tablewrap">
        <table className="t">
          <thead>
            <tr><th>TEAM</th><th className="num">W-L</th><th className="num">PCT</th><th className="num">PF</th><th className="num">PA</th><th className="num">DIV</th><th className="num">STRK</th></tr>
          </thead>
          <tbody>{ids.map((id) => <Row key={id} c={c} id={id} />)}</tbody>
        </table>
      </div>
    </Panel>
  );
}

function ConfTable({ c, conf }: { c: Career; conf: number }) {
  const seeds = conferenceSeeds(c, conf);
  return (
    <Panel title={CONFERENCES[conf].toUpperCase()}>
      <div className="tablewrap">
        <table className="t">
          <thead>
            <tr><th>#</th><th>TEAM</th><th className="num">W-L</th><th className="num">PCT</th><th className="num">PF</th><th className="num">PA</th><th className="num">DIV</th><th className="num">STRK</th><th /></tr>
          </thead>
          <tbody>
            {seeds.map((id, i) => (
              <Row key={id} c={c} id={id} rank={String(i + 1)} extra={i < 4 ? 'DIV' : i < 7 ? 'WC' : ''} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted small">Top 7 make the playoffs: four division winners and three wild cards. The #1 seed gets a bye.</div>
    </Panel>
  );
}

function Bracket({ c }: { c: Career }) {
  const rounds: ('WC' | 'DIV' | 'CONF' | 'FINAL')[] = ['WC', 'DIV', 'CONF', 'FINAL'];
  const games = c.schedule.filter((g) => g.playoff);
  if (!c.playoffs) {
    return (
      <Panel title="PLAYOFF PICTURE">
        <div className="muted small" style={{ marginBottom: 6 }}>If the season ended today:</div>
        <div className="grid2">
          {[0, 1].map((conf) => (
            <div key={conf}>
              <h3>{CONFERENCES[conf]}</h3>
              {conferenceSeeds(c, conf).slice(0, 7).map((id, i) => (
                <div key={id} className={id === c.userTeam ? 'gold' : ''}>
                  {i + 1}. {c.teams[id].city} {c.teams[id].name} ({recordText(c.teams[id])})
                </div>
              ))}
            </div>
          ))}
        </div>
      </Panel>
    );
  }
  return (
    <Panel title={`${c.year} PLAYOFFS`}>
      <div className="bracket">
        {rounds.map((r) => (
          <div key={r} className="round">
            <h3>{ROUND_NAME[r]}</h3>
            {games.filter((g) => g.playoff === r).map((g) => {
              const hw = g.played && g.hs > g.as;
              const aw = g.played && g.as > g.hs;
              return (
                <div key={g.id} className="game">
                  <div className={aw ? 'w' : ''}>{c.teams[g.away].abbr} {g.played ? g.as : ''}</div>
                  <div className={hw ? 'w' : ''}>{c.teams[g.home].abbr} {g.played ? g.hs : ''}</div>
                </div>
              );
            })}
            {games.filter((g) => g.playoff === r).length === 0 && <div className="muted small">TBD</div>}
          </div>
        ))}
      </div>
      {c.playoffs.champion !== undefined && <div className="gold pixel" style={{ fontSize: 10, marginTop: 10 }}>CHAMPION: {c.teams[c.playoffs.champion].city} {c.teams[c.playoffs.champion].name}</div>}
    </Panel>
  );
}

function Power({ c }: { c: Career }) {
  const app = useApp();
  const list = c.teams
    .map((t) => {
      const u = unitRatings(c, t.id);
      const g = t.rec.w + t.rec.l + t.rec.t;
      const score = u.ovr * 1.0 + (g ? (pct(t.rec.w, t.rec.l, t.rec.t) - 0.5) * 30 + ((t.rec.pf - t.rec.pa) / g) * 0.6 : 0);
      return { t, u, score };
    })
    .sort((a, b) => b.score - a.score);
  return (
    <Panel title="POWER RANKINGS">
      <div className="tablewrap">
        <table className="t">
          <thead>
            <tr><th>#</th><th>TEAM</th><th className="num">REC</th><th className="num">OVR</th><th className="num">OFF</th><th className="num">DEF</th></tr>
          </thead>
          <tbody>
            {list.map(({ t, u }, i) => (
              <tr key={t.id} className={`click ${t.id === c.userTeam ? 'me' : ''}`} onClick={() => app.go('team', { teamId: t.id })}>
                <td>{i + 1}</td>
                <td><div className="row" style={{ gap: 6 }}><TeamBadge team={t} size={22} />{t.city} {t.name}</div></td>
                <td className="num">{recordText(t)}</td>
                <td className="num"><Ovr v={u.ovr} /></td>
                <td className="num">{u.off}</td>
                <td className="num">{u.def}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
