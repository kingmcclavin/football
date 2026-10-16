import { useState } from 'react';
import { Panel, Tabs, TeamBadge, TopBar, useApp, Ovr } from './common';
import { PagedTable } from './paged';
import { CONFERENCES, DIVISIONS } from '../data/teams';
import { conferenceSeeds, divisionStandings, pct, recordText } from '../league/standings';
import { unitRatings } from '../league/depth';
import type { Career } from '../league/career';

type Tab = 'div' | 'conf' | 'playoffs' | 'power';

export function LeagueScreen({ tab }: { tab?: string }) {
  const app = useApp();
  const c = app.career!;
  const [t, setT] = useState<Tab>((tab as Tab) ?? 'div');
  const [conf, setConf] = useState<'0' | '1'>(String(c.teams[c.userTeam].conf) as '0' | '1');
  const [div, setDiv] = useState(c.teams[c.userTeam].div);
  return (
    <div className="screen">
      <TopBar title={`LEAGUE ${c.year}`} />
      <Tabs tabs={[{ id: 'div', label: 'Division' }, { id: 'conf', label: 'Conference' }, { id: 'playoffs', label: 'Playoffs' }, { id: 'power', label: 'Power' }]} value={t} onChange={setT} />
      {(t === 'div' || t === 'conf') && (
        <div className="row wrap" style={{ gap: 3 }}>
          <div className="row" style={{ gap: 3, flex: '1 1 160px' }}>
            {[0, 1].map((cf) => (
              <button key={cf} className={`tab ${conf === String(cf) ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => setConf(String(cf) as '0' | '1')}>{CONFERENCES[cf].split(' ')[0]}</button>
            ))}
          </div>
          {t === 'div' && (
            <div className="row" style={{ gap: 3, flex: '2 1 240px' }}>
              {DIVISIONS.map((d, i) => (
                <button key={d} className={`tab ${div === i ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => setDiv(i)}>{d}</button>
              ))}
            </div>
          )}
        </div>
      )}
      <Panel dark className="fill">
        {t === 'div' && <DivTable c={c} conf={Number(conf)} div={div} />}
        {t === 'conf' && <ConfTable c={c} conf={Number(conf)} />}
        {t === 'playoffs' && <Bracket c={c} />}
        {t === 'power' && <Power c={c} />}
      </Panel>
    </div>
  );
}

function Row({ c, id, rank }: { c: Career; id: number; rank?: string }) {
  const app = useApp();
  const t = c.teams[id];
  const r = t.rec;
  return (
    <tr className={`click ${id === c.userTeam ? 'me' : ''}`} onClick={() => app.go('team', { teamId: id })}>
      {rank !== undefined && <td>{rank}</td>}
      <td>
        <div className="row" style={{ gap: 6 }}>
          <TeamBadge team={t} size={20} />
          <span>{t.abbr} <span className="wide-only">{t.name}</span></span>
        </div>
      </td>
      <td className="num">{recordText(t)}</td>
      <td className="num wide-only">{pct(r.w, r.l, r.t).toFixed(3).replace(/^0/, '')}</td>
      <td className="num">{r.pf}</td>
      <td className="num">{r.pa}</td>
      <td className="num wide-only">{r.divW}-{r.divL}</td>
      <td className="num">{r.streak > 0 ? `W${r.streak}` : r.streak < 0 ? `L${-r.streak}` : '-'}</td>
    </tr>
  );
}

const HEAD = (
  <tr><th>TEAM</th><th className="num">W-L</th><th className="num wide-only">PCT</th><th className="num">PF</th><th className="num">PA</th><th className="num wide-only">DIV</th><th className="num">STK</th></tr>
);

function DivTable({ c, conf, div }: { c: Career; conf: number; div: number }) {
  const ids = divisionStandings(c, conf, div);
  return <PagedTable rows={ids} rowKey={(id) => id} resetKey={`${conf}-${div}`} head={HEAD} row={(id) => <Row key={id} c={c} id={id} />} />;
}

function ConfTable({ c, conf }: { c: Career; conf: number }) {
  const seeds = conferenceSeeds(c, conf);
  return (
    <PagedTable
      rows={seeds.map((id, i) => ({ id, i }))}
      rowKey={(r) => r.id}
      resetKey={conf}
      head={<tr><th>#</th><th>TEAM</th><th className="num">W-L</th><th className="num wide-only">PCT</th><th className="num">PF</th><th className="num">PA</th><th className="num wide-only">DIV</th><th className="num">STK</th></tr>}
      row={(r) => <Row key={r.id} c={c} id={r.id} rank={r.i < 7 ? `${r.i + 1}${r.i < 4 ? '*' : ''}` : String(r.i + 1)} />}
    />
  );
}

function Bracket({ c }: { c: Career }) {
  const rounds: ('WC' | 'DIV' | 'CONF' | 'FINAL')[] = ['WC', 'DIV', 'CONF', 'FINAL'];
  const games = c.schedule.filter((g) => g.playoff);
  if (!c.playoffs) {
    return (
      <div className="col" style={{ gap: 4 }}>
        <div className="muted small">If the season ended today:</div>
        <div className="grid2" style={{ gap: 8 }}>
          {[0, 1].map((conf) => (
            <div key={conf}>
              <h3>{CONFERENCES[conf].split(' ')[0]}</h3>
              {conferenceSeeds(c, conf).slice(0, 7).map((id, i) => (
                <div key={id} className={`small ${id === c.userTeam ? 'gold' : ''}`}>
                  {i + 1}. {c.teams[id].abbr} {recordText(c.teams[id])}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="col" style={{ gap: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {rounds.map((r) => (
          <div key={r} className="col" style={{ gap: 4, justifyContent: 'space-around' }}>
            <div className="pixel cyan" style={{ fontSize: 7 }}>{r === 'FINAL' ? 'BOWL' : r}</div>
            {games.filter((g) => g.playoff === r).map((g) => {
              const hw = g.played && g.hs > g.as;
              const aw = g.played && g.as > g.hs;
              return (
                <div key={g.id} className="game small" style={{ background: 'var(--panel2)', border: '1px solid #fff', borderRadius: 4, padding: '1px 4px' }}>
                  <div className={aw ? 'gold' : ''}>{c.teams[g.away].abbr} {g.played ? g.as : ''}</div>
                  <div className={hw ? 'gold' : ''}>{c.teams[g.home].abbr} {g.played ? g.hs : ''}</div>
                </div>
              );
            })}
            {games.filter((g) => g.playoff === r).length === 0 && <div className="muted tiny">TBD</div>}
          </div>
        ))}
      </div>
      {c.playoffs.champion !== undefined && <div className="gold pixel" style={{ fontSize: 9 }}>CHAMPION: {c.teams[c.playoffs.champion].city} {c.teams[c.playoffs.champion].name}</div>}
    </div>
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
    <PagedTable
      rows={list.map((x, i) => ({ ...x, i }))}
      rowKey={(r) => r.t.id}
      head={<tr><th>#</th><th>TEAM</th><th className="num">REC</th><th className="num">OVR</th><th className="num">OFF</th><th className="num">DEF</th></tr>}
      row={({ t, u, i }) => (
        <tr key={t.id} className={`click ${t.id === c.userTeam ? 'me' : ''}`} onClick={() => app.go('team', { teamId: t.id })}>
          <td>{i + 1}</td>
          <td><div className="row" style={{ gap: 6 }}><TeamBadge team={t} size={20} />{t.abbr}</div></td>
          <td className="num">{recordText(t)}</td>
          <td className="num"><Ovr v={u.ovr} /></td>
          <td className="num">{u.off}</td>
          <td className="num">{u.def}</td>
        </tr>
      )}
    />
  );
}
