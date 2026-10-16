import { useEffect, useState } from 'react';
import { Btn, Panel, TopBar, useApp, Ovr, money, Empty, TeamBadge, PotBadge, Tabs } from './common';
import { Paged, PagedTable } from './paged';
import { capSpace, playerMap, teamName, teamPlayers } from '../league/career';
import {
  finishDraft, finishFreeAgency, finishResign, makePick, processOffseason, prospectView, scoutProspect,
  seasonReview, simDraftToUser, simRestOfDraft, startNewSeason, takeJob, userExpiring, autoFillRoster,
} from '../league/offseason';
import { contractDemand, willResign } from '../league/transactions';
import { unitRatings } from '../league/depth';
import { POSITIONS, type Player, type Pos } from '../core/types';
import { PlayerModal, PosFilter } from './Roster';
import { FreeAgentsScreen } from './FreeAgents';

export function OffseasonScreen() {
  const app = useApp();
  const c = app.career!;
  useEffect(() => {
    if (c.offStep === 'review' && !c.summary) {
      seasonReview(c);
      app.persist();
      app.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (c.phase !== 'offseason') {
    return (
      <div className="screen">
        <TopBar title="OFFSEASON" />
        <Empty>The offseason begins after the Gridiron Bowl.</Empty>
      </div>
    );
  }
  switch (c.offStep) {
    case 'review':
      return <Review />;
    case 'resign':
      return <Resign />;
    case 'draft':
      return <Draft />;
    case 'freeagency':
      return <FreeAgency />;
    default:
      return <Preseason />;
  }
}

function Review() {
  const app = useApp();
  const c = app.career!;
  const s = c.summary;
  const [tab, setTab] = useState<'owner' | 'awards' | 'records' | 'jobs'>(c.coach.fired ? 'jobs' : 'owner');
  if (!s) return <div className="screen">Preparing season review...</div>;
  const ev = s.evaluation;
  const fired = c.coach.fired;
  const proceed = async () => {
    processOffseason(c);
    await app.persist();
    app.refresh();
  };
  const take = async (id: number) => { takeJob(c, id); await app.persist(); app.refresh(); };
  const tabs: { id: typeof tab; label: string }[] = [{ id: 'owner', label: 'Owner' }, { id: 'awards', label: 'Awards' }];
  if (s.recordsBroken.length) tabs.push({ id: 'records', label: 'Records' });
  if (fired || c.jobOffers.length) tabs.push({ id: 'jobs', label: fired ? 'Fired!' : `Offers (${c.jobOffers.length})` });
  const line = { padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.15)' };
  return (
    <div className="screen">
      <TopBar title={`${s.year} REVIEW`} />
      <Panel>
        <div className="row">
          <TeamBadge team={c.teams[c.userTeam]} size={36} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="pixel" style={{ fontSize: 10 }}>{teamName(c.teams[c.userTeam])}</div>
            <div className="small">{s.record} - <span className="gold">{s.playoff}</span></div>
            {s.champion >= 0 && <div className="tiny">Champion: <b className="gold">{teamName(c.teams[s.champion])}</b></div>}
          </div>
        </div>
      </Panel>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <Panel dark className="fill">
        {tab === 'owner' && (
          <Paged
            resetKey="owner"
            items={[
              <div key="w" className="small">Expected {ev.expected.toFixed(1)} wins, achieved {ev.wins}.</div>,
              <div key="s" className="small">Job security {ev.securityChange >= 0 ? '+' : ''}{ev.securityChange} (now {c.coach.security})</div>,
              <div key="r" className="small">Reputation {ev.reputationChange >= 0 ? '+' : ''}{ev.reputationChange} (now {c.coach.reputation})</div>,
              <div key="f" className="small">Revenue {money(s.finances.revenue)}, expenses {money(s.finances.expenses)}.</div>,
              ...ev.notes.map((n, i) => <div key={i} className="small muted">- {n}</div>),
            ]}
          />
        )}
        {tab === 'awards' && (
          <Paged resetKey="awards" items={Object.entries(s.awards.names).map(([k, v]) => <div key={k} className="spread small" style={line}><span className="cyan">{k}</span><span className="right">{v}</span></div>)} />
        )}
        {tab === 'records' && <Paged resetKey="records" items={s.recordsBroken.map((r, i) => <div key={i} className="small gold" style={line}>{r}</div>)} />}
        {tab === 'jobs' && (
          <Paged
            resetKey="jobs"
            items={[
              <div key="h" className="small muted" style={{ marginBottom: 4 }}>
                {fired
                  ? `The owner has made a coaching change. ${c.jobOffers.length ? 'Other teams want to hire you:' : 'No teams are calling right now.'}`
                  : 'Other owners are calling. Moving resets job security and facilities.'}
              </div>,
              ...c.jobOffers.map((id) => (
                <div key={id} className="spread" style={line}>
                  <div className="row" style={{ gap: 6, minWidth: 0 }}><TeamBadge team={c.teams[id]} size={24} /><span className="small">{c.teams[id].abbr} {c.teams[id].rec.w}-{c.teams[id].rec.l}</span><Ovr v={unitRatings(c, id).ovr} /></div>
                  <Btn kind={fired ? 'green' : 'blue'} size="small" onClick={() => take(id)}>{fired ? 'Accept' : 'Move'}</Btn>
                </div>
              )),
            ]}
          />
        )}
      </Panel>
      {fired ? (
        c.jobOffers.length === 0 && (
          <Btn kind="green" size="big" wide onClick={() => {
            // a struggling franchise always gives a second chance
            const worst = [...c.teams].filter((t) => t.id !== c.userTeam).sort((a, b) => a.rec.w - b.rec.w)[0];
            take(worst.id);
          }}>Join a Rebuilding Team</Btn>
        )
      ) : (
        <Btn kind="green" size="big" wide onClick={proceed}>Begin Offseason</Btn>
      )}
    </div>
  );
}

function Resign() {
  const app = useApp();
  const c = app.career!;
  const s = c.summary;
  const list = userExpiring(c);
  const [sel, setSel] = useState<Player | null>(null);
  const hasReport = !!s && (s.retirements.length > 0 || s.progression.length > 0);
  const [tab, setTab] = useState<'contracts' | 'report'>('contracts');
  // sensible defaults: keep willing, useful players (best first) while the cap allows
  useEffect(() => {
    if (Object.keys(c.resignDecisions).length) return;
    let room = capSpace(c, c.userTeam) - list.reduce((t, p) => t + p.contract.salary, 0);
    for (const p of [...list].sort((a, b) => b.ovr - a.ovr)) {
      const d = contractDemand(c, p, c.userTeam);
      const keep = willResign(c, p) && p.ovr >= 60 && p.age <= 32 && d.salary <= room;
      c.resignDecisions[p.id] = keep ? 'keep' : 'release';
      if (keep) room -= d.salary;
    }
    app.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const keepCost = list.filter((p) => (c.resignDecisions[p.id] ?? 'release') === 'keep').reduce((t, p) => t + contractDemand(c, p, c.userTeam).salary, 0);
  const space = capSpace(c, c.userTeam) - list.reduce((t, p) => t + p.contract.salary, 0);
  const report: JSX.Element[] = [];
  if (s) {
    if (s.retirements.length) report.push(<h3 key="rh">Retired</h3>, ...s.retirements.map((r, i) => <div key={'r' + i} className="small">{r}</div>));
    if (s.progression.length) report.push(<h3 key="dh" style={{ marginTop: 4 }}>Development</h3>, ...s.progression.map((p, i) => <div key={'d' + i} className={`small ${p.to > p.from ? 'green' : 'red'}`}>{p.pos} {p.name} {p.from}→{p.to}</div>));
  }
  return (
    <div className="screen">
      <TopBar title="RE-SIGN" right={<span className="small">Cap after <b className={space - keepCost < 0 ? 'red' : 'green'}>{money(space - keepCost)}</b></span>} />
      {hasReport && <Tabs tabs={[{ id: 'contracts', label: `Expiring (${list.length})` }, { id: 'report', label: 'Report' }]} value={tab} onChange={setTab} />}
      <Panel dark className="fill">
        {tab === 'report' ? (
          <Paged resetKey="report" items={report} />
        ) : list.length === 0 ? (
          <Empty>No contracts expire this year.</Empty>
        ) : (
          <Paged
            resetKey="contracts"
            items={list.map((p) => {
              const d = contractDemand(c, p, c.userTeam);
              const ok = willResign(c, p);
              const dec = c.resignDecisions[p.id] ?? 'release';
              return (
                <div key={p.id} className="row" style={{ gap: 6, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                  <div className="grow" onClick={() => setSel(p)} style={{ cursor: 'pointer', minWidth: 0 }}>
                    <div className="small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.pos} {p.first[0]}. {p.last}</div>
                    <div className="tiny muted">age {p.age} - {ok ? `${money(d.salary)}x${d.years}` : <span className="red">Refuses</span>}</div>
                  </div>
                  <Ovr v={p.ovr} />
                  <Btn size="small" kind={dec === 'keep' ? 'green' : 'ghost'} disabled={!ok} onClick={() => { c.resignDecisions[p.id] = dec === 'keep' ? 'release' : 'keep'; app.refresh(); }}>
                    {dec === 'keep' ? 'Keep' : 'Let go'}
                  </Btn>
                </div>
              );
            })}
          />
        )}
      </Panel>
      <Btn kind="green" size="big" wide disabled={space - keepCost < 0} onClick={async () => { finishResign(c); simDraftToUser(c); await app.persist(); app.refresh(); }}>
        Confirm & Go to Draft
      </Btn>
      {sel && <PlayerModal p={sel} onClose={() => setSel(null)} mode="view" />}
    </div>
  );
}

function Draft() {
  const app = useApp();
  const c = app.career!;
  const [filter, setFilter] = useState<'ALL' | Pos>('ALL');
  const [tab, setTab] = useState<'pool' | 'picks'>('pool');
  const [sel, setSel] = useState<Player | null>(null);
  const pm = playerMap(c);
  const slot = c.draftOrder[c.draftPos];
  const done = c.draftPos >= c.draftOrder.length;
  const userTurn = slot && slot.team === c.userTeam;
  const pool = c.draftClass.map((id) => pm.get(id)!).filter((p) => p && (filter === 'ALL' || p.pos === filter));
  pool.sort((a, b) => {
    const va = prospectView(a);
    const vb = prospectView(b);
    return parseInt(vb.ovr) + parseInt(vb.pot) * 0.6 - (parseInt(va.ovr) + parseInt(va.pot) * 0.6);
  });
  const myPicks = c.draftOrder.filter((d) => d.team === c.userTeam);
  const recent = c.draftOrder.slice(0, c.draftPos).reverse();
  const run = async (f: () => void) => { f(); await app.persist(); app.refresh(); };
  return (
    <div className="screen">
      <TopBar title={`${c.year + 1} DRAFT`} right={<span className="small">Scout pts <b className="gold">{c.scoutPoints}</b></span>} />
      <Panel>
        {done ? (
          <div className="spread">
            <span className="small">The draft is complete.</span>
            <Btn kind="green" size="small" onClick={() => run(() => finishDraft(c))}>Go to Free Agency</Btn>
          </div>
        ) : (
          <div className="spread" style={{ gap: 6 }}>
            <div style={{ minWidth: 0 }}>
              <div className="pixel" style={{ fontSize: 8 }}>R{slot.round} Pick {slot.pick} - <span className={userTurn ? 'gold' : ''}>{userTurn ? 'YOUR PICK' : `${c.teams[slot.team].abbr} picking`}</span></div>
              <div className="tiny muted">Yours: {myPicks.map((d) => `R${d.round}#${d.pick}${d.pid ? '✓' : ''}`).join(' ') || 'none'}</div>
            </div>
            <div className="row" style={{ gap: 4 }}>
              {!userTurn && <Btn kind="blue" size="small" onClick={() => run(() => simDraftToUser(c))}>To my pick</Btn>}
              <Btn kind="ghost" size="small" onClick={() => run(() => simRestOfDraft(c, true))}>Auto</Btn>
            </div>
          </div>
        )}
      </Panel>
      <Tabs tabs={[{ id: 'pool', label: 'Prospects' }, { id: 'picks', label: 'Picks Made' }]} value={tab} onChange={setTab} />
      {tab === 'pool' && !done && <PosFilter value={filter} onChange={setFilter} />}
      <Panel dark className="fill">
        {tab === 'picks' || done ? (
          recent.length === 0 ? <Empty>No picks yet.</Empty> : (
            <Paged
              resetKey="picks"
              items={recent.map((d) => {
                const p = d.pid ? pm.get(d.pid) : undefined;
                return (
                  <div key={`${d.round}-${d.pick}`} className={`small ${d.team === c.userTeam ? 'gold' : ''}`} style={{ padding: '1px 0' }}>
                    R{d.round} #{d.pick} {c.teams[d.team].abbr}: {p ? `${p.pos} ${p.first[0]}. ${p.last}` : '-'}
                  </div>
                );
              })}
            />
          )
        ) : (
          <PagedTable
            rows={pool}
            rowKey={(p) => p.id}
            resetKey={filter}
            head={<tr><th>POS</th><th>NAME</th><th className="num wide-only">AGE</th><th className="num">OVR</th><th className="num">POT</th><th /></tr>}
            row={(p) => {
              const v = prospectView(p);
              return (
                <tr key={p.id} className="click" onClick={() => setSel(p)}>
                  <td>{p.pos}</td>
                  <td style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.first[0]}. {p.last}</td>
                  <td className="num wide-only">{p.age}</td>
                  <td className="num">{p.scouted ? <Ovr v={p.ovr} /> : <span className="muted">{v.ovr}</span>}</td>
                  <td className="num">{p.scouted ? <PotBadge p={p} /> : <span className="muted">{v.pot}</span>}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row" style={{ gap: 3, justifyContent: 'flex-end' }}>
                      {!p.scouted && <Btn size="small" kind="blue" disabled={c.scoutPoints <= 0} onClick={() => { scoutProspect(c, p.id); app.refresh(); app.persist(); }}>Scout</Btn>}
                      {userTurn && <Btn size="small" kind="green" onClick={() => run(() => { makePick(c, p.id); simDraftToUser(c); })}>Pick</Btn>}
                    </div>
                  </td>
                </tr>
              );
            }}
          />
        )}
      </Panel>
      {sel && <PlayerModal p={sel} onClose={() => setSel(null)} mode="prospect" />}
    </div>
  );
}

function FreeAgency() {
  const app = useApp();
  const c = app.career!;
  return <FreeAgentsScreen onFinish={async () => { finishFreeAgency(c); await app.persist(); app.refresh(); }} />;
}

function Preseason() {
  const app = useApp();
  const c = app.career!;
  const t = c.teams[c.userTeam];
  const roster = teamPlayers(c, c.userTeam);
  const counts = POSITIONS.map((p) => [p, roster.filter((x) => x.pos === p).length] as const);
  const u = unitRatings(c, c.userTeam);
  const short = roster.length < 26;
  const tiles: [string, () => void][] = [
    ['Roster', () => app.go('roster')],
    ['Depth', () => app.go('depth')],
    ['Staff', () => app.go('office', { tab: 'hire' })],
    ['Facilities', () => app.go('office', { tab: 'facilities' })],
    ['Free Agents', () => app.go('freeagents')],
    ['Trades', () => app.go('trades')],
    ['Auto-fill', async () => { const s = autoFillRoster(c, c.userTeam); app.toast(s.length ? `Signed ${s.length} players` : 'Roster already complete'); await app.persist(); app.refresh(); }],
    ['League', () => app.go('league')],
  ];
  return (
    <div className="screen">
      <TopBar title={`${c.year + 1} PRESEASON`} />
      <Panel>
        <div className="row">
          <TeamBadge team={t} size={36} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="pixel" style={{ fontSize: 10 }}>{teamName(t)}</div>
            <div className="small">Roster {roster.length}/40 - Cap {money(capSpace(c, c.userTeam))}</div>
          </div>
          <Ovr v={u.ovr} />
        </div>
        <div className="row wrap tiny" style={{ marginTop: 4, gap: 8 }}>
          {counts.map(([p, n]) => <span key={p}>{p} {n}</span>)}
        </div>
        {short && <div className="tiny red" style={{ marginTop: 4 }}>Roster is thin: empty spots get minimum-salary players at kickoff.</div>}
      </Panel>
      <div className="fill" style={{ justifyContent: 'center' }}>
        <div className="tile-grid">
          {tiles.map(([label, f]) => <Btn key={label} kind="blue" onClick={f}>{label}</Btn>)}
        </div>
      </div>
      <Btn kind="green" size="big" wide onClick={async () => { startNewSeason(c); await app.persist(); app.reset({ name: 'hub' }); }}>Start {c.year + 1} Season</Btn>
    </div>
  );
}
