import type { TeamColors } from '../core/types';

export interface TeamDef {
  city: string;
  name: string;
  abbr: string;
  colors: TeamColors;
  emblem: number;
  stadium: string;
  dome: boolean;
  climate: 'warm' | 'temperate' | 'cold';
}

const c = (primary: string, secondary: string, helmet: string, pants: string): TeamColors => ({ primary, secondary, helmet, pants });

export const CONFERENCES = ['Liberty Conference', 'Frontier Conference'];
export const CONF_ABBR = ['LIB', 'FRN'];
export const DIVISIONS = ['North', 'East', 'South', 'West'];

/** 32 original franchises: conference = floor(i/16), division = floor((i%16)/4). */
export const TEAM_DEFS: TeamDef[] = [
  // Liberty North
  { city: 'Boston', name: 'Harbormen', abbr: 'BOS', colors: c('#1d2f6f', '#c0c6cf', '#1d2f6f', '#c0c6cf'), emblem: 0, stadium: 'Harborside Field', dome: false, climate: 'cold' },
  { city: 'New York', name: 'Skyliners', abbr: 'NYS', colors: c('#1f4fb4', '#f28a1e', '#1f4fb4', '#ffffff'), emblem: 1, stadium: 'Empire Grounds', dome: false, climate: 'cold' },
  { city: 'Buffalo', name: 'Blizzard', abbr: 'BUF', colors: c('#2453c9', '#e8f1ff', '#e8f1ff', '#2453c9'), emblem: 2, stadium: 'Lakeshore Bowl', dome: false, climate: 'cold' },
  { city: 'Philadelphia', name: 'Bells', abbr: 'PHI', colors: c('#11604a', '#e0b13b', '#11604a', '#e0b13b'), emblem: 3, stadium: 'Liberty Yard', dome: false, climate: 'cold' },
  // Liberty East
  { city: 'Baltimore', name: 'Ironclads', abbr: 'BAL', colors: c('#4a2a85', '#151515', '#151515', '#4a2a85'), emblem: 4, stadium: 'Inner Harbor Park', dome: false, climate: 'temperate' },
  { city: 'Pittsburgh', name: 'Forgers', abbr: 'PIT', colors: c('#151515', '#f2b705', '#f2b705', '#151515'), emblem: 5, stadium: 'Three Rivers Works', dome: false, climate: 'cold' },
  { city: 'Cleveland', name: 'Hounds', abbr: 'CLE', colors: c('#5a3418', '#f26a10', '#f26a10', '#5a3418'), emblem: 6, stadium: 'Lakefront Kennel', dome: false, climate: 'cold' },
  { city: 'Cincinnati', name: 'Riverkings', abbr: 'CIN', colors: c('#f2551d', '#151515', '#151515', '#f2551d'), emblem: 7, stadium: 'Riverbend Stadium', dome: false, climate: 'temperate' },
  // Liberty South
  { city: 'Miami', name: 'Tide', abbr: 'MIA', colors: c('#0e9ba6', '#f5841f', '#ffffff', '#0e9ba6'), emblem: 8, stadium: 'Biscayne Field', dome: false, climate: 'warm' },
  { city: 'Tampa Bay', name: 'Corsairs', abbr: 'TB', colors: c('#c8102e', '#5b5e60', '#5b5e60', '#c8102e'), emblem: 9, stadium: 'Gulfport Arena', dome: false, climate: 'warm' },
  { city: 'Atlanta', name: 'Firebirds', abbr: 'ATL', colors: c('#a01822', '#151515', '#151515', '#a01822'), emblem: 10, stadium: 'Peachtree Dome', dome: true, climate: 'warm' },
  { city: 'Charlotte', name: 'Stingers', abbr: 'CHA', colors: c('#0f8aa0', '#151515', '#0f8aa0', '#c8ccd0'), emblem: 11, stadium: 'Queen City Yard', dome: false, climate: 'temperate' },
  // Liberty West
  { city: 'Nashville', name: 'Sound', abbr: 'NSH', colors: c('#0d2240', '#4b92db', '#4b92db', '#0d2240'), emblem: 12, stadium: 'Music Row Field', dome: false, climate: 'temperate' },
  { city: 'Jacksonville', name: 'Barracudas', abbr: 'JAX', colors: c('#00676e', '#d7a22a', '#151515', '#00676e'), emblem: 13, stadium: 'St. Johns Stadium', dome: false, climate: 'warm' },
  { city: 'New Orleans', name: 'Krewe', abbr: 'NO', colors: c('#4b2e83', '#d4af37', '#d4af37', '#4b2e83'), emblem: 14, stadium: 'Crescent Dome', dome: true, climate: 'warm' },
  { city: 'Washington', name: 'Statesmen', abbr: 'WAS', colors: c('#6d1a2a', '#e6b53a', '#6d1a2a', '#e6b53a'), emblem: 15, stadium: 'Capitol Grounds', dome: false, climate: 'temperate' },
  // Frontier North
  { city: 'Chicago', name: 'Blast', abbr: 'CHI', colors: c('#0b1c3a', '#e2601a', '#0b1c3a', '#e2601a'), emblem: 16, stadium: 'Lakeshore Coliseum', dome: false, climate: 'cold' },
  { city: 'Detroit', name: 'Motormen', abbr: 'DET', colors: c('#1477c4', '#b0b7bc', '#b0b7bc', '#1477c4'), emblem: 17, stadium: 'Assembly Line Dome', dome: true, climate: 'cold' },
  { city: 'Minnesota', name: 'Lumberjacks', abbr: 'MIN', colors: c('#4f2683', '#ffc62f', '#4f2683', '#ffc62f'), emblem: 18, stadium: 'North Woods Dome', dome: true, climate: 'cold' },
  { city: 'Milwaukee', name: 'Brewhawks', abbr: 'MIL', colors: c('#1c4d2c', '#f5b81c', '#f5b81c', '#1c4d2c'), emblem: 19, stadium: 'Brewers Row Field', dome: false, climate: 'cold' },
  // Frontier East
  { city: 'Dallas', name: 'Wranglers', abbr: 'DAL', colors: c('#0b2a5b', '#a5acaf', '#a5acaf', '#0b2a5b'), emblem: 20, stadium: 'Lone Star Dome', dome: true, climate: 'warm' },
  { city: 'Houston', name: 'Wildcatters', abbr: 'HOU', colors: c('#a3162b', '#0b2340', '#0b2340', '#a3162b'), emblem: 21, stadium: 'Bayou Dome', dome: true, climate: 'warm' },
  { city: 'Kansas City', name: 'Stampede', abbr: 'KC', colors: c('#d41a2c', '#f4bc1d', '#d41a2c', '#ffffff'), emblem: 22, stadium: 'Prairie Field', dome: false, climate: 'temperate' },
  { city: 'St. Louis', name: 'Archers', abbr: 'STL', colors: c('#1a3e8c', '#e0b12b', '#e0b12b', '#1a3e8c'), emblem: 23, stadium: 'Gateway Dome', dome: true, climate: 'temperate' },
  // Frontier South
  { city: 'Phoenix', name: 'Scorpions', abbr: 'PHX', colors: c('#a7192f', '#e6c49a', '#e6c49a', '#a7192f'), emblem: 24, stadium: 'Sonoran Dome', dome: true, climate: 'warm' },
  { city: 'Las Vegas', name: 'Jackpots', abbr: 'LV', colors: c('#151515', '#c4c8cc', '#c4c8cc', '#151515'), emblem: 25, stadium: 'Neon Dome', dome: true, climate: 'warm' },
  { city: 'San Antonio', name: 'Vaqueros', abbr: 'SA', colors: c('#6b1f2a', '#d8a64a', '#d8a64a', '#6b1f2a'), emblem: 26, stadium: 'Alamo Field', dome: false, climate: 'warm' },
  { city: 'Denver', name: 'Peaks', abbr: 'DEN', colors: c('#f2611d', '#0b2244', '#0b2244', '#f2611d'), emblem: 27, stadium: 'Mile High Ridge', dome: false, climate: 'cold' },
  // Frontier West
  { city: 'Los Angeles', name: 'Stars', abbr: 'LA', colors: c('#e8b923', '#13265c', '#13265c', '#e8b923'), emblem: 28, stadium: 'Sunset Coliseum', dome: false, climate: 'warm' },
  { city: 'San Francisco', name: 'Fog', abbr: 'SF', colors: c('#a5141e', '#c8a35a', '#c8a35a', '#a5141e'), emblem: 29, stadium: 'Golden Bay Park', dome: false, climate: 'temperate' },
  { city: 'Seattle', name: 'Orcas', abbr: 'SEA', colors: c('#0a2647', '#57b846', '#0a2647', '#a5acaf'), emblem: 30, stadium: 'Puget Sound Field', dome: false, climate: 'temperate' },
  { city: 'San Diego', name: 'Surf', abbr: 'SD', colors: c('#0a7fc2', '#ffc20e', '#ffffff', '#0a7fc2'), emblem: 31, stadium: 'Pacific Point Stadium', dome: false, climate: 'warm' },
];
