import { useMemo, useState } from 'react';
import { Paged, PagedTable } from './paged';
import { Btn, Face, Modal, Ovr, Panel, Tabs, TeamBadge, TopBar, useApp, money, Bar, PotBadge, Empty } from './common';
import { POSITIONS, RATING_LABELS, type Player, type Pos, type RatingKey, type StatLine } from '../core/types';
import { capSpace, payroll, playerMap, teamName, teamPlayers, TRADE_DEADLINE_WEEK, type Career } from '../league/career';
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
  const [tab, setTab] = useState<'ratings' | 'info' | 'stats'>('ratings');
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
      <div className="col" style={{ gap: 6, height: 'min(600px, calc(100dvh - 40px))' }}>
        <div className="row">
          <Face player={p} team={team} size={44} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="pixel" style={{ fontSize: 10 }}>{fullName(p)}</div>
            <div className="small">
              #{p.num} {p.pos} - Age {p.age} - {team ? team.abbr : p.teamId === -3 ? 'Prospect' : 'Free agent'} {p.rookie && <span className="badge rookie">R</span>}
            </div>
            {p.injury && <div className="tiny red">{p.injury.desc} - out {p.injury.weeks} wk</div>}
          </div>
          <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
            <Ovr v={known ? p.ovr : '??'} />
            <span className="tiny">POT {known ? potGrade(p.pot) : '?'}</span>
          </div>
        </div>
        <Tabs tabs={[{ id: 'ratings', label: 'Ratings' }, { id: 'info', label: 'Info' }, { id: 'stats', label: 'Stats' }]} value={tab} onChange={setTab} />
        <div className="fill" style={{ overflow: 'hidden' }}>
          {tab === 'ratings' && (
            <div className="col" style={{ gap: 2 }}>
              {keyRatings(p.pos).slice(0, 9).map((k) => (
                <div key={k} className="spread small" style={{ gap: 6 }}>
                  <span style={{ width: 78 }}>{RATING_LABELS[k]}</span>
                  <div className="grow"><Bar v={known ? p.r[k] : 50} color={known ? undefined : '#555'} /></div>
                  <span style={{ width: 22, textAlign: 'right' }}>{known ? p.r[k] : '?'}</span>
                </div>
              ))}
            </div>
          )}
          {tab === 'info' && (
            <div className="col" style={{ gap: 3 }}>
              <div className="spread small"><span>Morale</span><span>{Math.round(p.morale)}</span></div>
              <Bar v={p.morale} max={100} color="#ff9d4d" />
              <div className="spread small"><span>Condition</span><span>{Math.round(p.cond)}%</span></div>
              <Bar v={p.cond} max={100} color="#8fe3ff" />
              <div className="spread small"><span>Contract</span><span>{money(p.contract.salary)} x {Math.max(0, p.contract.years)} yr</span></div>
              <div className="spread small"><span>Development XP</span><span>{p.xp.toFixed(1)}</span></div>
              <div className="spread small"><span>College</span><span>{p.college}</span></div>
              {p.draft && <div className="spread small"><span>Drafted</span><span>{p.draft.year} R{p.draft.round} #{p.draft.pick}</span></div>}
              {p.awards.length > 0 && <div className="small gold">{p.awards.join(', ')}</div>}
            </div>
          )}
          {tab === 'stats' && (
            <div className="col" style={{ gap: 4 }}>
              <div className="small"><b>{c.year}:</b> {statSummary(p, p.season)}</div>
              {p.history.length > 0 && <div className="small"><b>Career ({career.gp} g):</b> {statSummary(p, { ...p.season, ...career } as StatLine)}</div>}
              <Paged
                resetKey={p.id}
                items={[...p.history].reverse().map((h) => (
                  <div key={h.year} className="tiny" style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', padding: '2px 0' }}>
                    <b>{h.year}</b> {c.teams[h.teamId]?.abbr ?? '-'} ({h.ovr}) {statSummary(p, h.stats)}
                  </div>
                ))}
              />
            </div>
          )}
        </div>
        {msg && <div className="small gold">{msg}</div>}
        {confirmRelease ? (
          <div className="panel dark">
            <div className="small">Release {fullName(p)}? Half of his {money(p.contract.salary)} salary stays on the cap as dead money.</div>
            <div className="row" style={{ marginTop: 4 }}>
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
        ) : (
          <div className="row wrap" style={{ gap: 5 }}>
            {own && (
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
                Coach (2 CC)
              </Btn>
            )}
            {own && p.contract.years === 1 && demand && c.phase !== 'offseason' && (
              <Btn
                size="small"
                kind="green"
                disabled={!willResign(c, p) || capSpace(c, c.userTeam) < demand.salary - p.contract.salary}
                onClick={async () => {
                  p.contract = { salary: demand.salary, years: demand.years + 1 };
                  p.morale = Math.min(100, p.morale + 8);
                  setMsg(`${p.last} extended: ${demand.years} more years at ${money(demand.salary)}.`);
                  await app.persist();
                  app.refresh();
                }}
              >
                Extend {demand.years}y {money(demand.salary)}
              </Btn>
            )}
            {own && <Btn size="small" kind="red" onClick={() => setConfirmRelease(true)}>Release</Btn>}
            <span className="grow" />
            <Btn size="small" kind="blue" onClick={onClose}>Close</Btn>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function PlayerTable({ players, onPick, showTeam, c, sortable = true, extra, resetKey, noContract }: { players: Player[]; onPick: (p: Player) => void; showTeam?: boolean; c: Career; sortable?: boolean; extra?: (p: Player) => React.ReactNode; resetKey?: unknown; noContract?: boolean }) {
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
    <PagedTable
      rows={order}
      rowKey={(p) => p.id}
      resetKey={`${String(resetKey)}|${sort}`}
      head={
        <tr>
          {th('pos', 'POS')}
          <th>NAME</th>
          {showTeam && <th>TM</th>}
          {th('age', 'AGE', 'num')}
          {th('ovr', 'OVR', 'num')}
          {th('pot', 'POT', 'num')}
          <th className="num wide-only">MOR</th>
          {!noContract && th('sal', '$M/YR', 'num')}
          {extra && <th />}
        </tr>
      }
      row={(p) => (
        <tr key={p.id} className="click" onClick={() => onPick(p)}>
          <td>{p.pos}</td>
          <td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.first[0]}. {p.last} {p.injury && <span className="badge inj">{p.injury.desc === 'Suspended' ? 'S' : p.injury.weeks}</span>}
          </td>
          {showTeam && <td>{c.teams[p.teamId]?.abbr ?? 'FA'}</td>}
          <td className="num">{p.age}</td>
          <td className="num"><Ovr v={p.ovr} /></td>
          <td className="num"><PotBadge p={p} /></td>
          <td className="num wide-only" style={{ color: p.morale > 70 ? 'var(--green)' : p.morale < 40 ? 'var(--red)' : undefined }}>{Math.round(p.morale)}</td>
          {!noContract && <td className="num">{p.contract.salary.toFixed(1)}/{Math.max(0, p.contract.years)}</td>}
          {extra && <td onClick={(e) => e.stopPropagation()}>{extra(p)}</td>}
        </tr>
      )}
    />
  );
}

export function PosFilter({ value, onChange }: { value: 'ALL' | Pos; onChange: (v: 'ALL' | Pos) => void }) {
  return (
    <div className="row" style={{ gap: 3 }}>
      {POS_FILTER.map((f) => (
        <button key={f} className={`tab ${value === f ? 'on' : ''}`} style={{ flex: 1, padding: '4px 0' }} onClick={() => onChange(f)}>{f === 'ALL' ? 'All' : f}</button>
      ))}
    </div>
  );
}

export function RosterScreen() {
  const app = useApp();
  const c = app.career!;
  const [filter, setFilter] = useState<'ALL' | Pos>('ALL');
  const [sel, setSel] = useState<Player | null>(null);
  const players = teamPlayers(c, c.userTeam).filter((p) => filter === 'ALL' || p.pos === filter);
  const pay = payroll(c, c.userTeam);
  return (
    <div className="screen">
      <TopBar title="ROSTER" right={<Btn size="small" kind="blue" onClick={() => app.go('depth')}>Depth</Btn>} />
      <div className="row small" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span><b>{c.teams[c.userTeam].roster.length}</b>/40 players</span>
        <span>Payroll <b>{money(pay)}</b></span>
        <span>Space <b className={capSpace(c, c.userTeam) < 0 ? 'red' : 'green'}>{money(capSpace(c, c.userTeam))}</b></span>
      </div>
      <PosFilter value={filter} onChange={setFilter} />
      <Panel dark className="fill">
        <PlayerTable players={players} onPick={setSel} c={c} resetKey={filter} />
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
            Auto
          </Btn>
        }
      />
      <div className="row" style={{ gap: 3 }}>
        {POSITIONS.map((p) => (
          <button key={p} className={`tab ${pos === p ? 'on' : ''}`} style={{ flex: 1, padding: '4px 0' }} onClick={() => setPos(p)}>{p}</button>
        ))}
      </div>
      <Panel title={`${pos} - ${STARTERS[pos]} STARTER${STARTERS[pos] > 1 ? 'S' : ''}`} className="fill">
        {ids.length === 0 ? (
          <Empty>No players at this position. Sign a free agent.</Empty>
        ) : (
          <Paged
            resetKey={pos}
            items={ids.map((id, i) => {
              const p = pm.get(id);
              if (!p) return null;
              return (
                <div key={id} className="spread" style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                  <span className={i < STARTERS[pos] ? 'gold pixel' : 'muted pixel'} style={{ fontSize: 8, width: 28 }}>{i < STARTERS[pos] ? 'ST' : `#${i + 1}`}</span>
                  <span className="grow small" onClick={() => setSel(p)} style={{ cursor: 'pointer' }}>
                    {fullName(p)} {p.injury && <span className="badge inj">INJ</span>}
                  </span>
                  <Ovr v={p.ovr} />
                  <Btn size="small" kind="blue" disabled={i === 0} onClick={() => move(i, -1)}>▲</Btn>
                  <Btn size="small" kind="blue" disabled={i === ids.length - 1} onClick={() => move(i, 1)}>▼</Btn>
                </div>
              );
            })}
          />
        )}
      </Panel>
      <div className="muted tiny">Injured starters are skipped on game day; backups from other positions fill gaps.</div>
      {sel && <PlayerModal p={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

export function TeamScreen({ teamId }: { teamId: number }) {
  const app = useApp();
  const c = app.career!;
  const t = c.teams[teamId];
  const [sel, setSel] = useState<Player | null>(null);
  const [filter, setFilter] = useState<'ALL' | Pos>('ALL');
  const u = unitRatings(c, teamId);
  const canTrade = teamId !== c.userTeam && (c.phase === 'offseason' || (c.phase === 'regular' && c.week <= TRADE_DEADLINE_WEEK));
  return (
    <div className="screen">
      <TopBar title={t.abbr} right={canTrade ? <Btn size="small" onClick={() => app.go('trades', { partner: teamId })}>Trade</Btn> : undefined} />
      <div className="row">
        <TeamBadge team={t} size={34} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="small">{teamName(t)} - {recordText(t)}</div>
          <div className="tiny muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Prestige {t.prestige} - Titles {t.titles.length ? t.titles.join(', ') : 'none'}{t.history.length ? ' - ' + t.history.slice(-3).map((h) => `${h.year} ${h.w}-${h.l}`).join(', ') : ''}
          </div>
        </div>
        <Ovr v={u.ovr} />
      </div>
      <PosFilter value={filter} onChange={setFilter} />
      <Panel dark className="fill">
        <PlayerTable players={teamPlayers(c, teamId).filter((p) => filter === 'ALL' || p.pos === filter)} onPick={setSel} c={c} resetKey={filter} />
      </Panel>
      {sel && <PlayerModal p={sel} onClose={() => setSel(null)} mode="view" />}
    </div>
  );
}
