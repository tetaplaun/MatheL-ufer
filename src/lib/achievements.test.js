import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  EMPTY_STATS,
  MINI_GAME_IDS,
  accumulateStats,
  buildRaceResult,
  diffUnlocked,
  evaluateAchievements,
  mergeAchievementMaps,
  mergeStats,
} from './achievements.js';

const raceResult = (overrides = {}) => ({
  gameId: 'race',
  mode: 'race',
  difficulty: 'small',
  answerCount: 4,
  correct: 5,
  wrong: 0,
  perfect: true,
  bestFlawlessRun: 5,
  fastestAnswerSeconds: 1.5,
  topSpeed: 7,
  completed: true,
  factorsPracticed: [],
  playedAt: '2026-06-23T10:00:00.000Z',
  ...overrides,
});

describe('accumulateStats', () => {
  it('counts a finished race into the cumulative totals', () => {
    const stats = accumulateStats(EMPTY_STATS, raceResult({ correct: 5, wrong: 2, perfect: false }));
    expect(stats.gamesPlayed).toBe(1);
    expect(stats.racesCompleted).toBe(1);
    expect(stats.correctTotal).toBe(5);
    expect(stats.wrongTotal).toBe(2);
    expect(stats.perfectGames).toBe(0);
    expect(stats.gamesByGameId).toEqual({ race: 1 });
    expect(stats.modesPlayed).toEqual(['race']);
  });

  it('increments tableCorrect once per operand occurrence', () => {
    const stats = accumulateStats(EMPTY_STATS, raceResult({ factorsPracticed: [7, 3, 7, 5, 6] }));
    expect(stats.tableCorrect).toEqual({ 3: 1, 5: 1, 6: 1, 7: 2 });
  });

  it('takes the max for monotonic fields and the min for fastest time', () => {
    let stats = accumulateStats(EMPTY_STATS, raceResult({ topSpeed: 7, fastestAnswerSeconds: 2.0, bestFlawlessRun: 3 }));
    stats = accumulateStats(stats, raceResult({ topSpeed: 5, fastestAnswerSeconds: 1.1, bestFlawlessRun: 8 }));
    expect(stats.topSpeed).toBe(7);
    expect(stats.fastestAnswerSeconds).toBe(1.1);
    expect(stats.bestFlawlessRun).toBe(8);
  });

  it('only counts correct answers toward large mode when difficulty is large', () => {
    let stats = accumulateStats(EMPTY_STATS, raceResult({ difficulty: 'small', correct: 6 }));
    stats = accumulateStats(stats, raceResult({ difficulty: 'large', correct: 4 }));
    expect(stats.totalCorrectInLargeMode).toBe(4);
  });

  it('does not raise bestStreak for the race (race omits bestStreak)', () => {
    const stats = accumulateStats(EMPTY_STATS, raceResult());
    expect(stats.bestStreak).toBe(0);
  });

  it('records per-game bests and dedupes modesPlayed across games', () => {
    let stats = accumulateStats(EMPTY_STATS, { gameId: 'blitz', mode: 'minigame', score: 15, completed: true });
    stats = accumulateStats(stats, { gameId: 'blitz', mode: 'minigame', score: 22, completed: true });
    expect(stats.perGameBest.blitz.score).toBe(22);
    expect(stats.perGameBest.blitz.plays).toBe(2);
    expect(stats.modesPlayed).toEqual(['blitz']);
    expect(stats.gamesByGameId).toEqual({ blitz: 2 });
  });
});

describe('day streak', () => {
  it('starts at 1 on the first game', () => {
    const stats = accumulateStats(EMPTY_STATS, raceResult({ playedAt: '2026-06-23T08:00:00Z' }));
    expect(stats.dayStreak).toBe(1);
    expect(stats.longestDayStreak).toBe(1);
    expect(stats.lastPlayedDate).toBe('2026-06-23');
  });

  it('does not change on a second game the same day', () => {
    let stats = accumulateStats(EMPTY_STATS, raceResult({ playedAt: '2026-06-23T08:00:00Z' }));
    stats = accumulateStats(stats, raceResult({ playedAt: '2026-06-23T20:00:00Z' }));
    expect(stats.dayStreak).toBe(1);
  });

  it('increments on consecutive days and resets after a gap', () => {
    let stats = accumulateStats(EMPTY_STATS, raceResult({ playedAt: '2026-06-23T08:00:00Z' }));
    stats = accumulateStats(stats, raceResult({ playedAt: '2026-06-24T08:00:00Z' }));
    expect(stats.dayStreak).toBe(2);
    stats = accumulateStats(stats, raceResult({ playedAt: '2026-06-27T08:00:00Z' }));
    expect(stats.dayStreak).toBe(1);
    expect(stats.longestDayStreak).toBe(2);
  });

  it('does not inflate or reset when the clock moves backwards', () => {
    let stats = accumulateStats(EMPTY_STATS, raceResult({ playedAt: '2026-06-24T08:00:00Z' }));
    stats = accumulateStats(stats, raceResult({ playedAt: '2026-06-25T08:00:00Z' }));
    expect(stats.dayStreak).toBe(2);
    stats = accumulateStats(stats, raceResult({ playedAt: '2026-06-23T08:00:00Z' }));
    expect(stats.dayStreak).toBe(2);
    expect(stats.lastPlayedDate).toBe('2026-06-25');
  });
});

describe('evaluateAchievements', () => {
  const has = (stats, id) => evaluateAchievements(stats).includes(id);

  it('unlocks first_race after one completed race', () => {
    expect(has({ ...EMPTY_STATS, racesCompleted: 1 }, 'first_race')).toBe(true);
    expect(has({ ...EMPTY_STATS, racesCompleted: 0 }, 'first_race')).toBe(false);
  });

  it('respects the correct-answer thresholds at the boundary', () => {
    expect(has({ ...EMPTY_STATS, correctTotal: 49 }, 'correct_50')).toBe(false);
    expect(has({ ...EMPTY_STATS, correctTotal: 50 }, 'correct_50')).toBe(true);
  });

  it('handles row mastery tiers and the 1–10 gold', () => {
    const threeRows = { ...EMPTY_STATS, tableCorrect: { 2: 12, 3: 12, 4: 12 } };
    expect(has(threeRows, 'rows_3')).toBe(true);
    expect(has(threeRows, 'rows_6')).toBe(false);

    const allTen = { ...EMPTY_STATS, tableCorrect: {} };
    for (let f = 1; f <= 10; f += 1) allTen.tableCorrect[f] = 12;
    expect(has(allTen, 'rows_all10')).toBe(true);

    const allTenButOne = { ...EMPTY_STATS, tableCorrect: { ...allTen.tableCorrect, 5: 11 } };
    expect(has(allTenButOne, 'rows_all10')).toBe(false);
  });

  it('handles the 7er marquee', () => {
    expect(has({ ...EMPTY_STATS, tableCorrect: { 7: 19 } }, 'row_7_master')).toBe(false);
    expect(has({ ...EMPTY_STATS, tableCorrect: { 7: 20 } }, 'row_7_master')).toBe(true);
  });

  it('treats fast badges as "at or under" and null as not earned', () => {
    expect(has({ ...EMPTY_STATS, fastestAnswerSeconds: null }, 'fast_under_2')).toBe(false);
    expect(has({ ...EMPTY_STATS, fastestAnswerSeconds: 2 }, 'fast_under_2')).toBe(true);
    expect(has({ ...EMPTY_STATS, fastestAnswerSeconds: 2.01 }, 'fast_under_2')).toBe(false);
    expect(has({ ...EMPTY_STATS, fastestAnswerSeconds: 1 }, 'fast_under_1')).toBe(true);
  });

  it('keeps the forward-looking mini-game badge locked until its game ships', () => {
    expect(has(EMPTY_STATS, 'blitz_20')).toBe(false);
    expect(has({ ...EMPTY_STATS, perGameBest: { blitz: { score: 20 } } }, 'blitz_20')).toBe(true);
  });

  it('unlocks breadth_all only when every mini-game has been played', () => {
    const allButOne = { ...EMPTY_STATS, modesPlayed: MINI_GAME_IDS.slice(0, -1) };
    expect(has(allButOne, 'breadth_all')).toBe(false);
    const all = { ...EMPTY_STATS, modesPlayed: [...MINI_GAME_IDS] };
    expect(has(all, 'breadth_all')).toBe(true);
  });
});

describe('diffUnlocked', () => {
  it('reports and stamps only ids absent from the earned map', () => {
    const stats = { ...EMPTY_STATS, racesCompleted: 1, correctTotal: 50 };
    const { nextMap, newlyUnlocked } = diffUnlocked({}, stats, '2026-06-23T10:00:00Z');
    expect(newlyUnlocked).toContain('first_race');
    expect(newlyUnlocked).toContain('correct_50');
    expect(nextMap.first_race).toBe('2026-06-23T10:00:00Z');
  });

  it('does not re-unlock an already-earned achievement (no fake toasts on rehydrate)', () => {
    const stats = { ...EMPTY_STATS, racesCompleted: 5, correctTotal: 300 };
    const earned = { first_race: '2026-01-01T00:00:00Z', correct_50: '2026-01-02T00:00:00Z' };
    const { newlyUnlocked, nextMap } = diffUnlocked(earned, stats, '2026-06-23T10:00:00Z');
    expect(newlyUnlocked).not.toContain('first_race');
    expect(newlyUnlocked).not.toContain('correct_50');
    expect(nextMap.first_race).toBe('2026-01-01T00:00:00Z'); // original date preserved
  });
});

describe('mergeAchievementMaps', () => {
  it('unions ids keeping the earliest earned date', () => {
    const a = { first_race: '2026-02-01T00:00:00Z', perfect_1: '2026-03-01T00:00:00Z' };
    const b = { first_race: '2026-01-01T00:00:00Z', races_10: '2026-04-01T00:00:00Z' };
    expect(mergeAchievementMaps(a, b)).toEqual({
      first_race: '2026-01-01T00:00:00Z',
      perfect_1: '2026-03-01T00:00:00Z',
      races_10: '2026-04-01T00:00:00Z',
    });
  });
});

describe('mergeStats', () => {
  it('returns the other snapshot when one is missing', () => {
    expect(mergeStats(null, { ...EMPTY_STATS, gamesPlayed: 3 }).gamesPlayed).toBe(3);
    expect(mergeStats({ ...EMPTY_STATS, gamesPlayed: 2 }, null).gamesPlayed).toBe(2);
  });

  it('picks the more-played snapshot for counters but keeps the best of bests', () => {
    const local = {
      ...EMPTY_STATS,
      gamesPlayed: 3,
      correctTotal: 30,
      topSpeed: 9,
      fastestAnswerSeconds: 1.4,
      tableCorrect: { 7: 5 },
      modesPlayed: ['race'],
    };
    const remote = {
      ...EMPTY_STATS,
      gamesPlayed: 10,
      correctTotal: 120,
      topSpeed: 6,
      fastestAnswerSeconds: 2.2,
      tableCorrect: { 7: 8, 3: 4 },
      modesPlayed: ['race', 'blitz'],
    };
    const merged = mergeStats(local, remote);
    expect(merged.correctTotal).toBe(120); // remote wins counters (more games)
    expect(merged.topSpeed).toBe(9); // best of bests
    expect(merged.fastestAnswerSeconds).toBe(1.4); // min
    expect(merged.tableCorrect).toEqual({ 7: 8, 3: 4 }); // entrywise max
    expect(merged.modesPlayed.sort()).toEqual(['blitz', 'race']); // union
  });
});

describe('buildRaceResult', () => {
  const summary = { fastestAnswerSeconds: 1.2, topSpeed: 8.5 };
  const settings = { difficulty: 'small', answerCount: 4 };

  it('parses factors, marks perfect, and computes the flawless run', () => {
    const answerStats = [
      { task: '7 × 3', mistakes: 0 },
      { task: '7 × 5', mistakes: 0 },
      { task: '6 × 6', mistakes: 0 },
    ];
    const result = buildRaceResult(summary, answerStats, settings, 12.3, '2026-06-23T10:00:00Z');
    expect(result.factorsPracticed).toEqual([7, 3, 7, 5, 6]); // square counted once
    expect(result.perfect).toBe(true);
    expect(result.bestFlawlessRun).toBe(3);
    expect(result.correct).toBe(3);
    expect(result.wrong).toBe(0);
    expect(result.bestStreak).toBeUndefined(); // race never sets a miss-streak
    expect(result.fastestAnswerSeconds).toBe(1.2);
  });

  it('breaks the flawless run on a mistake and reports it as imperfect', () => {
    const answerStats = [
      { task: '2 × 3', mistakes: 0 },
      { task: '4 × 5', mistakes: 1 },
      { task: '6 × 7', mistakes: 0 },
    ];
    const result = buildRaceResult(summary, answerStats, settings, 9, '2026-06-23T10:00:00Z');
    expect(result.bestFlawlessRun).toBe(1);
    expect(result.perfect).toBe(false);
    expect(result.wrong).toBe(1);
  });
});

describe('catalog integrity', () => {
  it('has unique ids and a metric + target for every entry', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const achievement of ACHIEVEMENTS) {
      expect(typeof achievement.metric).toBe('function');
      expect(achievement.target).toBeGreaterThan(0);
      expect(achievement.metric(EMPTY_STATS)).toBeGreaterThanOrEqual(0);
    }
  });
});
