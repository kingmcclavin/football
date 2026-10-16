import { Btn, Panel, TeamBadge, TopBar, useApp, Ovr } from './common';
import { gameWeather, userGameThisWeek, ROUND_NAME } from '../league/season';
import { unitRatings } from '../league/depth';
import { teamPlayers, type Career } from '../league/career';
import { recordText, divisionStandings } from '../league/standings';
import { fullName } from '../league/players';
import { BoxScoreView } from './Schedule';
import { clearLive } from '../save/storage';
import type { Team } from '../core/types';

function form(c: Career, teamId: number) {
  const games = c.schedule.filter((g) => g.played && (g.home === teamId || g.away === teamId)).slice(-4);
  return games.map((g) => {
    const my = g.home === teamId ? g.hs : g.as;
    const th = g.home === teamId ? g.as : g.hs;
    return my > th ? 'W' : my < th ? 'L' : 'T';
  });
}

function TeamCol({ c, t }: { c: Career; t: Team }) {
  const u = unitRatings(c, t.id);
  const ps = teamPlayers(c, t.id);
  const key = [...ps].filter((p) => !p.injury).sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  const inj = ps.filter((p) => p.injury);
  return (
    <div className="col" style={{ alignItems: 'center', flex: 1 }}>
      <TeamBadge team={t} size={40} />
      <div className="pixel center" style={{ fontSize: 8 }}>{t.city} {t.name}</div>
      <div className="small">{recordText(t)} <span className="muted">Form {form(c, t.id).join('') || '-'}</span></div>
      <div className="row" style={{ gap: 4 }}><Ovr v={u.ovr} /><span className="tiny">OFF {u.off} DEF {u.def}</span></div>
      <div className="small" style={{ alignSelf: 'stretch' }}>
        {key.map((p) => <div key={p.id} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.pos} {fullName(p)} <span className="muted">({p.ovr})</span></div>)}
        {inj.length > 0 && <div className="red tiny" style={{ marginTop: 3 }}>Out: {inj.map((p) => `${p.pos} ${p.last}`).join(', ')}</div>}
      </div>
    </div>
  );
}

export function PreGame() {
  const app = useApp();
  const c = app.career!;
  const g = userGameThisWeek(c);
  if (!g) {
    return (
      <div className="screen">
        <TopBar title="PRE-GAME" />
        <div className="muted">No game scheduled.</div>
      </div>
    );
  }
  const H = c.teams[g.home];
  const A = c.teams[g.away];
  const w = gameWeather(c, g);
  return (
    <div className="screen">
      <TopBar title={g.playoff ? ROUND_NAME[g.playoff].toUpperCase() : `WEEK ${g.week}`} />
      <Panel className="fill">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <TeamCol c={c} t={A} />
          <div className="pixel gold" style={{ fontSize: 14, marginTop: 14 }}>@</div>
          <TeamCol c={c} t={H} />
        </div>
      </Panel>
      <div className="small center">
        {H.stadium} - <b>{w.toUpperCase()}</b> - {w === 'rain' ? 'wet ball, more drops' : w === 'snow' ? 'slow footing' : w === 'wind' ? 'kicks drift' : 'ideal conditions'} - {app.settings.quarterMinutes}-min quarters
      </div>
      <Btn
        kind="green"
        size="big"
        wide
        onClick={async () => {
          await clearLive(c.slot);
          app.replace('game');
        }}
      >
        Kick Off!
      </Btn>
    </div>
  );
}

export function PostGame({ gameId }: { gameId: number }) {
  const app = useApp();
  const c = app.career!;
  const box = c.boxes.find((b) => b.gameId === gameId);
  const t = c.teams[c.userTeam];
  const won = box ? (box.home === c.userTeam ? box.hs > box.as : box.as > box.hs) : false;
  const tie = box ? box.hs === box.as : false;
  return (
    <div className="screen">
      <TopBar title={tie ? 'FINAL - TIE' : won ? 'VICTORY!' : 'DEFEAT'} noBack right={<Btn kind="green" size="small" onClick={() => app.reset({ name: 'hub' })}>Continue</Btn>} />
      <div className="small center">Record <b className="gold">{recordText(t)}</b> - Division #{divisionStandings(c, t.conf, t.div).indexOf(t.id) + 1}</div>
      {box ? <BoxScoreView c={c} box={box} /> : <div className="muted">Box score unavailable.</div>}
    </div>
  );
}
