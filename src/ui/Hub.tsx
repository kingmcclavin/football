import { useEffect, useState } from 'react';
import { Btn, Modal, Panel, TeamBadge, useApp, Bar, money, Ovr } from './common';
import { teamName, playerMap, type TrainingFocus } from '../league/career';
import { recordText, divisionStandings } from '../league/standings';
import { completeWeekAfterUserGame, eliminatedFromPlayoffs, finishWeek, gameWeather, simWeekGames, userGameThisWeek, ROUND_NAME, applyGameResult } from '../league/season';
import { recordWeekFinances, teamMorale } from '../league/frontoffice';
import { resolveEvent } from '../league/events';
import { unitRatings } from '../league/depth';
import { loadLive, clearLive } from '../save/storage';
import { simulateGame } from '../league/quicksim';
import { difficultyBoost, quarterLengthSetting } from '../league/season';
import { careerRng, saveRng } from '../league/career';
import { DIVISIONS, CONFERENCES } from '../data/teams';
import { REG_WEEKS } from '../league/schedule';

const TRAINING: { id: TrainingFocus; label: string; desc: string }[] = [
  { id: 'balanced', label: 'Balanced', desc: 'Normal practice. Everyone develops.' },
  { id: 'offense', label: 'Offense', desc: 'Offensive players develop faster.' },
  { id: 'defense', label: 'Defense', desc: 'Defensive players develop faster.' },
  { id: 'conditioning', label: 'Conditioning', desc: 'Better recovery, 25% fewer injuries, less development.' },
  { id: 'rest', label: 'Rest', desc: 'Big condition recovery and morale, almost no development.' },
];

const welcomed = new Set<number>();

export function Hub({ welcome }: { welcome?: boolean }) {
  const app = useApp();
  const c = app.career!;
  const [eventMsg, setEventMsg] = useState<string | null>(null);
  const [showWelcome, setShowWelcomeState] = useState(!!welcome && !welcomed.has(c.created));
  const setShowWelcome = (v: boolean) => {
    if (!v) welcomed.add(c.created);
    setShowWelcomeState(v);
  };
  const [hasLive, setHasLive] = useState(false);
  const [simming, setSimming] = useState(false);
  useEffect(() => {
    loadLive<{ gameId: number }>(c.slot).then((s) => {
      const g = userGameThisWeek(c);
      setHasLive(!!s && !!g && s.gameId === g.id);
    });
  }, [c, app.version]);

  if (c.phase === 'offseason') {
    return <OffseasonHub />;
  }
  const t = c.teams[c.userTeam];
  const game = userGameThisWeek(c);
  const opp = game ? c.teams[game.home === c.userTeam ? game.away : game.home] : null;
  const u = unitRatings(c, c.userTeam);
  const pm = playerMap(c);
  const injured = t.roster.map((id) => pm.get(id)!).filter((p) => p && p.injury);
  const morale = teamMorale(c);
  const divRank = divisionStandings(c, t.conf, t.div).indexOf(t.id) + 1;
  const eliminated = c.phase === 'playoffs' && eliminatedFromPlayoffs(c, c.userTeam);
  const weekLabel = c.phase === 'playoffs' ? ROUND_NAME[{ 17: 'WC', 18: 'DIV', 19: 'CONF', 20: 'FINAL' }[c.week] ?? 'WC'] : `Week ${c.week} of ${REG_WEEKS}`;

  const simUserGame = async () => {
    if (!game) return;
    setSimming(true);
    const rng = careerRng(c);
    const boost = difficultyBoost(c);
    const box = simulateGame(c, game.home, game.away, game.id, rng, {
      week: game.week, weather: gameWeather(c, game), quarterLength: quarterLengthSetting(), playoff: game.playoff,
      homeBoost: game.away === c.userTeam ? boost : 0, awayBoost: game.home === c.userTeam ? boost : 0,
    });
    box.userPlayed = false;
    saveRng(c, rng);
    applyGameResult(c, game, box, rng);
    recordWeekFinances(c, game.home === c.userTeam);
    const gid = game.id;
    completeWeekAfterUserGame(c);
    await clearLive(c.slot);
    await app.persist();
    setSimming(false);
    app.go('postgame', { gameId: gid });
  };

  const advanceNoGame = async () => {
    setSimming(true);
    simWeekGames(c, true);
    recordWeekFinances(c, false);
    finishWeek(c);
    await app.persist();
    setSimming(false);
    app.refresh();
  };

  return (
    <div className="screen">
      <Panel>
        <div className="row">
          <TeamBadge team={t} size={54} />
          <div className="grow">
            <div className="pixel" style={{ fontSize: 12 }}>{teamName(t)}</div>
            <div className="small">
              {c.year} - {weekLabel} - <span className="gold">{recordText(t)}</span> ({divRank}
              {['st', 'nd', 'rd', 'th'][Math.min(3, divRank - 1)]} {CONFERENCES[t.conf].split(' ')[0]} {DIVISIONS[t.div]})
            </div>
            <div className="muted small">Head Coach {c.coach.name}</div>
          </div>
          <div className="col" style={{ alignItems: 'flex-end' }}>
            <Ovr v={u.ovr} />
            <span className="tiny muted">OFF {u.off} / DEF {u.def}</span>
          </div>
        </div>
        <div className="grid3" style={{ marginTop: 10 }}>
          <div>
            <div className="tiny muted">JOB SECURITY</div>
            <Bar v={c.coach.security} max={100} color={c.coach.security > 50 ? '#5fd35b' : c.coach.security > 25 ? '#ffd23f' : '#ff5f5f'} />
          </div>
          <div>
            <div className="tiny muted">FAN SUPPORT</div>
            <Bar v={c.fans} max={100} color="#8fe3ff" />
          </div>
          <div>
            <div className="tiny muted">TEAM MORALE</div>
            <Bar v={morale} max={100} color="#ff9d4d" />
          </div>
        </div>
        <div className="row wrap small" style={{ marginTop: 8, gap: 14 }}>
          <span>Cash <b className="gold">{money(c.cash)}</b></span>
          <span>Coaching credits <b className="gold">{c.cc} CC</b></span>
          <span>Owner target <b>{c.expected.toFixed(0)} wins</b></span>
        </div>
      </Panel>

      <Panel title={c.phase === 'playoffs' ? 'PLAYOFFS' : 'NEXT GAME'}>
        {game && opp ? (
          <div>
            <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
              <div className="col center" style={{ alignItems: 'center' }}>
                <TeamBadge team={c.teams[game.away]} size={48} />
                <div className="pixel" style={{ fontSize: 9 }}>{c.teams[game.away].abbr}</div>
                <div className="tiny muted">{recordText(c.teams[game.away])}</div>
              </div>
              <div className="pixel gold" style={{ fontSize: 14 }}>@</div>
              <div className="col center" style={{ alignItems: 'center' }}>
                <TeamBadge team={c.teams[game.home]} size={48} />
                <div className="pixel" style={{ fontSize: 9 }}>{c.teams[game.home].abbr}</div>
                <div className="tiny muted">{recordText(c.teams[game.home])}</div>
              </div>
            </div>
            <div className="center small muted" style={{ margin: '6px 0' }}>
              {game.playoff ? ROUND_NAME[game.playoff] + ' - ' : ''}
              {game.home === c.userTeam ? 'Home' : 'Away'} at {c.teams[game.home].stadium} - {gameWeather(c, game).toUpperCase()}
            </div>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              {hasLive && <Btn kind="green" size="big" onClick={() => app.go('game', { resume: true })}>Resume Game</Btn>}
              <Btn kind={hasLive ? 'blue' : 'green'} size="big" disabled={simming} onClick={() => app.go('pregame')}>{hasLive ? 'Restart' : 'Play Game'}</Btn>
              <Btn kind="blue" disabled={simming} onClick={simUserGame}>{simming ? 'Simulating...' : 'Sim Game'}</Btn>
            </div>
            {injured.length > 0 && <div className="small red center" style={{ marginTop: 6 }}>Injured: {injured.map((p) => `${p.pos} ${p.last} (${p.injury!.weeks}w)`).join(', ')}</div>}
          </div>
        ) : (
          <div className="center">
            <div className="muted" style={{ marginBottom: 8 }}>
              {eliminated ? 'Your season is over. The playoffs continue without you.' : 'No game for your team this week.'}
            </div>
            <Btn kind="green" disabled={simming} onClick={advanceNoGame}>{simming ? 'Simulating...' : eliminated ? 'Sim Next Round' : 'Advance Week'}</Btn>
          </div>
        )}
      </Panel>

      <div className="grid2">
        <Panel title="WEEKLY PRACTICE">
          <div className="row wrap">
            {TRAINING.map((tr) => (
              <button key={tr.id} className={`tab ${c.training === tr.id ? 'on' : ''}`} onClick={() => { c.training = tr.id; app.refresh(); app.persist(); }}>
                {tr.label}
              </button>
            ))}
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>{TRAINING.find((x) => x.id === c.training)!.desc}</div>
        </Panel>
        <Panel title="NEWS">
          <div className="news">
            {c.news.slice(0, 30).map((n, i) => (
              <div key={i}>
                <span className="muted tiny">{n.year} W{n.week}</span> {n.text}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="menu-grid">
        <Btn kind="blue" onClick={() => app.go('roster')}>Roster</Btn>
        <Btn kind="blue" onClick={() => app.go('depth')}>Depth Chart</Btn>
        <Btn kind="blue" onClick={() => app.go('league')}>League</Btn>
        <Btn kind="blue" onClick={() => app.go('schedule')}>Schedule</Btn>
        <Btn kind="blue" onClick={() => app.go('stats')}>Stats</Btn>
        <Btn kind="blue" onClick={() => app.go('records')}>Records</Btn>
        <Btn kind="blue" onClick={() => app.go('office')}>Front Office</Btn>
        <Btn kind="blue" onClick={() => app.go('trades')}>Trades</Btn>
        <Btn kind="blue" onClick={() => app.go('freeagents')}>Free Agents</Btn>
        <Btn kind="blue" onClick={() => app.go('achievements')}>Achievements</Btn>
        <Btn kind="blue" onClick={() => app.go('settings')}>Settings</Btn>
        <Btn kind="blue" onClick={() => app.go('help')}>Help</Btn>
        <Btn kind="ghost" onClick={async () => { await app.persist(false); app.reset({ name: 'title' }); }}>Save & Exit</Btn>
      </div>

      {c.event && (
        <Modal>
          <h2>{c.event.title}</h2>
          <p>{c.event.text}</p>
          <div className="col">
            {c.event.choices.map((ch, i) => (
              <div key={i}>
                <Btn wide kind={i === 0 ? 'gold' : 'blue'} onClick={async () => { setEventMsg(resolveEvent(c, i)); await app.persist(); app.refresh(); }}>{ch.label}</Btn>
                <div className="muted small" style={{ margin: '3px 0 6px' }}>{ch.effect}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {showWelcome && !c.event && (
        <Modal onClose={() => setShowWelcome(false)}>
          <h2>WELCOME, COACH {c.coach.name.toUpperCase()}</h2>
          <p>You've taken over the {teamName(t)}. The owner expects about <b className="gold">{c.expected.toFixed(0)} wins</b> this season.</p>
          <p className="small">Each week: set the practice focus, check injuries and the depth chart, then play (or sim) the game. Win to earn coaching credits, grow your fan base and keep your job. In the offseason you'll re-sign players, draft rookies and chase free agents.</p>
          <p className="small muted">The Help screen explains the controls and every system. Good luck!</p>
          <Btn kind="green" onClick={() => setShowWelcome(false)}>Let's go</Btn>
        </Modal>
      )}
      {eventMsg && (
        <Modal onClose={() => setEventMsg(null)}>
          <p>{eventMsg}</p>
          <Btn onClick={() => setEventMsg(null)}>OK</Btn>
        </Modal>
      )}
    </div>
  );
}

function OffseasonHub() {
  const app = useApp();
  const c = app.career!;
  const t = c.teams[c.userTeam];
  const steps: Record<string, string> = { review: 'Season Review', resign: 'Re-sign Players', draft: 'Draft', freeagency: 'Free Agency', preseason: 'Preseason' };
  return (
    <div className="screen">
      <Panel>
        <div className="row">
          <TeamBadge team={t} size={54} />
          <div className="grow">
            <div className="pixel" style={{ fontSize: 12 }}>{teamName(t)}</div>
            <div className="small">{c.year} Offseason - {steps[c.offStep]}</div>
            <div className="muted small">Head Coach {c.coach.name} - {c.cc} CC - {money(c.cash)}</div>
          </div>
        </div>
      </Panel>
      <Btn size="big" kind="green" wide onClick={() => app.go('offseason')}>Continue: {steps[c.offStep]}</Btn>
      <div className="menu-grid" style={{ marginTop: 10 }}>
        <Btn kind="blue" onClick={() => app.go('roster')}>Roster</Btn>
        <Btn kind="blue" onClick={() => app.go('league')}>League</Btn>
        <Btn kind="blue" onClick={() => app.go('stats')}>Stats</Btn>
        <Btn kind="blue" onClick={() => app.go('records')}>Records</Btn>
        <Btn kind="blue" onClick={() => app.go('office')}>Front Office</Btn>
        <Btn kind="blue" onClick={() => app.go('trades')}>Trades</Btn>
        <Btn kind="blue" onClick={() => app.go('achievements')}>Achievements</Btn>
        <Btn kind="blue" onClick={() => app.go('settings')}>Settings</Btn>
        <Btn kind="ghost" onClick={async () => { await app.persist(false); app.reset({ name: 'title' }); }}>Save & Exit</Btn>
      </div>
      <Panel title="NEWS">
        <div className="news">
          {c.news.slice(0, 40).map((n, i) => (
            <div key={i}>
              <span className="muted tiny">{n.year}</span> {n.text}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
