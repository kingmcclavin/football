import { useMemo, useState } from 'react';
import { Btn, Ovr, Panel, TeamBadge, TopBar, useApp } from './common';
import { createCareer, teamName, type Career } from '../league/career';
import { getNextPlayerId, setNextPlayerId } from '../league/players';
import { unitRatings } from '../league/depth';
import type { ScheduledGame } from '../core/types';

// A throwaway league used only for exhibition games: nothing here touches a saved career.
let league: Career | null = null;
let gameSeq = 0;

export function exhibitionLeague(): Career {
  if (!league) {
    // creating a league resets the global player id counter; keep the loaded career's ids safe
    const keep = getNextPlayerId();
    league = createCareer({ coachName: 'Exhibition', teamId: 0, difficulty: 'pro', slot: -1, seed: 20261016 });
    setNextPlayerId(keep);
  }
  return league;
}

/** Point the exhibition league at a fresh one-off game between two teams. */
export function makeExhibition(teamId: number, oppId: number, home: boolean): { c: Career; game: ScheduledGame } {
  const c = exhibitionLeague();
  c.userTeam = teamId;
  const game: ScheduledGame = { id: 900000 + ++gameSeq, week: 1, home: home ? teamId : oppId, away: home ? oppId : teamId, played: false, hs: 0, as: 0, ot: false };
  return { c, game };
}

let lastPick = { team: 0, opp: 1, home: true };

export function ExhibitionScreen({ result }: { result?: string }) {
  const app = useApp();
  const c = useMemo(exhibitionLeague, []);
  const n = c.teams.length;
  const [team, setTeam] = useState(lastPick.team);
  const [opp, setOpp] = useState(lastPick.opp);
  const [home, setHome] = useState(lastPick.home);
  const step = (v: number, d: number, avoid: number) => {
    let x = (v + d + n) % n;
    if (x === avoid) x = (x + d + n) % n;
    return x;
  };
  const shuffle = () => {
    const a = Math.floor(Math.random() * n);
    setTeam(a);
    setOpp((a + 1 + Math.floor(Math.random() * (n - 1))) % n);
  };
  const play = () => {
    lastPick = { team, opp, home };
    app.go('game', { exhibition: makeExhibition(team, opp, home) });
  };
  const Picker = ({ label, id, set, avoid }: { label: string; id: number; set: (v: number) => void; avoid: number }) => {
    const t = c.teams[id];
    const u = unitRatings(c, id);
    return (
      <Panel>
        <div className="cyan tiny">{label}</div>
        <div className="row" style={{ gap: 8 }}>
          <button className="tab" onClick={() => set(step(id, -1, avoid))}>◀</button>
          <TeamBadge team={t} size={40} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="pixel" style={{ fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamName(t)}</div>
            <div className="tiny muted">OFF {u.off} - DEF {u.def}</div>
          </div>
          <Ovr v={u.ovr} />
          <button className="tab" onClick={() => set(step(id, 1, avoid))}>▶</button>
        </div>
      </Panel>
    );
  };
  return (
    <div className="screen">
      <TopBar title="EXHIBITION" />
      {result && <div className="gold small center">Final: {result}</div>}
      <div className="fill land-cols" style={{ justifyContent: 'center', gap: 8 }}>
        <div className="col grow" style={{ gap: 8, justifyContent: 'center' }}>
          <Picker label="YOUR TEAM" id={team} set={setTeam} avoid={opp} />
          <Picker label="OPPONENT" id={opp} set={setOpp} avoid={team} />
        </div>
        <div className="col grow" style={{ gap: 8, justifyContent: 'center' }}>
          <div className="row" style={{ gap: 4 }}>
            <button className={`tab ${home ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => setHome(true)}>Home</button>
            <button className={`tab ${!home ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => setHome(false)}>Away</button>
            <button className="tab" style={{ flex: 1 }} onClick={shuffle}>Shuffle</button>
          </div>
          <div className="muted tiny center">Quick game for practice. Nothing is saved and your career is untouched. Quarter length and controls come from Settings.</div>
          <Btn kind="green" size="big" wide onClick={play}>Kick Off!</Btn>
        </div>
      </div>
    </div>
  );
}
