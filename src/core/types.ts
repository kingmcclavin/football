export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'K';
export const POSITIONS: Pos[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K'];
export const OFFENSE_POS: Pos[] = ['QB', 'RB', 'WR', 'TE', 'OL'];
export const DEFENSE_POS: Pos[] = ['DL', 'LB', 'DB'];

/** Attributes, all on a 1-99 scale. */
export interface Ratings {
  spd: number; // top speed
  acc: number; // acceleration / agility
  str: number; // strength
  awr: number; // awareness / football IQ
  thp: number; // throw power
  tha: number; // throw accuracy
  cth: number; // catching / hands
  car: number; // ball security
  elu: number; // elusiveness / break tackles
  rte: number; // route running
  blk: number; // blocking
  prs: number; // pass rush
  tak: number; // tackling
  cov: number; // coverage
  kpw: number; // kick power
  kac: number; // kick accuracy
}
export type RatingKey = keyof Ratings;
export const RATING_LABELS: Record<RatingKey, string> = {
  spd: 'Speed', acc: 'Agility', str: 'Strength', awr: 'Awareness', thp: 'Throw Pow', tha: 'Throw Acc',
  cth: 'Catching', car: 'Ball Sec', elu: 'Elusive', rte: 'Routes', blk: 'Blocking', prs: 'Pass Rush',
  tak: 'Tackling', cov: 'Coverage', kpw: 'Kick Pow', kac: 'Kick Acc',
};

export interface StatLine {
  gp: number;
  // passing
  pAtt: number; pCmp: number; pYds: number; pTd: number; pInt: number; sacked: number; pLng: number;
  // rushing
  rAtt: number; rYds: number; rTd: number; rLng: number; fum: number;
  // receiving
  rec: number; tgt: number; recYds: number; recTd: number; recLng: number;
  // defense
  tkl: number; sacks: number; dInt: number; pd: number; ff: number; fr: number; defTd: number;
  // kicking
  fgA: number; fgM: number; fgLng: number; xpA: number; xpM: number; punts: number; puntYds: number;
  // returns
  krYds: number; krTd: number;
}
export function emptyStats(): StatLine {
  return {
    gp: 0, pAtt: 0, pCmp: 0, pYds: 0, pTd: 0, pInt: 0, sacked: 0, pLng: 0,
    rAtt: 0, rYds: 0, rTd: 0, rLng: 0, fum: 0, rec: 0, tgt: 0, recYds: 0, recTd: 0, recLng: 0,
    tkl: 0, sacks: 0, dInt: 0, pd: 0, ff: 0, fr: 0, defTd: 0,
    fgA: 0, fgM: 0, fgLng: 0, xpA: 0, xpM: 0, punts: 0, puntYds: 0, krYds: 0, krTd: 0,
  };
}
const MAX_KEYS = new Set(['pLng', 'rLng', 'recLng', 'fgLng']);
export function addStats(into: StatLine, s: Partial<StatLine>): StatLine {
  for (const k of Object.keys(s) as (keyof StatLine)[]) {
    const v = s[k] ?? 0;
    if (MAX_KEYS.has(k)) into[k] = Math.max(into[k], v);
    else into[k] += v;
  }
  return into;
}

export interface Injury {
  weeks: number;
  desc: string;
}
export interface Contract {
  salary: number; // $M per season
  years: number; // seasons remaining including current
}
export interface Appearance {
  skin: number; // index into skin palette
  hair: number;
  hairColor: number;
  beard: boolean;
  visor: boolean;
}
export interface SeasonRecord {
  year: number;
  teamId: number;
  ovr: number;
  stats: StatLine;
}
export interface Player {
  id: number;
  first: string;
  last: string;
  pos: Pos;
  age: number;
  num: number;
  r: Ratings;
  pot: number; // potential ceiling for overall
  ovr: number;
  morale: number; // 0-100
  cond: number; // 0-100 physical condition
  injury: Injury | null;
  contract: Contract;
  teamId: number; // -1 = free agent, -2 = retired, -3 = draft prospect
  xp: number;
  look: Appearance;
  season: StatLine;
  history: SeasonRecord[];
  draft: { year: number; round: number; pick: number; teamId: number } | null;
  awards: string[];
  rookie: boolean;
  scouted?: boolean;
  college?: string;
  hof?: boolean;
  retiredYear?: number;
}

export interface TeamSeason {
  w: number; l: number; t: number;
  pf: number; pa: number;
  divW: number; divL: number; divT: number;
  confW: number; confL: number; confT: number;
  streak: number; // +n win streak, -n losing streak
}
export function emptyTeamSeason(): TeamSeason {
  return { w: 0, l: 0, t: 0, pf: 0, pa: 0, divW: 0, divL: 0, divT: 0, confW: 0, confL: 0, confT: 0, streak: 0 };
}

export interface TeamColors {
  primary: string;
  secondary: string;
  helmet: string;
  pants: string;
}

export interface Team {
  id: number;
  city: string;
  name: string;
  abbr: string;
  conf: number; // 0 or 1
  div: number; // 0..3 within conference
  colors: TeamColors;
  emblem: number; // emblem shape index
  stadium: string;
  dome: boolean;
  climate: 'warm' | 'temperate' | 'cold';
  roster: number[]; // player ids
  depth: Partial<Record<Pos, number[]>>;
  rec: TeamSeason;
  history: { year: number; w: number; l: number; t: number; result: string }[];
  titles: number[];
  prestige: number; // 0-100, drives free-agent interest
  deadCap: number;
  /** AI tendencies */
  passBias: number; // 0..1
  aggression: number; // 0..1
}

export interface DraftPick {
  year: number;
  round: number;
  origTeam: number;
  owner: number;
}

export interface GameResultSummary {
  home: number;
  away: number;
  hs: number;
  as: number;
  ot: boolean;
}

export interface ScheduledGame {
  id: number;
  week: number; // 1..N regular season, then playoff weeks
  home: number;
  away: number;
  played: boolean;
  hs: number;
  as: number;
  ot: boolean;
  playoff?: 'WC' | 'DIV' | 'CONF' | 'FINAL';
  boxId?: number; // index into stored box scores (user games)
}

export type Weather = 'clear' | 'rain' | 'snow' | 'wind' | 'dome';

export type Difficulty = 'rookie' | 'pro' | 'allpro' | 'legend';
