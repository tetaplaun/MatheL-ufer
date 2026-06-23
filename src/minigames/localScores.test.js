import { beforeEach, describe, expect, it } from 'vitest';
import { isNewBest, loadBestScore, saveBestScore } from './localScores.js';

beforeEach(() => {
  localStorage.clear();
});

describe('localScores', () => {
  it('returns null when nothing is stored', () => {
    expect(loadBestScore('regen|x')).toBeNull();
  });

  it('stores a first score and reports it as a record', () => {
    const { best, isRecord } = saveBestScore('regen|x', 12, { mode: 'highscore' });
    expect(isRecord).toBe(true);
    expect(best.value).toBe(12);
    expect(loadBestScore('regen|x').value).toBe(12);
  });

  it('keeps the higher score in highscore mode', () => {
    saveBestScore('regen|x', 12, { mode: 'highscore' });
    expect(saveBestScore('regen|x', 9, { mode: 'highscore' }).isRecord).toBe(false);
    expect(loadBestScore('regen|x').value).toBe(12);
    expect(saveBestScore('regen|x', 20, { mode: 'highscore' }).isRecord).toBe(true);
    expect(loadBestScore('regen|x').value).toBe(20);
  });

  it('keeps the lower time in time mode', () => {
    saveBestScore('bruecken|x', 30.5, { mode: 'time' });
    expect(saveBestScore('bruecken|x', 40, { mode: 'time' }).isRecord).toBe(false);
    expect(loadBestScore('bruecken|x').value).toBe(30.5);
    expect(saveBestScore('bruecken|x', 22.1, { mode: 'time' }).isRecord).toBe(true);
    expect(loadBestScore('bruecken|x').value).toBe(22.1);
  });

  it('isNewBest reflects the comparison without writing', () => {
    saveBestScore('blitz|x', 15, { mode: 'highscore' });
    expect(isNewBest('blitz|x', 20, 'highscore')).toBe(true);
    expect(isNewBest('blitz|x', 10, 'highscore')).toBe(false);
    expect(isNewBest('fresh|key', 1, 'highscore')).toBe(true);
    // unchanged by the read-only check
    expect(loadBestScore('blitz|x').value).toBe(15);
  });

  it('persists meta alongside the value', () => {
    saveBestScore('memory|x', 18.2, { mode: 'time', meta: { mistakes: 1 } });
    expect(loadBestScore('memory|x').meta).toEqual({ mistakes: 1 });
  });
});
