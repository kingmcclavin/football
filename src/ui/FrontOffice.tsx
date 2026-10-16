import { useState } from 'react';
import { Paged, PagedTable } from './paged';
import { Btn, Panel, Stars, Tabs, TopBar, useApp, money, Bar } from './common';
import { capSpace, payroll, SALARY_CAP, STAFF_LABEL, type Facilities, type Strategy } from '../league/career';
import { FACILITY_INFO, facilityCost, hireStaff, homeGameRevenue, teamBuilding, teamMorale, upgradeFacility, weeklyExpenses } from '../league/frontoffice';

type Tab = 'staff' | 'hire' | 'facilities' | 'finances' | 'strategy';

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
  const row = { padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.15)' };
  return (
    <div className="screen">
      <TopBar title="OFFICE" right={<span className="small"><b className="gold">{money(c.cash)}</b> <b className="gold">{c.cc} CC</b></span>} />
      <Tabs tabs={[{ id: 'staff', label: 'Staff' }, { id: 'hire', label: 'Hire' }, { id: 'facilities', label: 'Facilities' }, { id: 'finances', label: 'Money' }, { id: 'strategy', label: 'Plan' }]} value={t} onChange={(v) => { setT(v); setMsg(null); }} />
      {msg && <div className="gold small">{msg}</div>}
      <Panel dark className="fill">
        {t === 'staff' && (
          <div className="col" style={{ gap: 2 }}>
            {(['OC', 'DC', 'ST'] as const).map((role) => {
              const s = c.staff.find((x) => x.role === role);
              return (
                <div key={role} className="spread" style={row}>
                  <div>
                    <div className="cyan tiny">{STAFF_LABEL[role]}</div>
                    <div className="small">{s ? s.name : 'Vacant'} {s && <Stars n={s.rating} />}</div>
                  </div>
                  <div className="tiny right">{s ? `${money(s.salary)}/yr - ${s.years}y` : ''}</div>
                </div>
              );
            })}
            <div className="muted tiny">Coordinators boost development and in-game ratings for their unit. Strength & Medical improves recovery, reduces injuries and adds scouting points.</div>
          </div>
        )}
        {t === 'hire' && (
          <Paged
            items={c.staffPool.map((s) => {
              const cur = c.staff.find((x) => x.role === s.role);
              const cost = s.salary * 0.5 + (cur ? cur.salary * Math.max(0, cur.years - 1) * 0.5 : 0);
              return (
                <div key={s.id} className="spread" style={row}>
                  <div style={{ minWidth: 0 }}>
                    <div className="small">{s.name} <span className="muted tiny">{s.role}</span></div>
                    <div className="row" style={{ gap: 6 }}><Stars n={s.rating} /><span className="tiny">{money(s.salary)}/yr</span></div>
                  </div>
                  <Btn size="small" disabled={c.cash < cost} onClick={() => act(hireStaff(c, s), `${s.name} hired.`)}>Hire {money(cost)}</Btn>
                </div>
              );
            })}
          />
        )}
        {t === 'facilities' && (
          <div className="col" style={{ gap: 2 }}>
            {(Object.keys(FACILITY_INFO) as (keyof Facilities)[]).map((k) => {
              const lvl = c.facilities[k];
              const cost = facilityCost(lvl);
              return (
                <div key={k} style={row}>
                  <div className="spread">
                    <div>
                      <div className="pixel" style={{ fontSize: 8 }}>{FACILITY_INFO[k].name}</div>
                      <div className="row" style={{ gap: 3, marginTop: 3 }}>
                        {[1, 2, 3, 4, 5].map((i) => <span key={i} style={{ width: 16, height: 8, background: i <= lvl ? 'var(--green)' : 'var(--bg2)', border: '1px solid #fff' }} />)}
                      </div>
                    </div>
                    <Btn size="small" disabled={lvl >= 5 || c.cash < cost} onClick={() => act(upgradeFacility(c, k), `${FACILITY_INFO[k].name} upgraded!`)}>
                      {lvl >= 5 ? 'Maxed' : `Upgrade ${money(cost)}`}
                    </Btn>
                  </div>
                  <div className="muted tiny">{FACILITY_INFO[k].desc}</div>
                </div>
              );
            })}
          </div>
        )}
        {t === 'finances' && (
          <div className="fill" style={{ gap: 3 }}>
            <div className="spread small"><span>Payroll / cap</span><span>{money(payroll(c, c.userTeam))} / {money(SALARY_CAP)}</span></div>
            <Bar v={payroll(c, c.userTeam)} max={SALARY_CAP} color="#8fe3ff" />
            <div className="spread small"><span>Cap space</span><span className={capSpace(c, c.userTeam) < 0 ? 'red' : 'green'}>{money(capSpace(c, c.userTeam))}</span></div>
            <div className="spread small"><span>Season revenue / costs</span><span><span className="green">{money(c.seasonRevenue)}</span> / <span className="red">{money(c.seasonExpenses)}</span></span></div>
            <div className="spread small"><span>Home gate / weekly costs</span><span>{money(homeGameRevenue(c))} / {money(weeklyExpenses(c))}</span></div>
            {c.ledger.length > 0 ? (
              <PagedTable
                rows={[...c.ledger].reverse()}
                rowKey={(l) => l.year}
                head={<tr><th>YEAR</th><th className="num">REV</th><th className="num">COST</th><th className="num">PROFIT</th></tr>}
                row={(l) => <tr key={l.year}><td>{l.year}</td><td className="num">{money(l.revenue)}</td><td className="num">{money(l.expenses)}</td><td className={`num ${l.revenue - l.expenses >= 0 ? 'green' : 'red'}`}>{money(l.revenue - l.expenses)}</td></tr>}
              />
            ) : (
              <div className="muted tiny">Ticket sales depend on fans, stadium size and winning. The owner watches profits.</div>
            )}
          </div>
        )}
        {t === 'strategy' && (
          <div className="col" style={{ gap: 4 }}>
            <h3>Offense (simulated games)</h3>
            <div className="row" style={{ gap: 3 }}>
              {(['balanced', 'pass', 'run'] as Strategy['off'][]).map((x) => (
                <button key={x} className={`tab ${c.strategy.off === x ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => { c.strategy.off = x; app.refresh(); app.persist(); }}>{x}</button>
              ))}
            </div>
            <h3>Defense (auto calls + sims)</h3>
            <div className="row" style={{ gap: 3 }}>
              {(['balanced', 'aggressive', 'conservative'] as Strategy['def'][]).map((x) => (
                <button key={x} className={`tab ${c.strategy.def === x ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => { c.strategy.def = x; app.refresh(); app.persist(); }}>{x}</button>
              ))}
            </div>
            <div className="spread small"><span>Team morale</span><span>{teamMorale(c)}</span></div>
            <Bar v={teamMorale(c)} max={100} color="#ff9d4d" />
            <Btn size="small" disabled={c.cc < 2} onClick={() => act(teamBuilding(c), 'Team morale +8 for everyone.')}>Team Retreat (2 CC)</Btn>
          </div>
        )}
      </Panel>
    </div>
  );
}
