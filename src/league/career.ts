import { Rng, clamp } from '../core/rng';
import { emptyTeamSeason, type Difficulty, type DraftPick, type Player, type Pos, type ScheduledGame, type StatLine, type Team, type Weather } from '../core/types';
import { TEAM_DEFS } from '../data/teams';
import { COACH_FIRST, LAST_NAMES } from '../data/names';
import { generatePlayer, getNextPlayerId, ROSTER_TEMPLATE, setNextPlayerId } from './players';
import { buildSchedule } from './schedule';
import { autoDepth } from './depth';

export const SAVE_VERSION = 3;
export const SALARY_CAP = 165; // $M
export const TRADE_DEADLINE_WEEK = 10;

export type StaffRole = 'OC' | 'DC' | 'ST';
export const STAFF_LABEL: Record<StaffRole, string> = { OC: 'Offensive Coordinator', DC: 'Defensive Coordinator', ST: 'Strength & Medical' };
export interface Staff {
  id: number;
  name: string;
  role: StaffRole;
  rating: number; // 1..5
  salary: number; // $M
  years: number;
  age: number;
  face: number;
}

export interface Facilities {
  stadium: number;
  training: number;
  rehab: number;
}

export interface Ledger {
  year: number;
  revenue: number;
  expenses: number;
}

export interface TeamGameStats {
  yds: number;
  passYds: number;
  rushYds: number;
  firstDowns: number;
  turnovers: number;
  sacks: number;
  plays: number;
  thirdAtt: number;
  thirdConv: number;
  top: number; // seconds of possession
}
export function emptyTeamGameStats(): TeamGameStats {
  return { yds: 0, passYds: 0, rushYds: 0, firstDowns: 0, turnovers: 0, sacks: 0, plays: 0, thirdAtt: 0, thirdConv: 0, top: 0 };
}

export interface BoxScore {
  gameId: number;
  year: number;
  week: number;
  home: number;
  away: number;
  hs: number;
  as: number;
  ot: boolean;
  quarters: [number[], number[]];
  team: [TeamGameStats, TeamGameStats];
  players: Record<number, { teamId: number; s: Partial<StatLine> }>;
  keyPlays: string[];
  weather: Weather;
  playoff?: string;
  userPlayed: boolean;
}

export interface Strategy {
  off: 'balanced' | 'pass' | 'run';
  def: 'balanced' | 'aggressive' | 'conservative';
}
export type TrainingFocus = 'balanced' | 'offense' | 'defense' | 'conditioning' | 'rest';

export interface RecordEntry {
  value: number;
  name: string;
  team: string;
  year: number;
}
export interface Records {
  season: Record<string, RecordEntry>;
  career: Record<string, RecordEntry>;
  game: Record<string, RecordEntry>;
  team: Record<string, RecordEntry>; // user-team franchise season records
}

export interface SeasonAwards {
  year: number;
  mvp?: number;
  opoy?: number;
  dpoy?: number;
  oroy?: number;
  droy?: number;
  coy?: number; // team id
  names: Record<string, string>; // award -> "Name (TEAM)"
}

export interface PlayoffState {
  seeds: [number[], number[]]; // team ids by seed per conference
  round: number; // 0 WC, 1 DIV, 2 CONF, 3 FINAL, 4 done
  champion?: number;
}

export interface EventChoice {
  label: string;
  effect: string; // shown to the user
}
export interface PendingEvent {
  id: string;
  title: string;
  text: string;
  choices: EventChoice[];
  data: Record<string, number>;
}

export interface Coach {
  name: string;
  reputation: number; // 0..100
  security: number; // 0..100
  seasonsWithTeam: number;
  history: { year: number; teamId: number; w: number; l: number; t: number; result: string }[];
  titles: number;
  fired: boolean;
}

export interface NewsItem {
  year: number;
  week: number;
  text: string;
}

export type OffStep = 'review' | 'resign' | 'draft' | 'freeagency' | 'preseason';

export interface Career {
  version: number;
  slot: number;
  created: number;
  saved: number;
  seed: number;
  rngState: number;
  year: number;
  week: number; // next week to be played (1-based); playoffs use 17..20
  phase: 'regular' | 'playoffs' | 'offseason';
  offStep: OffStep;
  userTeam: number;
  difficulty: Difficulty;
  teams: Team[];
  players: Player[];
  schedule: ScheduledGame[];
  playoffs: PlayoffState | null;
  picks: DraftPick[];
  draftClass: number[];
  draftOrder: { round: number; pick: number; team: number; pid?: number }[];
  draftPos: number;
  staff: Staff[];
  staffPool: Staff[];
  facilities: Facilities;
  cash: number;
  ledger: Ledger[];
  seasonRevenue: number;
  seasonExpenses: number;
  cc: number; // coaching credits
  fans: number; // 0..100
  coach: Coach;
  strategy: Strategy;
  training: TrainingFocus;
  boxes: BoxScore[];
  news: NewsItem[];
  records: Records;
  champions: { year: number; team: number; runnerUp: number; score: string }[];
  awards: SeasonAwards[];
  hof: { name: string; pos: Pos; years: string; team: string; inducted: number; summary: string }[];
  achievements: Record<string, number>;
  event: PendingEvent | null;
  nextGameId: number;
  nextStaffId: number;
  nextPlayerId: number;
  lastPlace: Record<number, number>;
  scoutPoints: number;
  jobOffers: number[];
  gameInProgress: unknown | null;
  weekEvents: number; // events shown this week
  expected: number; // preseason expected wins (owner)
  summary: SeasonSummary | null;
  resignDecisions: Record<number, 'keep' | 'release'>;
}

export interface SeasonSummary {
  year: number;
  record: string;
  playoff: string;
  awards: SeasonAwards;
  evaluation: { expected: number; wins: number; securityChange: number; reputationChange: number; fired: boolean; notes: string[] };
  recordsBroken: string[];
  retirements: string[];
  progression: { name: string; pos: string; from: number; to: number }[];
  finances: { revenue: number; expenses: number };
  champion: number;
}

const SKIN_HAIR = 0;
void SKIN_HAIR;

export function teamName(t: Team) {
  return `${t.city} ${t.name}`;
}

function genStaff(rng: Rng, c: Career | null, role: StaffRole, rating: number, id: number): Staff {
  const name = `${rng.pick(COACH_FIRST)} ${rng.pick(LAST_NAMES)}`;
  return { id, name, role, rating, salary: Math.round((0.8 + rating * rating * 0.45) * 10) / 10, years: rng.int(1, 3), age: rng.int(34, 66), face: rng.int(0, 35) };
  void c;
}

export function generateStaffPool(rng: Rng, c: Career) {
  const pool: Staff[] = [];
  for (const role of ['OC', 'DC', 'ST'] as StaffRole[]) {
    for (let k = 0; k < 4; k++) {
      const rating = clamp(Math.round(rng.range(1, 5.4)), 1, 5);
      pool.push(genStaff(rng, c, role, rating, c.nextStaffId++));
    }
  }
  c.staffPool = pool;
}

/** Team quality profile for the initial league: a spread of contenders and rebuilders. */
function teamQualities(rng: Rng): number[] {
  const q: number[] = [];
  for (let i = 0; i < 32; i++) q.push(rng.range(63, 79));
  return q;
}

const DEPTH_DROP: Record<Pos, number[]> = {
  QB: [0, -14], RB: [0, -8], WR: [2, 0, -4, -9], TE: [0, -9], OL: [0, 0, -1, -2, -3, -9],
  DL: [1, 0, -1, -3, -9], LB: [0, -1, -3, -9], DB: [1, 0, -1, -2, -6, -9], K: [0],
};

export function createCareer(opts: { coachName: string; teamId: number; difficulty: Difficulty; slot: number; seed: number }): Career {
  const rng = new Rng(opts.seed);
  setNextPlayerId(1);
  const used = new Set<string>();
  const teams: Team[] = TEAM_DEFS.map((d, i) => ({
    id: i,
    city: d.city,
    name: d.name,
    abbr: d.abbr,
    conf: Math.floor(i / 16),
    div: Math.floor((i % 16) / 4),
    colors: d.colors,
    emblem: d.emblem,
    stadium: d.stadium,
    dome: d.dome,
    climate: d.climate,
    roster: [],
    depth: {},
    rec: emptyTeamSeason(),
    history: [],
    titles: [],
    prestige: 50,
    deadCap: 0,
    passBias: rng.range(0.42, 0.62),
    aggression: rng.range(0.25, 0.75),
  }));
  const players: Player[] = [];
  const quals = teamQualities(rng);
  teams.forEach((t, i) => {
    const base = quals[i];
    t.prestige = Math.round(clamp((base - 60) * 4 + rng.range(0, 20), 10, 95));
    for (const pos of Object.keys(ROSTER_TEMPLATE) as Pos[]) {
      for (let k = 0; k < ROSTER_TEMPLATE[pos]; k++) {
        const drop = DEPTH_DROP[pos][k] ?? -9;
        const starter = drop > -6;
        const q = clamp(base + drop + rng.normal(0, starter ? 5 : 4), 42, 92);
        const age = starter ? rng.int(23, 32) : rng.int(22, 29);
        const p = generatePlayer(rng, { pos, q, age, teamId: t.id }, used);
        p.contract.years = rng.int(1, 4);
        players.push(p);
        t.roster.push(p.id);
      }
    }
  });
  // keep every team under the cap to start (contenders are close to it)
  for (const t of teams) {
    const ps = t.roster.map((id) => players.find((p) => p.id === id)!);
    const total = ps.reduce((s, p) => s + p.contract.salary, 0);
    const limit = SALARY_CAP * 0.95;
    if (total > limit) for (const p of ps) p.contract.salary = Math.max(0.75, Math.round(p.contract.salary * (limit / total) * 10) / 10);
  }
  // free agent pool
  for (let k = 0; k < 60; k++) {
    const pos = rng.weighted(Object.keys(ROSTER_TEMPLATE) as Pos[], [2, 3, 6, 3, 8, 6, 5, 7, 1]);
    const p = generatePlayer(rng, { pos, q: rng.range(48, 66), age: rng.int(23, 33), teamId: -1 }, used);
    p.contract.years = 1;
    players.push(p);
  }
  const c: Career = {
    version: SAVE_VERSION,
    slot: opts.slot,
    created: Date.now(),
    saved: Date.now(),
    seed: opts.seed,
    rngState: rng.state,
    year: 2026,
    week: 1,
    phase: 'regular',
    offStep: 'review',
    userTeam: opts.teamId,
    difficulty: opts.difficulty,
    teams,
    players,
    schedule: [],
    playoffs: null,
    picks: [],
    draftClass: [],
    draftOrder: [],
    draftPos: 0,
    staff: [],
    staffPool: [],
    facilities: { stadium: 1, training: 1, rehab: 1 },
    cash: 25,
    ledger: [],
    seasonRevenue: 0,
    seasonExpenses: 0,
    cc: 3,
    fans: 50,
    coach: { name: opts.coachName, reputation: 30, security: 65, seasonsWithTeam: 0, history: [], titles: 0, fired: false },
    strategy: { off: 'balanced', def: 'balanced' },
    training: 'balanced',
    boxes: [],
    news: [],
    records: { season: {}, career: {}, game: {}, team: {} },
    champions: [],
    awards: [],
    hof: [],
    achievements: {},
    event: null,
    nextGameId: 1,
    nextStaffId: 1,
    nextPlayerId: 0,
    lastPlace: {},
    scoutPoints: 0,
    jobOffers: [],
    gameInProgress: null,
    weekEvents: 0,
    expected: 8,
    summary: null,
    resignDecisions: {},
  };
  // user's staff
  for (const role of ['OC', 'DC', 'ST'] as StaffRole[]) c.staff.push(genStaff(rng, c, role, rng.int(2, 3), c.nextStaffId++));
  generateStaffPool(rng, c);
  c.facilities = { stadium: 1 + (c.teams[opts.teamId].prestige > 60 ? 1 : 0), training: 1, rehab: 1 };
  c.fans = Math.round(clamp(35 + c.teams[opts.teamId].prestige * 0.4, 30, 80));
  for (const t of teams) autoDepth(c, t);
  c.schedule = buildSchedule(teams, c.year, rng, {}, c.nextGameId);
  c.nextGameId += c.schedule.length;
  // draft picks for the next two drafts
  for (const y of [c.year + 1, c.year + 2]) for (const t of teams) for (let r = 1; r <= 3; r++) c.picks.push({ year: y, round: r, origTeam: t.id, owner: t.id });
  c.rngState = rng.state;
  c.nextPlayerId = getNextPlayerId();
  c.news.push({ year: c.year, week: 0, text: `${opts.coachName} hired as head coach of the ${teamName(c.teams[opts.teamId])}.` });
  return c;
}

export function careerRng(c: Career): Rng {
  const r = new Rng(1);
  r.state = c.rngState;
  return r;
}
export function saveRng(c: Career, r: Rng) {
  c.rngState = r.state;
}

export function playerMap(c: Career): Map<number, Player> {
  const m = new Map<number, Player>();
  for (const p of c.players) m.set(p.id, p);
  return m;
}

export function teamPlayers(c: Career, teamId: number, pm?: Map<number, Player>): Player[] {
  const m = pm ?? playerMap(c);
  return c.teams[teamId].roster.map((id) => m.get(id)!).filter(Boolean);
}

export function payroll(c: Career, teamId: number, pm?: Map<number, Player>): number {
  let s = c.teams[teamId].deadCap;
  for (const p of teamPlayers(c, teamId, pm)) s += p.contract.salary;
  return Math.round(s * 10) / 10;
}

export function capSpace(c: Career, teamId: number, pm?: Map<number, Player>) {
  return Math.round((SALARY_CAP - payroll(c, teamId, pm)) * 10) / 10;
}

export function addNews(c: Career, text: string) {
  c.news.unshift({ year: c.year, week: c.week, text });
  if (c.news.length > 120) c.news.length = 120;
}

export function staffRating(c: Career, role: StaffRole): number {
  return c.staff.find((s) => s.role === role)?.rating ?? 1;
}

export function userTeam(c: Career): Team {
  return c.teams[c.userTeam];
}
