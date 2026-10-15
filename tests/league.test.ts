import { describe, expect, it } from 'vitest';
import { createCareer, playerMap, type Career } from '../src/league/career';
import { finishWeek, simWeekGames } from '../src/league/season';
import { finishDraft, finishFreeAgency, finishResign, processOffseason, seasonReview, startNewSeason, simDraftToUser, makePick } from '../src/league/offseason';
import { expectedWins } from '../src/league/frontoffice';
import { resolveEvent } from '../src/league/events';

function playSeason(c: Career) {
  let guard = 0;
  while (c.phase !== 'offseason' && guard++ < 40) {
    if (c.event) resolveEvent(c, 0);
    simWeekGames(c, true);
    finishWeek(c);
  }
}

describe('league', () => {
  it('builds a valid schedule', () => {
    const c = createCareer({ coachName: 'Test', teamId: 3, difficulty: 'pro', slot: 0, seed: 42 });
    expect(c.schedule.length).toBe(16 * 16);
    for (let w = 1; w <= 16; w++) {
      const games = c.schedule.filter((g) => g.week === w);
      const teams = new Set(games.flatMap((g) => [g.home, g.away]));
      expect(teams.size).toBe(32);
    }
    for (const t of c.teams) {
      const n = c.schedule.filter((g) => g.home === t.id || g.away === t.id).length;
      expect(n).toBe(16);
      const home = c.schedule.filter((g) => g.home === t.id).length;
      expect(home).toBeGreaterThanOrEqual(6);
      expect(home).toBeLessThanOrEqual(10);
    }
  });

  it('plays multiple full seasons with offseasons', () => {
    const c = createCareer({ coachName: 'Test', teamId: 3, difficulty: 'pro', slot: 0, seed: 7 });
    c.expected = expectedWins(c);
    for (let season = 0; season < 3; season++) {
      playSeason(c);
      expect(c.phase).toBe('offseason');
      expect(c.playoffs?.champion).toBeGreaterThanOrEqual(0);
      const wins = c.teams.reduce((s, t) => s + t.rec.w, 0);
      const losses = c.teams.reduce((s, t) => s + t.rec.l, 0);
      expect(wins).toBe(losses);
      const pm = playerMap(c);
      // stat sanity: league leaders in a plausible range
      const qbs = c.players.filter((p) => p.pos === 'QB' && p.teamId >= 0).map((p) => p.season.pYds).sort((a, b) => b - a);
      const rbs = c.players.filter((p) => p.pos === 'RB' && p.teamId >= 0).map((p) => p.season.rYds).sort((a, b) => b - a);
      const ppg = c.teams.reduce((s, t) => s + t.rec.pf, 0) / (32 * 16);
      console.log(`season ${c.year}: top QB ${qbs[0]} yds, top RB ${rbs[0]} yds, ppg ${ppg.toFixed(1)}, champ ${c.teams[c.playoffs!.champion!].abbr}`);
      void pm;
      seasonReview(c);
      if (c.coach.fired) c.coach.fired = false;
      processOffseason(c);
      finishResign(c);
      simDraftToUser(c);
      if (c.draftOrder[c.draftPos]?.team === c.userTeam) makePick(c, c.draftClass[0]);
      finishDraft(c);
      finishFreeAgency(c);
      startNewSeason(c);
      for (const t of c.teams) {
        expect(t.roster.length).toBeGreaterThanOrEqual(26);
        expect(t.roster.length).toBeLessThanOrEqual(40);
      }
      expect(c.schedule.length).toBe(256);
    }
    const json = JSON.stringify(c);
    console.log('save size KB', Math.round(json.length / 1024), 'players', c.players.length);
  });
});
