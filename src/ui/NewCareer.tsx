import { useMemo, useState } from 'react';
import { Btn, Panel, TeamBadge, TopBar, useApp, Ovr, Tabs } from './common';
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

  const teams = draft.teams.filter((t) => String(t.conf) === conf);
  return (
    <div className="screen">
      <TopBar title="NEW CAREER" />
      <Panel title="HEAD COACH">
        <div className="row wrap">
          <label className="pixel" style={{ fontSize: 9 }}>Name</label>
          <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="pixel" style={{ fontSize: 9, marginBottom: 6 }}>Difficulty</div>
          <div className="row wrap">
            {DIFFS.map((d) => (
              <button key={d.id} className={`tab ${diff === d.id ? 'on' : ''}`} onClick={() => setDiff(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <div className="muted small" style={{ marginTop: 4 }}>{DIFFS.find((d) => d.id === diff)!.desc}</div>
        </div>
      </Panel>
      <Panel title="CHOOSE YOUR TEAM">
        <div className="spread" style={{ marginBottom: 6 }}>
          <Tabs tabs={[{ id: '0', label: CONFERENCES[0] }, { id: '1', label: CONFERENCES[1] }]} value={conf} onChange={setConf} />
          <Btn kind="blue" size="small" onClick={() => { setSeed(randomSeed()); setPick(null); }}>New League</Btn>
        </div>
        <div className="muted small" style={{ marginBottom: 8 }}>Weaker teams are harder to win with but the owner expects less. Each new league reshuffles every roster.</div>
        {DIVISIONS.map((dname, d) => (
          <div key={d} style={{ marginBottom: 8 }}>
            <h3>{dname}</h3>
            <div className="grid2">
              {teams.filter((t) => t.div === d).map((t) => {
                const r = ratings[t.id];
                return (
                  <button key={t.id} className={`playcard ${pick === t.id ? 'sel' : ''}`} onClick={() => setPick(t.id)} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <TeamBadge team={t} size={40} />
                    <div className="grow">
                      <div className="pixel" style={{ fontSize: 9 }}>{t.city}</div>
                      <div>{t.name}</div>
                    </div>
                    <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Ovr v={r.ovr} />
                      <span className="tiny muted">OFF {r.off} DEF {r.def}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Panel>
      <div style={{ position: 'sticky', bottom: 0, paddingBottom: 'var(--safe-bottom)' }}>
        <Btn size="big" kind="green" wide disabled={pick === null} onClick={start}>
          {pick === null ? 'Select a team' : `Take the ${draft.teams[pick].name} job`}
        </Btn>
      </div>
    </div>
  );
}
