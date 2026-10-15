import { beforeAll, describe, expect, it } from 'vitest';
import { createCareer } from '../src/league/career';
import { loadCareer, saveCareer, validateCareer, listSlots } from '../src/save/storage';
import { finishWeek, simWeekGames, userGameThisWeek } from '../src/league/season';
import { Match } from '../src/game/match';
import { DEFAULT_SETTINGS } from '../src/save/settings';

beforeAll(() => {
  // minimal localStorage so the storage layer's fallback path works in node
  const m = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe('save system', () => {
  it('round-trips a career mid-season', async () => {
    const c = createCareer({ coachName: 'Saver', teamId: 9, difficulty: 'allpro', slot: 1, seed: 1234 });
    for (let i = 0; i < 3; i++) {
      simWeekGames(c, true);
      c.event = null;
      finishWeek(c);
    }
    await saveCareer(c);
    const slots = await listSlots();
    expect(slots[1]?.coach).toBe('Saver');
    const r = await loadCareer(1);
    expect(r.career).not.toBeNull();
    const l = r.career!;
    expect(l.week).toBe(c.week);
    expect(l.teams[9].rec).toEqual(c.teams[9].rec);
    expect(l.players.length).toBe(c.players.length);
    expect(l.schedule.filter((g) => g.played).length).toBe(48);
    const p = c.players.find((x) => x.season.pYds > 0)!;
    expect(l.players.find((x) => x.id === p.id)!.season.pYds).toBe(p.season.pYds);
  });

  it('falls back to the backup when the main save is corrupt', async () => {
    const c = createCareer({ coachName: 'Backup', teamId: 2, difficulty: 'pro', slot: 2, seed: 77 });
    await saveCareer(c);
    c.week = 5;
    await saveCareer(c); // previous save becomes the backup
    const raw = JSON.parse(localStorage.getItem('gl-slot2')!);
    raw.data = '{"broken": tru';
    localStorage.setItem('gl-slot2', JSON.stringify(raw));
    const r = await loadCareer(2);
    expect(r.fromBackup).toBe(true);
    expect(r.career?.coach.name).toBe('Backup');
  });

  it('rejects invalid data with a reason instead of crashing', () => {
    expect(validateCareer(null)).toMatch(/not an object/);
    expect(validateCareer({ version: 99, teams: [] })).toMatch(/newer version/);
    expect(validateCareer({ version: 1, teams: [] })).toMatch(/Team data/);
  });

  it('a game in progress can be snapshotted and resumed', () => {
    const c = createCareer({ coachName: 'Live', teamId: 4, difficulty: 'pro', slot: 0, seed: 5 });
    const game = userGameThisWeek(c)!;
    const m = new Match(c, game, DEFAULT_SETTINGS, 'clear');
    m.callCoin('heads');
    // fast-forward a little with the statistical engine and snapshot at a boundary
    m.g.score = [10, 7];
    m.g.quarter = 2;
    m.stage = 'playcall';
    const snap = JSON.parse(JSON.stringify(m.snapshot()));
    const m2 = new Match(c, game, DEFAULT_SETTINGS, 'clear', snap);
    expect(m2.g.score).toEqual([10, 7]);
    expect(m2.g.quarter).toBe(2);
    m2.next();
    expect(['playcall', 'defcall', 'live', 'result', 'kickoffChoice', 'presnap']).toContain(m2.stage);
  });
});
