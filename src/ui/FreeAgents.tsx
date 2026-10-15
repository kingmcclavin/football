import { useState } from 'react';
import { Btn, Panel, TopBar, useApp, money, Empty } from './common';
import { POSITIONS, type Player, type Pos } from '../core/types';
import { capSpace } from '../league/career';
import { contractDemand, faInterest, signPlayer } from '../league/transactions';
import { PlayerModal, PlayerTable } from './Roster';
import { careerRng, saveRng } from '../league/career';

export function FreeAgentsScreen() {
  const app = useApp();
  const c = app.career!;
  const [filter, setFilter] = useState<'ALL' | Pos>('ALL');
  const [sel, setSel] = useState<Player | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fas = c.players.filter((p) => p.teamId === -1 && (filter === 'ALL' || p.pos === filter)).sort((a, b) => b.ovr - a.ovr).slice(0, 120);
  const sign = async (p: Player) => {
    const d = contractDemand(c, p, c.userTeam);
    const interest = faInterest(c, p, c.userTeam);
    const rng = careerRng(c);
    const willing = p.ovr < 72 || rng.chance(interest / 100 + 0.25);
    saveRng(c, rng);
    if (!willing) {
      p.morale = Math.max(0, p.morale - 5);
      setMsg(`${p.last} chose to keep his options open (interest ${Math.round(interest)}%). Try again later or improve your team's prestige.`);
      return;
    }
    const err = signPlayer(c, p, c.userTeam, d);
    setMsg(err ?? `Signed ${p.first} ${p.last}: ${d.years} yrs at ${money(d.salary)}.`);
    await app.persist();
    app.refresh();
  };
  return (
    <div className="screen">
      <TopBar title="FREE AGENTS" right={<span className="small">Cap space <b className="gold">{money(capSpace(c, c.userTeam))}</b> - Roster {c.teams[c.userTeam].roster.length}/40</span>} />
      <div className="tabs">
        {(['ALL', ...POSITIONS] as ('ALL' | Pos)[]).map((f) => (
          <button key={f} className={`tab ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      {msg && <Panel dark><div className="gold small">{msg}</div></Panel>}
      <Panel dark>
        {fas.length === 0 ? <Empty>No free agents at this position.</Empty> : (
          <PlayerTable
            players={fas}
            c={c}
            onPick={setSel}
            extra={(p) => {
              const d = contractDemand(c, p, c.userTeam);
              return <Btn size="small" kind="green" disabled={capSpace(c, c.userTeam) < d.salary} onClick={() => sign(p)}>{money(d.salary)}x{d.years}</Btn>;
            }}
          />
        )}
      </Panel>
      <div className="muted small">Asking prices shown per season. Stars may turn down rebuilding teams; winning, fan support and your reputation raise their interest.</div>
      {sel && <PlayerModal p={sel} onClose={() => setSel(null)} mode="view" />}
    </div>
  );
}
