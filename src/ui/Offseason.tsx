import { useEffect, useState } from 'react';
import { Btn, Panel, TopBar, useApp, Ovr, money, Empty, TeamBadge, PotBadge } from './common';
import { capSpace, playerMap, teamName, teamPlayers } from '../league/career';
import {
  finishDraft, finishFreeAgency, finishResign, makePick, processOffseason, prospectView, scoutProspect,
  seasonReview, simDraftToUser, simRestOfDraft, startNewSeason, takeJob, userExpiring, autoFillRoster,
} from '../league/offseason';
import { contractDemand, willResign } from '../league/transactions';
import { unitRatings } from '../league/depth';
import { fullName } from '../league/players';
import { POSITIONS, type Player, type Pos } from '../core/types';
import { PlayerModal } from './Roster';
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
  if (!s) return <div className="screen">Preparing season review...</div>;
  const ev = s.evaluation;
  const fired = c.coach.fired;
  const proceed = async () => {
    processOffseason(c);
    await app.persist();
    app.refresh();
  };
  return (
    <div className="screen">
      <TopBar title={`${s.year} SEASON REVIEW`} />
      <Panel>
        <div className="row">
          <TeamBadge team={c.teams[c.userTeam]} size={48} />
          <div className="grow">
            <div className="pixel" style={{ fontSize: 11 }}>{teamName(c.teams[c.userTeam])}</div>
            <div>{s.record} - <span className="gold">{s.playoff}</span></div>
          </div>
        </div>
        {s.champion >= 0 && <div className="small" style={{ marginTop: 6 }}>Champion: <b className="gold">{teamName(c.teams[s.champion])}</b></div>}
      </Panel>
      <Panel title="OWNER'S EVALUATION">
        <div className="small">Expected {ev.expected.toFixed(1)} wins, achieved {ev.wins}.</div>
        <div className="small">Job security {ev.securityChange >= 0 ? '+' : ''}{ev.securityChange} (now {c.coach.security}) - Reputation {ev.reputationChange >= 0 ? '+' : ''}{ev.reputationChange} (now {c.coach.reputation})</div>
        {ev.notes.map((n, i) => <div key={i} className="small muted">- {n}</div>)}
        <div className="small" style={{ marginTop: 4 }}>Season finances: revenue {money(s.finances.revenue)}, expenses {money(s.finances.expenses)}.</div>
      </Panel>
      <Panel title="LEAGUE AWARDS">
        {Object.entries(s.awards.names).map(([k, v]) => (
          <div key={k} className="spread small"><span className="cyan">{k}</span><span>{v}</span></div>
        ))}
      </Panel>
      {s.recordsBroken.length > 0 && (
        <Panel title="RECORDS BROKEN">
          {s.recordsBroken.map((r, i) => <div key={i} className="small gold">{r}</div>)}
        </Panel>
      )}
      {fired ? (
        <Panel title="YOU'VE BEEN FIRED">
          <p>The owner has decided to make a coaching change. {c.jobOffers.length ? 'Other teams are interested in hiring you:' : 'No teams are calling right now.'}</p>
          {c.jobOffers.map((id) => (
            <div key={id} className="spread" style={{ marginBottom: 6 }}>
              <div className="row"><TeamBadge team={c.teams[id]} size={30} /> {teamName(c.teams[id])} <span className="muted small">({c.teams[id].rec.w}-{c.teams[id].rec.l})</span></div>
              <Btn kind="green" size="small" onClick={async () => { takeJob(c, id); await app.persist(); app.refresh(); }}>Accept</Btn>
            </div>
          ))}
          {c.jobOffers.length === 0 && (
            <Btn kind="green" onClick={async () => {
              // a struggling franchise always gives a second chance
              const worst = [...c.teams].filter((t) => t.id !== c.userTeam).sort((a, b) => a.rec.w - b.rec.w)[0];
              takeJob(c, worst.id);
              await app.persist();
              app.refresh();
            }}>Take a job with a rebuilding team</Btn>
          )}
        </Panel>
      ) : (
        <>
          {c.jobOffers.length > 0 && (
            <Panel title="JOB OFFERS">
              <div className="small muted" style={{ marginBottom: 6 }}>Your reputation has other owners calling. Moving resets job security and facilities.</div>
              {c.jobOffers.map((id) => {
                const u = unitRatings(c, id);
                return (
                  <div key={id} className="spread" style={{ marginBottom: 6 }}>
                    <div className="row"><TeamBadge team={c.teams[id]} size={30} /> {teamName(c.teams[id])} <Ovr v={u.ovr} /></div>
                    <Btn kind="blue" size="small" onClick={async () => { takeJob(c, id); await app.persist(); app.refresh(); }}>Move</Btn>
                  </div>
                );
              })}
            </Panel>
          )}
          <Btn kind="green" size="big" wide onClick={proceed}>Begin Offseason</Btn>
        </>
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
  return (
    <div className="screen">
      <TopBar title="RE-SIGN PLAYERS" />
      {s && (s.retirements.length > 0 || s.progression.length > 0) && (
        <Panel title="OFFSEASON REPORT">
          {s.retirements.length > 0 && <div className="small"><b>Retired:</b> {s.retirements.join(', ')}</div>}
          {s.progression.length > 0 && (
            <div className="small" style={{ marginTop: 4 }}>
              <b>Development:</b>{' '}
              {s.progression.map((p, i) => (
                <span key={i} className={p.to > p.from ? 'green' : 'red'}>{p.pos} {p.name} {p.from}→{p.to}{i < s.progression.length - 1 ? ', ' : ''}</span>
              ))}
            </div>
          )}
        </Panel>
      )}
      <Panel title="EXPIRING CONTRACTS">
        {list.length === 0 ? <Empty>No contracts expire this year.</Empty> : list.map((p) => {
          const d = contractDemand(c, p, c.userTeam);
          const ok = willResign(c, p);
          const dec = c.resignDecisions[p.id] ?? 'release';
          return (
            <div key={p.id} className="spread" style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
              <span className="grow" onClick={() => setSel(p)} style={{ cursor: 'pointer' }}>{p.pos} {fullName(p)} <span className="muted small">age {p.age}</span></span>
              <Ovr v={p.ovr} />
              <span className="small" style={{ width: 90, textAlign: 'right' }}>{ok ? `${money(d.salary)}x${d.years}` : <span className="red">Refuses</span>}</span>
              <Btn size="small" kind={dec === 'keep' ? 'green' : 'ghost'} disabled={!ok} onClick={() => { c.resignDecisions[p.id] = dec === 'keep' ? 'release' : 'keep'; app.refresh(); }}>
                {dec === 'keep' ? 'Keep' : 'Let go'}
              </Btn>
            </div>
          );
        })}
        <div className="small" style={{ marginTop: 8 }}>Cap space after decisions: <b className={space - keepCost < 0 ? 'red' : 'green'}>{money(space - keepCost)}</b></div>
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
  const recent = c.draftOrder.slice(0, c.draftPos).reverse().slice(0, 12);
  return (
    <div className="screen">
      <TopBar title={`${c.year + 1} DRAFT`} right={<span className="small">Scouting points <b className="gold">{c.scoutPoints}</b></span>} />
      <Panel>
        {done ? (
          <div className="spread">
            <span>The draft is complete.</span>
            <Btn kind="green" onClick={async () => { finishDraft(c); await app.persist(); app.refresh(); }}>Go to Free Agency</Btn>
          </div>
        ) : (
          <div className="spread">
            <div>
              <div className="pixel" style={{ fontSize: 9 }}>Round {slot.round}, Pick {slot.pick}</div>
              <div className={userTurn ? 'gold' : ''}>{userTurn ? 'YOU ARE ON THE CLOCK' : `${c.teams[slot.team].abbr} on the clock`}</div>
              <div className="small muted">Your picks: {myPicks.map((d) => `R${d.round}#${d.pick}${d.pid ? ' ✓' : ''}`).join(', ') || 'none'}</div>
            </div>
            <div className="col">
              {!userTurn && <Btn kind="blue" size="small" onClick={async () => { simDraftToUser(c); await app.persist(); app.refresh(); }}>Sim to my pick</Btn>}
              <Btn kind="ghost" size="small" onClick={async () => { simRestOfDraft(c, true); await app.persist(); app.refresh(); }}>Auto-draft rest</Btn>
            </div>
          </div>
        )}
      </Panel>
      {!done && (
        <>
          <div className="tabs">
            {(['ALL', ...POSITIONS] as ('ALL' | Pos)[]).map((f) => (
              <button key={f} className={`tab ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
          <Panel dark title="PROSPECTS">
            <div className="tablewrap">
              <table className="t">
                <thead><tr><th>POS</th><th>NAME</th><th className="num">AGE</th><th className="num">OVR</th><th className="num">POT</th><th /></tr></thead>
                <tbody>
                  {pool.slice(0, 60).map((p) => {
                    const v = prospectView(p);
                    return (
                      <tr key={p.id} className="click" onClick={() => setSel(p)}>
                        <td>{p.pos}</td>
                        <td>{p.first[0]}. {p.last} <span className="muted tiny">{p.college}</span></td>
                        <td className="num">{p.age}</td>
                        <td className="num">{p.scouted ? <Ovr v={p.ovr} /> : <span className="muted">{v.ovr}</span>}</td>
                        <td className="num">{p.scouted ? <PotBadge p={p} /> : <span className="muted">{v.pot}</span>}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="row">
                            {!p.scouted && <Btn size="small" kind="blue" disabled={c.scoutPoints <= 0} onClick={() => { scoutProspect(c, p.id); app.refresh(); app.persist(); }}>Scout</Btn>}
                            {userTurn && <Btn size="small" kind="green" onClick={async () => { makePick(c, p.id); simDraftToUser(c); await app.persist(); app.refresh(); }}>Draft</Btn>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="muted small">Unscouted prospects show an estimated range. Scouting reveals true ratings.</div>
          </Panel>
        </>
      )}
      <Panel title="RECENT PICKS">
        {recent.length === 0 ? <Empty>No picks yet.</Empty> : recent.map((d) => {
          const p = d.pid ? pm.get(d.pid) : undefined;
          return (
            <div key={`${d.round}-${d.pick}`} className={`small ${d.team === c.userTeam ? 'gold' : ''}`}>
              R{d.round} #{d.pick} {c.teams[d.team].abbr}: {p ? `${p.pos} ${fullName(p)}` : '-'}
            </div>
          );
        })}
      </Panel>
      {sel && <PlayerModal p={sel} onClose={() => setSel(null)} mode="prospect" />}
    </div>
  );
}

function FreeAgency() {
  const app = useApp();
  const c = app.career!;
  return (
    <div>
      <div className="screen" style={{ paddingBottom: 0 }}>
        <Panel title="FREE AGENCY">
          <div className="spread">
            <div className="small">Sign players before the rest of the league does. When you finish, other teams sign the remaining free agents.</div>
            <Btn kind="green" onClick={async () => { finishFreeAgency(c); await app.persist(); app.refresh(); }}>Finish Free Agency</Btn>
          </div>
        </Panel>
      </div>
      <FreeAgentsScreen />
    </div>
  );
}

function Preseason() {
  const app = useApp();
  const c = app.career!;
  const t = c.teams[c.userTeam];
  const roster = teamPlayers(c, c.userTeam);
  const counts = POSITIONS.map((p) => [p, roster.filter((x) => x.pos === p).length] as const);
  const u = unitRatings(c, c.userTeam);
  const short = roster.length < 26;
  return (
    <div className="screen">
      <TopBar title={`${c.year + 1} PRESEASON`} />
      <Panel>
        <div className="row">
          <TeamBadge team={t} size={48} />
          <div className="grow">
            <div className="pixel" style={{ fontSize: 11 }}>{teamName(t)}</div>
            <div className="small">Roster {roster.length}/40 - Cap space {money(capSpace(c, c.userTeam))}</div>
          </div>
          <Ovr v={u.ovr} />
        </div>
        <div className="row wrap small" style={{ marginTop: 6, gap: 10 }}>
          {counts.map(([p, n]) => <span key={p}>{p} {n}</span>)}
        </div>
        {short && <div className="small red" style={{ marginTop: 6 }}>Your roster is thin. Missing spots will be filled with minimum-salary players when the season starts.</div>}
      </Panel>
      <div className="menu-grid">
        <Btn kind="blue" onClick={() => app.go('roster')}>Roster</Btn>
        <Btn kind="blue" onClick={() => app.go('depth')}>Depth Chart</Btn>
        <Btn kind="blue" onClick={() => app.go('office', { tab: 'staff' })}>Hire Staff</Btn>
        <Btn kind="blue" onClick={() => app.go('office', { tab: 'facilities' })}>Facilities</Btn>
        <Btn kind="blue" onClick={() => app.go('freeagents')}>Free Agents</Btn>
        <Btn kind="blue" onClick={() => app.go('trades')}>Trades</Btn>
      </div>
      <div style={{ marginTop: 10 }}>
        <Btn kind="ghost" onClick={async () => { const s = autoFillRoster(c, c.userTeam); app.toast(s.length ? `Signed ${s.length} players` : 'Roster already complete'); await app.persist(); app.refresh(); }}>Auto-fill Roster</Btn>
      </div>
      <div style={{ marginTop: 10 }}>
        <Btn kind="green" size="big" wide onClick={async () => { startNewSeason(c); await app.persist(); app.reset({ name: 'hub' }); }}>Start {c.year + 1} Season</Btn>
      </div>
    </div>
  );
}
