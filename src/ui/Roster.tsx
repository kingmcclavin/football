import { useMemo, useState } from 'react';
import { Btn, Face, Modal, Ovr, Panel, Tabs, TeamBadge, TopBar, useApp, money, Bar, PotBadge, Empty } from './common';
import { POSITIONS, RATING_LABELS, type Player, type Pos, type RatingKey, type StatLine } from '../core/types';
import { capSpace, payroll, playerMap, SALARY_CAP, teamName, teamPlayers, TRADE_DEADLINE_WEEK, type Career } from '../league/career';
import { OVR_WEIGHTS, fullName, potGrade, STARTERS, MIN_ROSTER } from '../league/players';
import { contractDemand, releasePlayer, willResign } from '../league/transactions';
import { trainPlayer } from '../league/frontoffice';
import { autoDepth, unitRatings } from '../league/depth';
import { recordText } from '../league/standings';
import { careerTotal } from '../league/records';

const POS_FILTER: ('ALL' | Pos)[] = ['ALL', ...POSITIONS];

export function statSummary(p: Player, s: StatLine): string {
  const parts: string[] = [];
  if (s.pAtt) parts.push(`${s.pCmp}/${s.pAtt}, ${s.pYds} yds, ${s.pTd} TD, ${s.pInt} INT`);
  if (s.rAtt) parts.push(`${s.rAtt} car, ${s.rYds} yds, ${s.rTd} TD`);
  if (s.rec) parts.push(`${s.rec} rec, ${s.recYds} yds, ${s.recTd} TD`);
  if (s.tkl || s.sacks || s.dInt) parts.push(`${s.tkl} tkl, ${s.sacks} sck, ${s.dInt} INT`);
  if (s.fgA || s.xpA) parts.push(`FG ${s.fgM}/${s.fgA} (lng ${s.fgLng}), XP ${s.xpM}/${s.xpA}`);
  if (s.punts) parts.push(`${s.punts} punts, ${(s.puntYds / s.punts).toFixed(1)} avg`);
  if (s.krYds) parts.push(`${s.krYds} ret yds`);
  void p;
  return parts.join(' | ') || 'No stats';
}

function keyRatings(pos: Pos): RatingKey[] {
  const w = OVR_WEIGHTS[pos];
  const keys = (Object.keys(w) as RatingKey[]).sort((a, b) => (w[b] ?? 0) - (w[a] ?? 0));
  const extra: RatingKey[] = ['spd', 'acc', 'str', 'awr'];
  return [...new Set([...keys, ...extra])];
}

export function PlayerModal({ p, onClose, mode = 'own' }: { p: Player; onClose: () => void; mode?: 'own' | 'view' | 'prospect' }) {
  const app = useApp();
  const c = app.career!;
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const team = p.teamId >= 0 ? c.teams[p.teamId] : undefined;
  const own = mode === 'own' && p.teamId === c.userTeam;
  const known = mode !== 'prospect' || !!p.scouted;
  const demand = own ? contractDemand(c, p, c.userTeam) : null;
  const career = useMemo(() => {
    const keys: (keyof StatLine)[] = ['gp', 'pYds', 'pTd', 'rYds', 'rTd', 'rec', 'recYds', 'recTd', 'tkl', 'sacks', 'dInt', 'fgM'];
    const o: Partial<Record<keyof StatLine, number>> = {};
    for (const k of keys) o[k] = careerTotal(p, k);
    return o;
  }, [p]);
  return (
    <Modal onClose={onClose}>
      <div className="row">
        <Face player={p} team={team} size={64} />
        <div className="grow">
          <div className="pixel" style={{ fontSize: 11 }}>{fullName(p)}</div>
          <div className="small">
            #{p.num} {p.pos} - Age {p.age} - {team ? team.abbr : p.teamId === -3 ? 'Prospect' : 'Free agent'} {p.rookie && <span className="badge rookie">ROOKIE</span>}
          </div>
          <div className="small muted">{p.college}{p.draft ? ` - Drafted ${p.draft.year} R${p.draft.round} #${p.draft.pick}` : ''}</div>
          {p.injury && <div className="small red">{p.injury.desc} - out {p.injury.weeks} wk</div>}
        </div>
        <div className="col" style={{ alignItems: 'flex-end' }}>
          <Ovr v={known ? p.ovr : '??'} />
          <span className="tiny">POT {known ? potGrade(p.pot) : '?'}</span>
        </div>
      </div>
      <div className="grid2" style={{ marginTop: 10 }}>
        <div>
          <h3>Ratings</h3>
          {keyRatings(p.pos).slice(0, 9).map((k) => (
            <div key={k} className="spread small" style={{ gap: 6 }}>
              <span style={{ width: 82 }}>{RATING_LABELS[k]}</span>
              <div className="grow"><Bar v={known ? p.r[k] : 50} color={known ? undefined : '#555'} /></div>
              <span style={{ width: 24, textAlign: 'right' }}>{known ? p.r[k] : '?'}</span>
            </div>
          ))}
        </div>
        <div>
          <h3>Status</h3>
          <div className="spread small"><span>Morale</span><span>{Math.round(p.morale)}</span></div>
          <Bar v={p.morale} max={100} color="#ff9d4d" />
          <div className="spread small"><span>Condition</span><span>{Math.round(p.cond)}%</span></div>
          <Bar v={p.cond} max={100} color="#8fe3ff" />
          <div className="spread small" style={{ marginTop: 6 }}><span>Contract</span><span>{money(p.contract.salary)} x {Math.max(0, p.contract.years)} yr</span></div>
          <div className="spread small"><span>Development XP</span><span>{p.xp.toFixed(1)}</span></div>
          {p.awards.length > 0 && <div className="small gold" style={{ marginTop: 6 }}>{p.awards.join(', ')}</div>}
        </div>
      </div>
      <h3 style={{ marginTop: 10 }}>This season</h3>
      <div className="small">{statSummary(p, p.season)}</div>
      {p.history.length > 0 && (
        <>
          <h3 style={{ marginTop: 8 }}>Career</h3>
          <div className="small">{career.gp} games - {statSummary(p, { ...p.season, ...career } as StatLine)}</div>
          <div className="tablewrap" style={{ marginTop: 4 }}>
            <table className="t">
              <thead>
                <tr><th>Year</th><th>Team</th><th>OVR</th><th>Stats</th></tr>
              </thead>
              <tbody>
                {[...p.history].reverse().slice(0, 8).map((h) => (
                  <tr key={h.year}>
                    <td>{h.year}</td>
                    <td>{c.teams[h.teamId]?.abbr ?? '-'}</td>
                    <td>{h.ovr}</td>
                    <td className="tiny">{statSummary(p, h.stats)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {own && (
        <div className="row wrap" style={{ marginTop: 12 }}>
          <Btn
            size="small"
            disabled={c.cc < 2 || p.ovr >= p.pot}
            onClick={async () => {
              const err = trainPlayer(c, p.id);
              setMsg(err ?? `${p.last} improved through extra coaching.`);
              await app.persist();
              app.refresh();
            }}
          >
            Private Coaching (2 CC)
          </Btn>
          {p.contract.years === 1 && demand && c.phase !== 'offseason' && (
            <Btn
              size="small"
              kind="green"
              disabled={!willResign(c, p) || capSpace(c, c.userTeam) < demand.salary - p.contract.salary}
              onClick={async () => {
                p.contract = { salary: demand.salary, years: demand.years + 1 };
                p.morale = Math.min(100, p.morale + 8);
                setMsg(`${p.last} signed an extension: ${demand.years} more years at ${money(demand.salary)}.`);
                await app.persist();
                app.refresh();
              }}
            >
              Extend ({demand.years}y {money(demand.salary)})
            </Btn>
          )}
          <Btn size="small" kind="red" onClick={() => setConfirmRelease(true)}>Release</Btn>
        </div>
      )}
      {own && p.contract.years === 1 && !willResign(c, p) && <div className="small red">He is unhappy and refuses to discuss an extension.</div>}
      {msg && <div className="small gold" style={{ marginTop: 6 }}>{msg}</div>}
      {confirmRelease && (
        <div className="panel dark" style={{ marginTop: 10 }}>
          <div>Release {fullName(p)}? Half of his {money(p.contract.salary)} salary stays on the cap this season as dead money.</div>
          <div className="row" style={{ marginTop: 6 }}>
            <Btn
              kind="red"
              size="small"
              onClick={async () => {
                if (c.teams[c.userTeam].roster.length <= MIN_ROSTER) {
                  setMsg(`You need at least ${MIN_ROSTER} players.`);
                  setConfirmRelease(false);
                  return;
                }
                releasePlayer(c, p);
                await app.persist();
                app.refresh();
                onClose();
              }}
            >
              Release
            </Btn>
            <Btn kind="blue" size="small" onClick={() => setConfirmRelease(false)}>Cancel</Btn>
          </div>
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <Btn kind="blue" onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}

export function PlayerTable({ players, onPick, showTeam, c, sortable = true, extra }: { players: Player[]; onPick: (p: Player) => void; showTeam?: boolean; c: Career; sortable?: boolean; extra?: (p: Player) => React.ReactNode }) {
  const [sort, setSort] = useState<'pos' | 'ovr' | 'age' | 'sal' | 'pot'>('pos');
  const order = [...players].sort((a, b) => {
    if (sort === 'ovr') return b.ovr - a.ovr;
    if (sort === 'age') return a.age - b.age;
    if (sort === 'sal') return b.contract.salary - a.contract.salary;
    if (sort === 'pot') return b.pot - a.pot;
    return POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || b.ovr - a.ovr;
  });
  const th = (k: typeof sort, label: string, cls = '') => (
    <th className={cls} onClick={() => sortable && setSort(k)} style={{ cursor: sortable ? 'pointer' : undefined, color: sort === k ? 'var(--gold)' : undefined }}>
      {label}
    </th>
  );
  return (
    <div className="tablewrap">
      <table className="t">
        <thead>
          <tr>
            {th('pos', 'POS')}
            <th>NAME</th>
            {showTeam && <th>TM</th>}
            {th('age', 'AGE', 'num')}
            {th('ovr', 'OVR', 'num')}
            {th('pot', 'POT', 'num')}
            <th className="num">MOR</th>
            {th('sal', 'CONTRACT', 'num')}
            {extra && <th />}
          </tr>
        </thead>
        <tbody>
          {order.map((p) => (
            <tr key={p.id} className="click" onClick={() => onPick(p)}>
              <td>{p.pos}</td>
              <td>
                {p.first[0]}. {p.last} {p.injury && <span className="badge inj">{p.injury.desc === 'Suspended' ? 'SUS' : `INJ ${p.injury.weeks}`}</span>} {p.rookie && <span className="badge rookie">R</span>}
              </td>
              {showTeam && <td>{c.teams[p.teamId]?.abbr ?? 'FA'}</td>}
              <td className="num">{p.age}</td>
              <td className="num"><Ovr v={p.ovr} /></td>
              <td className="num"><PotBadge p={p} /></td>
              <td className="num" style={{ color: p.morale > 70 ? 'var(--green)' : p.morale < 40 ? 'var(--red)' : undefined }}>{Math.round(p.morale)}</td>
              <td className="num">{money(p.contract.salary)}/{Math.max(0, p.contract.years)}y</td>
              {extra && <td onClick={(e) => e.stopPropagation()}>{extra(p)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RosterScreen() {
  const app = useApp();
  const c = app.career!;
  const [filter, setFilter] = useState<'ALL' | Pos>('ALL');
  const [sel, setSel] = useState<Player | null>(null);
  const players = teamPlayers(c, c.userTeam).filter((p) => filter === 'ALL' || p.pos === filter);
  const u = unitRatings(c, c.userTeam);
  const pay = payroll(c, c.userTeam);
  return (
    <div className="screen">
      <TopBar title="ROSTER" right={<Btn size="small" kind="blue" onClick={() => app.go('depth')}>Depth Chart</Btn>} />
      <Panel>
        <div className="row wrap small" style={{ gap: 14 }}>
          <span>Players <b>{c.teams[c.userTeam].roster.length}</b>/40</span>
          <span>Payroll <b>{money(pay)}</b> / {money(SALARY_CAP)}</span>
          <span>Cap space <b className={capSpace(c, c.userTeam) < 0 ? 'red' : 'green'}>{money(capSpace(c, c.userTeam))}</b></span>
          {c.teams[c.userTeam].deadCap > 0 && <span>Dead cap {money(c.teams[c.userTeam].deadCap)}</span>}
        </div>
        <div className="row wrap small" style={{ gap: 10, marginTop: 6 }}>
          {(['qb', 'rb', 'wr', 'te', 'ol', 'dl', 'lb', 'db', 'k'] as const).map((k) => (
            <span key={k}>{k.toUpperCase()} <Ovr v={Math.round(u[k])} /></span>
          ))}
        </div>
      </Panel>
      <div className="tabs">
        {POS_FILTER.map((f) => (
          <button key={f} className={`tab ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      <Panel dark>
        <PlayerTable players={players} onPick={setSel} c={c} />
      </Panel>
      {sel && <PlayerModal p={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

export function DepthScreen() {
  const app = useApp();
  const c = app.career!;
  const t = c.teams[c.userTeam];
  const [pos, setPos] = useState<Pos>('QB');
  const [sel, setSel] = useState<Player | null>(null);
  const pm = playerMap(c);
  const ids = t.depth[pos] ?? [];
  const move = (i: number, d: number) => {
    const arr = [...ids];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    t.depth[pos] = arr;
    app.refresh();
    app.persist();
  };
  return (
    <div className="screen">
      <TopBar
        title="DEPTH CHART"
        right={
          <Btn size="small" kind="blue" onClick={() => { autoDepth(c, t, false); app.refresh(); app.persist(); app.toast('Depth chart sorted by overall'); }}>
            Auto Sort
          </Btn>
        }
      />
      <Tabs tabs={POSITIONS.map((p) => ({ id: p, label: p }))} value={pos} onChange={setPos} />
      <Panel title={`${pos} - ${STARTERS[pos]} STARTER${STARTERS[pos] > 1 ? 'S' : ''}`}>
        {ids.length === 0 && <Empty>No players at this position. Sign a free agent.</Empty>}
        {ids.map((id, i) => {
          const p = pm.get(id);
          if (!p) return null;
          return (
            <div key={id} className="spread" style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
              <span className={i < STARTERS[pos] ? 'gold pixel' : 'muted pixel'} style={{ fontSize: 9, width: 34 }}>{i < STARTERS[pos] ? 'ST' : `#${i + 1}`}</span>
              <span className="grow" onClick={() => setSel(p)} style={{ cursor: 'pointer' }}>
                {fullName(p)} {p.injury && <span className="badge inj">INJ</span>}
              </span>
              <Ovr v={p.ovr} />
              <Btn size="small" kind="blue" disabled={i === 0} onClick={() => move(i, -1)}>▲</Btn>
              <Btn size="small" kind="blue" disabled={i === ids.length - 1} onClick={() => move(i, 1)}>▼</Btn>
            </div>
          );
        })}
        <div className="muted small" style={{ marginTop: 8 }}>Injured starters are skipped automatically on game day. Backups at other positions fill in if a group runs out.</div>
      </Panel>
      {sel && <PlayerModal p={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

export function TeamScreen({ teamId }: { teamId: number }) {
  const app = useApp();
  const c = app.career!;
  const t = c.teams[teamId];
  const [sel, setSel] = useState<Player | null>(null);
  const u = unitRatings(c, teamId);
  const canTrade = teamId !== c.userTeam && (c.phase === 'offseason' || (c.phase === 'regular' && c.week <= TRADE_DEADLINE_WEEK));
  return (
    <div className="screen">
      <TopBar title={teamName(t).toUpperCase()} right={canTrade ? <Btn size="small" onClick={() => app.go('trades', { partner: teamId })}>Propose Trade</Btn> : undefined} />
      <Panel>
        <div className="row">
          <TeamBadge team={t} size={50} />
          <div className="grow">
            <div>{recordText(t)} - {t.stadium}{t.dome ? ' (dome)' : ''}</div>
            <div className="small muted">Prestige {t.prestige} - Titles {t.titles.length ? t.titles.join(', ') : 'none'}</div>
          </div>
          <div className="col" style={{ alignItems: 'flex-end' }}>
            <Ovr v={u.ovr} />
            <span className="tiny muted">OFF {u.off} DEF {u.def}</span>
          </div>
        </div>
        {t.history.length > 0 && (
          <div className="small muted" style={{ marginTop: 6 }}>
            History: {t.history.slice(-6).map((h) => `${h.year} ${h.w}-${h.l}${h.result ? ' ' + h.result : ''}`).join(' | ')}
          </div>
        )}
      </Panel>
      <Panel dark>
        <PlayerTable players={teamPlayers(c, teamId)} onPick={setSel} c={c} />
      </Panel>
      {sel && <PlayerModal p={sel} onClose={() => setSel(null)} mode="view" />}
    </div>
  );
}
