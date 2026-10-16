import { useState } from 'react';
import { Btn, Panel, TopBar, useApp, Ovr, money, Empty, Tabs } from './common';
import { Paged } from './paged';
import { teamPlayers, TRADE_DEADLINE_WEEK, capSpace } from '../league/career';
import type { DraftPick, Player } from '../core/types';
import { evaluateTrade, executeTrade, type TradeOffer } from '../league/transactions';
import { PlayerModal } from './Roster';

export function TradesScreen({ partner }: { partner?: number }) {
  const app = useApp();
  const c = app.career!;
  const others = c.teams.filter((t) => t.id !== c.userTeam);
  const [pid, setPid] = useState<number>(partner ?? others[0].id);
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [givePk, setGivePk] = useState<DraftPick[]>([]);
  const [getPk, setGetPk] = useState<DraftPick[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [sel, setSel] = useState<Player | null>(null);
  const open = c.phase === 'offseason' || (c.phase === 'regular' && c.week <= TRADE_DEADLINE_WEEK);
  const mine = teamPlayers(c, c.userTeam).sort((a, b) => b.ovr - a.ovr);
  const theirs = teamPlayers(c, pid).sort((a, b) => b.ovr - a.ovr);
  const myPicks = c.picks.filter((p) => p.owner === c.userTeam);
  const theirPicks = c.picks.filter((p) => p.owner === pid);
  const offer: TradeOffer = { give, get, givePicks: givePk, getPicks: getPk, partner: pid };
  const ev = evaluateTrade(c, offer);
  const toggle = (arr: number[], set: (v: number[]) => void, id: number) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const togglePk = (arr: DraftPick[], set: (v: DraftPick[]) => void, p: DraftPick) => set(arr.includes(p) ? arr.filter((x) => x !== p) : [...arr, p]);
  const pickLabel = (p: DraftPick) => `${p.year} R${p.round} (${c.teams[p.origTeam].abbr})`;
  const reset = () => {
    setGive([]);
    setGet([]);
    setGivePk([]);
    setGetPk([]);
  };
  const [side, setSide] = useState<'send' | 'get' | 'picks'>('send');
  const plist = (ps: Player[], chosen: number[], set: (v: number[]) => void) => (
    <Paged
      resetKey={`${pid}-${side}`}
      items={ps.map((p) => (
        <div key={p.id} className="spread small" style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.12)', background: chosen.includes(p.id) ? 'rgba(255,210,63,0.2)' : undefined }}>
          <input type="checkbox" checked={chosen.includes(p.id)} onChange={() => toggle(chosen, set, p.id)} style={{ width: 20, height: 20, margin: 0 }} />
          <span className="grow" onClick={() => setSel(p)} style={{ cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.pos} {p.first[0]}. {p.last} <span className="muted">({p.age})</span></span>
          <Ovr v={p.ovr} />
          <span className="tiny muted" style={{ width: 58, textAlign: 'right' }}>{money(p.contract.salary)}/{p.contract.years}y</span>
        </div>
      ))}
    />
  );
  const theirAbbr = c.teams[pid].abbr;
  return (
    <div className="screen">
      <TopBar title="TRADES" right={open ? (
        <select value={pid} onChange={(e) => { setPid(Number(e.target.value)); reset(); setResult(null); }} aria-label="Trade partner" style={{ padding: '3px 4px', maxWidth: 170 }}>
          {others.map((t) => <option key={t.id} value={t.id}>{t.abbr} ({capSpace(c, t.id).toFixed(0)}M)</option>)}
        </select>
      ) : undefined} />
      {!open ? (
        <Panel><Empty>The trade deadline (week {TRADE_DEADLINE_WEEK}) has passed. Trades reopen in the offseason.</Empty></Panel>
      ) : (
        <>
          <Tabs tabs={[{ id: 'send', label: `Send (${give.length})` }, { id: 'get', label: `Get from ${theirAbbr} (${get.length})` }, { id: 'picks', label: `Picks (${givePk.length + getPk.length})` }]} value={side} onChange={setSide} />
          <Panel dark className="fill">
            {side === 'send' && plist(mine, give, setGive)}
            {side === 'get' && plist(theirs, get, setGet)}
            {side === 'picks' && (
              <div className="col" style={{ gap: 4 }}>
                <h3>Your picks</h3>
                <div className="row wrap" style={{ gap: 3 }}>{myPicks.map((p, i) => <button key={i} className={`tab ${givePk.includes(p) ? 'on' : ''}`} onClick={() => togglePk(givePk, setGivePk, p)}>{pickLabel(p)}</button>)}</div>
                <h3>{theirAbbr} picks</h3>
                <div className="row wrap" style={{ gap: 3 }}>{theirPicks.map((p, i) => <button key={i} className={`tab ${getPk.includes(p) ? 'on' : ''}`} onClick={() => togglePk(getPk, setGetPk, p)}>{pickLabel(p)}</button>)}</div>
              </div>
            )}
          </Panel>
          <div className="spread small">
            <span>Send <b>{ev.giveV.toFixed(0)}</b> / Get <b>{ev.getV.toFixed(0)}</b> - <span className={ev.ok ? 'green' : 'muted'}>{result ?? (ev.ok ? 'They accept.' : ev.reason)}</span></span>
            <div className="row" style={{ gap: 4 }}>
              <Btn size="small" kind="blue" onClick={reset}>Clear</Btn>
              <Btn
                size="small"
                kind="green"
                disabled={!ev.ok}
                onClick={async () => {
                  executeTrade(c, offer);
                  setResult('Trade completed!');
                  reset();
                  await app.persist();
                  app.refresh();
                }}
              >
                Propose
              </Btn>
            </div>
          </div>
        </>
      )}
      {sel && <PlayerModal p={sel} onClose={() => setSel(null)} mode="view" />}
    </div>
  );
}
