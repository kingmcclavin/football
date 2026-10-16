import { useMemo, useState } from 'react';
import { Btn, TeamBadge, TopBar, useApp, Ovr } from './common';
import { createCareer, teamName, type Career } from '../league/career';
import { unitRatings } from '../league/depth';
import { expectedWins } from '../league/frontoffice';
import { randomSeed, clamp } from '../core/rng';
import { CONFERENCES, DIVISIONS } from '../data/teams';
import type { Difficulty } from '../core/types';

const DIFFS: { id: Difficulty; label: string; desc: string }[] = [
  { id: 'rookie', label: 'Rookie', desc: 'Forgiving defenses, easier kicks and trades.' },
  { id: 'pro', label: 'Pro', desc: 'Balanced. The intended experience.' },
  { id: 'allpro', label: 'All-Pro', desc: 'Smarter, faster opponents.' },
  { id: 'legend', label: 'Legend', desc: 'Elite AI, tight windows, tough negotiations.' },
];

export function NewCareer({ slot }: { slot: number }) {
  const app = useApp();
  const [name, setName] = useState(['Sam', 'Pat', 'Jordan', 'Alex', 'Casey'][Math.floor(Math.random() * 5)] + ' ' + ['Rivers', 'Hayes', 'Brooks', 'Carter', 'Lane'][Math.floor(Math.random() * 5)]);
  const [diff, setDiff] = useState<Difficulty>('pro');
  const [seed, setSeed] = useState(randomSeed);
  const [conf, setConf] = useState<'0' | '1'>('0');
  const [pick, setPick] = useState<number | null>(null);
  const [div, setDiv] = useState(0);
  const draft = useMemo<Career>(() => createCareer({ coachName: name, teamId: 0, difficulty: diff, slot, seed }), [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const ratings = useMemo(() => draft.teams.map((t) => unitRatings(draft, t.id)), [draft]);

  const start = async () => {
    if (pick === null) return;
    const c = draft;
    c.coach.name = name.trim() || 'Coach';
    c.difficulty = diff;
    c.slot = slot;
    c.userTeam = pick;
    const t = c.teams[pick];
    c.facilities = { stadium: 1 + (t.prestige > 60 ? 1 : 0), training: 1, rehab: 1 };
    c.fans = Math.round(clamp(35 + t.prestige * 0.4, 30, 80));
    c.news = [{ year: c.year, week: 0, text: `${c.coach.name} hired as head coach of the ${teamName(t)}.` }];
    c.expected = expectedWins(c);
    c.news.unshift({ year: c.year, week: 0, text: `The owner expects about ${c.expected.toFixed(0)} wins this season.` });
    app.setCareer(c);
    await app.persist();
    app.reset({ name: 'hub', params: { welcome: true } });
  };

  const teams = draft.teams.filter((t) => String(t.conf) === conf && t.div === div);
  return (
    <div className="screen">
      <TopBar title="NEW CAREER" />
      <div className="row" style={{ gap: 6 }}>
        <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 0, padding: '4px 6px' }} aria-label="Coach name" />
        <select value={diff} onChange={(e) => setDiff(e.target.value as Difficulty)} aria-label="Difficulty" style={{ padding: '4px 6px' }}>
          {DIFFS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      <div className="muted tiny">{DIFFS.find((d) => d.id === diff)!.desc}</div>
      <div className="row" style={{ gap: 4 }}>
        {[0, 1].map((cf) => (
          <button key={cf} className={`tab ${conf === String(cf) ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => setConf(String(cf) as '0' | '1')}>{CONFERENCES[cf].split(' ')[0]}</button>
        ))}
        <button className="tab" onClick={() => { setSeed(randomSeed()); setPick(null); }}>New League</button>
      </div>
      <div className="row" style={{ gap: 4 }}>
        {DIVISIONS.map((d, i) => (
          <button key={d} className={`tab ${div === i ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => setDiv(i)}>{d}</button>
        ))}
      </div>
      <div className="fill" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: '1fr', gap: 6 }}>
        {teams.map((t) => {
          const r = ratings[t.id];
          return (
            <button key={t.id} className={`playcard ${pick === t.id ? 'sel' : ''}`} onClick={() => setPick(t.id)} style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 0 }}>
              <TeamBadge team={t} size={34} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="pixel" style={{ fontSize: 8 }}>{t.city}</div>
                <div className="small">{t.name}</div>
                <div className="tiny muted">OFF {r.off} DEF {r.def}</div>
              </div>
              <Ovr v={r.ovr} />
            </button>
          );
        })}
      </div>
      <Btn size="big" kind="green" wide disabled={pick === null} onClick={start}>
        {pick === null ? 'Select a team' : `Take the ${draft.teams[pick].name} job`}
      </Btn>
    </div>
  );
}
