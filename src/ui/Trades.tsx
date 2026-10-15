import { useState } from 'react';
import { Btn, Panel, TopBar, useApp, Ovr, money, Empty } from './common';
import { teamPlayers, TRADE_DEADLINE_WEEK, capSpace } from '../league/career';
import type { DraftPick, Player } from '../core/types';
import { evaluateTrade, executeTrade, pickValue, type TradeOffer } from '../league/transactions';
import { playerValue } from '../league/players';
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
  const plist = (ps: Player[], chosen: number[], set: (v: number[]) => void) => (
    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
      {ps.map((p) => (
        <div key={p.id} className="spread small" style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.12)', background: chosen.includes(p.id) ? 'rgba(255,210,63,0.2)' : undefined }}>
          <input type="checkbox" checked={chosen.includes(p.id)} onChange={() => toggle(chosen, set, p.id)} style={{ width: 22, height: 22 }} />
          <span className="grow" onClick={() => setSel(p)} style={{ cursor: 'pointer' }}>{p.pos} {p.first[0]}. {p.last} <span className="muted">({p.age})</span></span>
          <Ovr v={p.ovr} />
          <span className="tiny muted" style={{ width: 70, textAlign: 'right' }}>{money(p.contract.salary)}/{p.contract.years}y</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="screen">
      <TopBar title="TRADE CENTER" />
      {!open ? (
        <Panel><Empty>The trade deadline (week {TRADE_DEADLINE_WEEK}) has passed. Trades reopen in the offseason.</Empty></Panel>
      ) : (
        <>
          <Panel>
            <div className="row wrap">
              <span className="pixel" style={{ fontSize: 9 }}>Partner</span>
              <select value={pid} onChange={(e) => { setPid(Number(e.target.value)); reset(); setResult(null); }}>
                {others.map((t) => <option key={t.id} value={t.id}>{t.city} {t.name} ({capSpace(c, t.id).toFixed(1)}M space)</option>)}
              </select>
            </div>
          </Panel>
          <div className="grid2">
            <Panel title="YOU SEND">
              {plist(mine, give, setGive)}
              <h3 style={{ marginTop: 6 }}>Draft picks</h3>
              <div className="row wrap">{myPicks.map((p, i) => <button key={i} className={`tab ${givePk.includes(p) ? 'on' : ''}`} onClick={() => togglePk(givePk, setGivePk, p)}>{pickLabel(p)}</button>)}</div>
            </Panel>
            <Panel title="YOU RECEIVE">
              {plist(theirs, get, setGet)}
              <h3 style={{ marginTop: 6 }}>Draft picks</h3>
              <div className="row wrap">{theirPicks.map((p, i) => <button key={i} className={`tab ${getPk.includes(p) ? 'on' : ''}`} onClick={() => togglePk(getPk, setGetPk, p)}>{pickLabel(p)}</button>)}</div>
            </Panel>
          </div>
          <Panel title="PROPOSAL">
            <div className="spread small">
              <span>Value you send: <b>{ev.giveV.toFixed(0)}</b></span>
              <span>Value you get: <b>{ev.getV.toFixed(0)}</b></span>
            </div>
            <div className={`small ${ev.ok ? 'green' : 'muted'}`} style={{ margin: '6px 0' }}>{ev.ok ? 'They are ready to accept.' : ev.reason}</div>
            <div className="row wrap">
              <Btn
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
                Propose Trade
              </Btn>
              <Btn kind="blue" onClick={reset}>Clear</Btn>
            </div>
            {result && <div className="gold" style={{ marginTop: 6 }}>{result}</div>}
            <div className="muted tiny" style={{ marginTop: 6 }}>
              Teams value youth, potential and premium positions (QB, pass rush, WR, coverage). Picks from bad teams are worth more. Value guide: {mine[0] ? `${mine[0].last} = ${playerValue(mine[0]).toFixed(0)}` : ''}{myPicks[0] ? `, your ${pickLabel(myPicks[0])} = ${pickValue(c, myPicks[0]).toFixed(0)}` : ''}.
            </div>
          </Panel>
        </>
      )}
      {sel && <PlayerModal p={sel} onClose={() => setSel(null)} mode="view" />}
    </div>
  );
}
