import { useState } from 'react';
import { Btn, Panel, Stars, Tabs, TopBar, useApp, money, Bar } from './common';
import { capSpace, payroll, SALARY_CAP, STAFF_LABEL, type Facilities, type Strategy } from '../league/career';
import { FACILITY_INFO, facilityCost, hireStaff, homeGameRevenue, teamBuilding, teamMorale, upgradeFacility, weeklyExpenses } from '../league/frontoffice';

type Tab = 'staff' | 'facilities' | 'finances' | 'strategy';

export function OfficeScreen({ tab }: { tab?: string }) {
  const app = useApp();
  const c = app.career!;
  const [t, setT] = useState<Tab>((tab as Tab) ?? 'staff');
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (err: string | null, ok: string) => {
    setMsg(err ?? ok);
    if (!err) {
      await app.persist();
      app.refresh();
    }
  };
  return (
    <div className="screen">
      <TopBar title="FRONT OFFICE" right={<span className="small">Cash <b className="gold">{money(c.cash)}</b> - <b className="gold">{c.cc} CC</b></span>} />
      <Tabs tabs={[{ id: 'staff', label: 'Staff' }, { id: 'facilities', label: 'Facilities' }, { id: 'finances', label: 'Finances' }, { id: 'strategy', label: 'Strategy' }]} value={t} onChange={(v) => { setT(v); setMsg(null); }} />
      {msg && <Panel dark><div className="gold">{msg}</div></Panel>}
      {t === 'staff' && (
        <>
          <Panel title="YOUR COACHING STAFF">
            {(['OC', 'DC', 'ST'] as const).map((role) => {
              const s = c.staff.find((x) => x.role === role);
              return (
                <div key={role} className="spread" style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                  <div>
                    <div className="cyan small">{STAFF_LABEL[role]}</div>
                    <div>{s ? s.name : 'Vacant'} {s && <Stars n={s.rating} />}</div>
                  </div>
                  <div className="small right">{s ? `${money(s.salary)}/yr - ${s.years} yr left` : ''}</div>
                </div>
              );
            })}
            <div className="muted small" style={{ marginTop: 6 }}>
              Coordinators boost player development and give an in-game ratings edge to their unit. Strength & Medical improves recovery, reduces injuries and adds scouting points.
            </div>
          </Panel>
          <Panel title="AVAILABLE COACHES">
            {c.staffPool.map((s) => {
              const cur = c.staff.find((x) => x.role === s.role);
              const cost = s.salary * 0.5 + (cur ? cur.salary * Math.max(0, cur.years - 1) * 0.5 : 0);
              return (
                <div key={s.id} className="spread" style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                  <div>
                    <div>{s.name} <span className="muted small">({s.role}, age {s.age})</span></div>
                    <Stars n={s.rating} />
                  </div>
                  <div className="col" style={{ alignItems: 'flex-end' }}>
                    <span className="small">{money(s.salary)}/yr</span>
                    <Btn size="small" disabled={c.cash < cost} onClick={() => act(hireStaff(c, s), `${s.name} hired.`)}>Hire ({money(cost)})</Btn>
                  </div>
                </div>
              );
            })}
            <div className="muted small" style={{ marginTop: 6 }}>Hiring costs a signing bonus plus a buyout of the current coach's remaining deal. The pool refreshes every season.</div>
          </Panel>
        </>
      )}
      {t === 'facilities' && (
        <Panel title="FACILITIES">
          {(Object.keys(FACILITY_INFO) as (keyof Facilities)[]).map((k) => {
            const lvl = c.facilities[k];
            const cost = facilityCost(lvl);
            return (
              <div key={k} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                <div className="spread">
                  <div>
                    <div className="pixel" style={{ fontSize: 9 }}>{FACILITY_INFO[k].name}</div>
                    <div className="row" style={{ gap: 3, marginTop: 4 }}>
                      {[1, 2, 3, 4, 5].map((i) => <span key={i} style={{ width: 18, height: 10, background: i <= lvl ? 'var(--green)' : 'var(--bg2)', border: '1px solid #fff' }} />)}
                    </div>
                  </div>
                  <Btn size="small" disabled={lvl >= 5 || c.cash < cost} onClick={() => act(upgradeFacility(c, k), `${FACILITY_INFO[k].name} upgraded!`)}>
                    {lvl >= 5 ? 'Maxed' : `Upgrade ${money(cost)}`}
                  </Btn>
                </div>
                <div className="muted small">{FACILITY_INFO[k].desc}</div>
              </div>
            );
          })}
        </Panel>
      )}
      {t === 'finances' && (
        <>
          <Panel title="SALARY CAP">
            <div className="spread"><span>Payroll</span><span>{money(payroll(c, c.userTeam))} / {money(SALARY_CAP)}</span></div>
            <Bar v={payroll(c, c.userTeam)} max={SALARY_CAP} color="#8fe3ff" />
            <div className="spread small"><span>Cap space</span><span className={capSpace(c, c.userTeam) < 0 ? 'red' : 'green'}>{money(capSpace(c, c.userTeam))}</span></div>
            <div className="spread small"><span>Dead money</span><span>{money(c.teams[c.userTeam].deadCap)}</span></div>
          </Panel>
          <Panel title="CLUB FINANCES">
            <div className="spread"><span>Cash on hand</span><b className="gold">{money(c.cash)}</b></div>
            <div className="spread small"><span>Revenue this season</span><span className="green">{money(c.seasonRevenue)}</span></div>
            <div className="spread small"><span>Expenses this season</span><span className="red">{money(c.seasonExpenses)}</span></div>
            <div className="spread small"><span>Est. home game gate</span><span>{money(homeGameRevenue(c))}</span></div>
            <div className="spread small"><span>Weekly staff & upkeep</span><span>{money(weeklyExpenses(c))}</span></div>
            <div className="muted small" style={{ marginTop: 6 }}>Ticket sales depend on fan support, stadium size and winning. The owner watches profits when judging your job.</div>
            {c.ledger.length > 0 && (
              <div className="tablewrap" style={{ marginTop: 6 }}>
                <table className="t">
                  <thead><tr><th>YEAR</th><th className="num">REVENUE</th><th className="num">EXPENSES</th><th className="num">PROFIT</th></tr></thead>
                  <tbody>
                    {[...c.ledger].reverse().map((l) => (
                      <tr key={l.year}><td>{l.year}</td><td className="num">{money(l.revenue)}</td><td className="num">{money(l.expenses)}</td><td className={`num ${l.revenue - l.expenses >= 0 ? 'green' : 'red'}`}>{money(l.revenue - l.expenses)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
      {t === 'strategy' && (
        <>
          <Panel title="GAME PLAN">
            <h3>Offensive philosophy</h3>
            <div className="row wrap">
              {(['balanced', 'pass', 'run'] as Strategy['off'][]).map((s) => (
                <button key={s} className={`tab ${c.strategy.off === s ? 'on' : ''}`} onClick={() => { c.strategy.off = s; app.refresh(); app.persist(); }}>{s}</button>
              ))}
            </div>
            <div className="muted small">Used whenever your games are simulated (sim game / sim rest).</div>
            <h3 style={{ marginTop: 10 }}>Defensive style</h3>
            <div className="row wrap">
              {(['balanced', 'aggressive', 'conservative'] as Strategy['def'][]).map((s) => (
                <button key={s} className={`tab ${c.strategy.def === s ? 'on' : ''}`} onClick={() => { c.strategy.def = s; app.refresh(); app.persist(); }}>{s}</button>
              ))}
            </div>
            <div className="muted small">Controls how often your defensive coordinator blitzes when you let him call plays (auto defense) and in simulated games.</div>
          </Panel>
          <Panel title="LOCKER ROOM">
            <div className="spread"><span>Team morale</span><span>{teamMorale(c)}</span></div>
            <Bar v={teamMorale(c)} max={100} color="#ff9d4d" />
            <div className="muted small" style={{ margin: '6px 0' }}>Morale slightly boosts in-game ratings and makes players easier to re-sign.</div>
            <Btn disabled={c.cc < 2} onClick={() => act(teamBuilding(c), 'Team morale +8 for everyone.')}>Team Retreat (2 CC)</Btn>
          </Panel>
        </>
      )}
    </div>
  );
}
