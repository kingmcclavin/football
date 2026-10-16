import { useEffect, useState } from 'react';
import { Paged } from './paged';
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
import { DIVISIONS } from '../data/teams';
import { REG_WEEKS } from '../league/schedule';

const TRAINING: { id: TrainingFocus; label: string; short: string; desc: string }[] = [
  { id: 'balanced', label: 'Balanced', short: 'Bal', desc: 'Normal practice. Everyone develops.' },
  { id: 'offense', label: 'Offense', short: 'Off', desc: 'Offensive players develop faster.' },
  { id: 'defense', label: 'Defense', short: 'Def', desc: 'Defensive players develop faster.' },
  { id: 'conditioning', label: 'Conditioning', short: 'Cond', desc: 'Better recovery, 25% fewer injuries, less development.' },
  { id: 'rest', label: 'Rest', short: 'Rest', desc: 'Big condition recovery and morale, almost no development.' },
];

const welcomed = new Set<number>();

export function Hub({ welcome }: { welcome?: boolean }) {
  const app = useApp();
  const c = app.career!;
  const [eventMsg, setEventMsg] = useState<string | null>(null);
  const [showNews, setShowNews] = useState(false);
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

  const tiles: [string, () => void][] = [
    ['Roster', () => app.go('roster')],
    ['Depth', () => app.go('depth')],
    ['League', () => app.go('league')],
    ['Schedule', () => app.go('schedule')],
    ['Stats', () => app.go('stats')],
    ['Records', () => app.go('records')],
    ['Office', () => app.go('office')],
    ['Trades', () => app.go('trades')],
    ['Free Agents', () => app.go('freeagents')],
    ['Awards', () => app.go('achievements')],
    ['Settings', () => app.go('settings')],
    ['Help', () => app.go('help')],
  ];
  return (
    <div className="screen">
      <div className="land-cols fill" style={{ gap: 6 }}>
        <div className="col" style={{ gap: 6 }}>
          <Panel>
            <div className="row">
              <TeamBadge team={t} size={40} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="pixel" style={{ fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamName(t)}</div>
                <div className="small">
                  {c.year} {weekLabel} - <span className="gold">{recordText(t)}</span> - {divRank}
                  {['st', 'nd', 'rd', 'th'][Math.min(3, divRank - 1)]} {DIVISIONS[t.div]}
                </div>
              </div>
              <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
                <Ovr v={u.ovr} />
                <span className="tiny muted">{u.off}/{u.def}</span>
              </div>
            </div>
            <div className="grid3" style={{ marginTop: 6, gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              <div>
                <div className="tiny muted">JOB</div>
                <Bar v={c.coach.security} max={100} color={c.coach.security > 50 ? '#5fd35b' : c.coach.security > 25 ? '#ffd23f' : '#ff5f5f'} />
              </div>
              <div>
                <div className="tiny muted">FANS</div>
                <Bar v={c.fans} max={100} color="#8fe3ff" />
              </div>
              <div>
                <div className="tiny muted">MORALE</div>
                <Bar v={morale} max={100} color="#ff9d4d" />
              </div>
            </div>
            <div className="row small" style={{ marginTop: 4, gap: 10, flexWrap: 'wrap' }}>
              <span><b className="gold">{money(c.cash)}</b></span>
              <span><b className="gold">{c.cc} CC</b></span>
              <span>Target <b>{c.expected.toFixed(0)}W</b></span>
            </div>
          </Panel>
          <Panel title={c.phase === 'playoffs' ? 'PLAYOFFS' : 'NEXT GAME'}>
            {game && opp ? (
              <div className="col" style={{ gap: 4 }}>
                <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
                  <TeamBadge team={c.teams[game.away]} size={32} />
                  <div className="center">
                    <div className="pixel" style={{ fontSize: 9 }}>{c.teams[game.away].abbr} <span className="gold">@</span> {c.teams[game.home].abbr}</div>
                    <div className="tiny muted">{recordText(c.teams[game.away])} / {recordText(c.teams[game.home])} - {gameWeather(c, game).toUpperCase()}</div>
                  </div>
                  <TeamBadge team={c.teams[game.home]} size={32} />
                </div>
                {game.playoff && <div className="tiny gold center">{ROUND_NAME[game.playoff]}</div>}
                <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
                  {hasLive && <Btn kind="green" onClick={() => app.go('game', { resume: true })}>Resume</Btn>}
                  <Btn kind={hasLive ? 'blue' : 'green'} disabled={simming} onClick={() => app.go('pregame')}>{hasLive ? 'Restart' : 'Play'}</Btn>
                  <Btn kind="blue" disabled={simming} onClick={simUserGame}>{simming ? '...' : 'Sim'}</Btn>
                </div>
                {injured.length > 0 && <div className="tiny red center" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Out: {injured.map((p) => `${p.pos} ${p.last}`).join(', ')}</div>}
              </div>
            ) : (
              <div className="center col" style={{ gap: 4 }}>
                <div className="muted small">{eliminated ? 'Your season is over.' : 'No game this week.'}</div>
                <Btn kind="green" disabled={simming} onClick={advanceNoGame}>{simming ? 'Simulating...' : eliminated ? 'Sim Next Round' : 'Advance Week'}</Btn>
              </div>
            )}
          </Panel>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <Panel title="PRACTICE">
            <div className="row" style={{ gap: 4 }}>
              {TRAINING.map((tr) => (
                <button key={tr.id} className={`tab ${c.training === tr.id ? 'on' : ''}`} style={{ flex: 1, padding: '4px 2px' }} onClick={() => { c.training = tr.id; app.refresh(); app.persist(); }}>
                  {tr.short}
                </button>
              ))}
            </div>
            <div className="muted tiny" style={{ marginTop: 3 }}>{TRAINING.find((x) => x.id === c.training)!.desc}</div>
          </Panel>
          <button className="panel dark" style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }} onClick={() => setShowNews(true)}>
            <div className="small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span className="pixel gold" style={{ fontSize: 8 }}>NEWS ▸ </span>{c.news[0]?.text ?? 'No news yet.'}
            </div>
          </button>
          <div className="tile-grid">
            {tiles.map(([label, fn]) => (
              <Btn key={label} kind="blue" onClick={fn}>{label}</Btn>
            ))}
          </div>
          <Btn kind="ghost" wide onClick={async () => { await app.persist(false); app.reset({ name: 'title' }); }}>Save & Exit</Btn>
        </div>
      </div>

      {showNews && (
        <Modal onClose={() => setShowNews(false)}>
          <div className="spread"><h2>NEWS</h2><Btn size="small" kind="blue" onClick={() => setShowNews(false)}>Close</Btn></div>
          <div style={{ height: '60vh', display: 'flex' }}>
            <Paged items={c.news.map((n, i) => <div key={i} className="small" style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}><span className="muted tiny">{n.year} W{n.week}</span> {n.text}</div>)} />
          </div>
        </Modal>
      )}
      {c.event && (
        <Modal>
          <h2>{c.event.title}</h2>
          <p className="small">{c.event.text}</p>
          <div className="col">
            {c.event.choices.map((ch, i) => (
              <div key={i}>
                <Btn wide kind={i === 0 ? 'gold' : 'blue'} onClick={async () => { setEventMsg(resolveEvent(c, i)); await app.persist(); app.refresh(); }}>{ch.label}</Btn>
                <div className="muted tiny" style={{ margin: '2px 0 4px' }}>{ch.effect}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {showWelcome && !c.event && (
        <Modal onClose={() => setShowWelcome(false)}>
          <h2>WELCOME, COACH {c.coach.name.toUpperCase()}</h2>
          <p className="small">You've taken over the {teamName(t)}. The owner expects about <b className="gold">{c.expected.toFixed(0)} wins</b> this season.</p>
          <p className="small">Each week: set practice, check injuries and the depth chart, then play or sim the game. Win to earn coaching credits, grow your fan base and keep your job.</p>
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
  const [showNews, setShowNews] = useState(false);
  const steps: Record<string, string> = { review: 'Season Review', resign: 'Re-sign Players', draft: 'Draft', freeagency: 'Free Agency', preseason: 'Preseason' };
  const tiles: [string, () => void][] = [
    ['Roster', () => app.go('roster')],
    ['League', () => app.go('league')],
    ['Stats', () => app.go('stats')],
    ['Records', () => app.go('records')],
    ['Office', () => app.go('office')],
    ['Trades', () => app.go('trades')],
    ['Awards', () => app.go('achievements')],
    ['Settings', () => app.go('settings')],
  ];
  return (
    <div className="screen">
      <div className="land-cols fill" style={{ gap: 6 }}>
        <div className="col" style={{ gap: 6 }}>
          <Panel>
            <div className="row">
              <TeamBadge team={t} size={40} />
              <div className="grow">
                <div className="pixel" style={{ fontSize: 10 }}>{teamName(t)}</div>
                <div className="small">{c.year} Offseason - {steps[c.offStep]}</div>
                <div className="muted tiny">{c.cc} CC - {money(c.cash)}</div>
              </div>
            </div>
          </Panel>
          <Btn size="big" kind="green" wide onClick={() => app.go('offseason')}>Continue: {steps[c.offStep]}</Btn>
          <button className="panel dark" style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }} onClick={() => setShowNews(true)}>
            <div className="small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span className="pixel gold" style={{ fontSize: 8 }}>NEWS ▸ </span>{c.news[0]?.text ?? ''}
            </div>
          </button>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div className="tile-grid">
            {tiles.map(([label, fn]) => <Btn key={label} kind="blue" onClick={fn}>{label}</Btn>)}
          </div>
          <Btn kind="ghost" wide onClick={async () => { await app.persist(false); app.reset({ name: 'title' }); }}>Save & Exit</Btn>
        </div>
      </div>
      {showNews && (
        <Modal onClose={() => setShowNews(false)}>
          <div className="spread"><h2>NEWS</h2><Btn size="small" kind="blue" onClick={() => setShowNews(false)}>Close</Btn></div>
          <div style={{ height: '60vh', display: 'flex' }}>
            <Paged items={c.news.map((n, i) => <div key={i} className="small" style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}><span className="muted tiny">{n.year}</span> {n.text}</div>)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
