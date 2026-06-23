import { describe, expect, it } from 'vitest';
import {
  ANSWER_COUNT_OPTIONS,
  DEFAULT_SETTINGS,
  DIFFICULTY_OPTIONS,
  FINISH_PROGRESS,
  clamp,
  factorPoolFor,
  formatFactorRange,
  formatSeconds,
  makeCheckpoints,
  makeFactorPool,
  makeQuestion,
  makeSettingsKey,
  pickFactor,
  randomInt,
} from './engine.js';

describe('clamp', () => {
  it('returns the value when inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('clamps below the minimum and above the maximum', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe('formatSeconds', () => {
  it('formats with one decimal and a unit', () => {
    expect(formatSeconds(0)).toBe('0.0 s');
    expect(formatSeconds(3.14159)).toBe('3.1 s');
    expect(formatSeconds(12.05)).toBe('12.1 s');
  });
});

describe('randomInt', () => {
  it('always stays within the inclusive range', () => {
    for (let i = 0; i < 500; i += 1) {
      const value = randomInt(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
  it('returns the only value for a single-element range', () => {
    expect(randomInt(5, 5)).toBe(5);
  });
});

describe('makeCheckpoints', () => {
  it('produces the requested number of strictly increasing checkpoints below the finish', () => {
    const checkpoints = makeCheckpoints(5);
    expect(checkpoints).toEqual([17, 33, 50, 67, 83]);
    expect(checkpoints).toHaveLength(5);
    for (let i = 1; i < checkpoints.length; i += 1) {
      expect(checkpoints[i]).toBeGreaterThan(checkpoints[i - 1]);
    }
    expect(Math.max(...checkpoints)).toBeLessThan(FINISH_PROGRESS);
  });
});

describe('makeFactorPool', () => {
  it('covers the full range by default', () => {
    expect(makeFactorPool({ skipEasyRows: false, skipTenRow: false }, 10)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });
  it('drops the 1er and 2er rows when skipEasyRows is set', () => {
    expect(makeFactorPool({ skipEasyRows: true, skipTenRow: false }, 10)).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });
  it('drops the 10er row when skipTenRow is set', () => {
    expect(makeFactorPool({ skipEasyRows: false, skipTenRow: true }, 10)).not.toContain(10);
  });
  it('applies both toggles together', () => {
    expect(makeFactorPool({ skipEasyRows: true, skipTenRow: true }, 9)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('factorPoolFor', () => {
  it('resolves maxFactor from the small difficulty', () => {
    const pool = factorPoolFor({ ...DEFAULT_SETTINGS, difficulty: 'small' });
    expect(Math.max(...pool)).toBe(10);
  });
  it('resolves maxFactor from the large difficulty', () => {
    const pool = factorPoolFor({ ...DEFAULT_SETTINGS, difficulty: 'large' });
    expect(Math.max(...pool)).toBe(20);
  });
  it('never returns an empty pool (regression for the old single-arg footgun)', () => {
    for (const difficulty of DIFFICULTY_OPTIONS) {
      expect(factorPoolFor({ ...DEFAULT_SETTINGS, difficulty: difficulty.id }).length).toBeGreaterThan(0);
    }
  });
});

describe('pickFactor', () => {
  it('always returns a member of the pool', () => {
    const pool = [3, 4, 5, 6];
    for (let i = 0; i < 200; i += 1) {
      expect(pool).toContain(pickFactor(pool));
    }
  });
});

describe('makeSettingsKey', () => {
  it('is stable for the default settings', () => {
    expect(makeSettingsKey(DEFAULT_SETTINGS)).toBe('small|mit-1-2|mit-10|medium|4-antworten');
  });
  it('changes when any setting changes', () => {
    const base = makeSettingsKey(DEFAULT_SETTINGS);
    expect(makeSettingsKey({ ...DEFAULT_SETTINGS, difficulty: 'large' })).not.toBe(base);
    expect(makeSettingsKey({ ...DEFAULT_SETTINGS, skipEasyRows: true })).not.toBe(base);
    expect(makeSettingsKey({ ...DEFAULT_SETTINGS, answerCount: 8 })).not.toBe(base);
  });
});

describe('formatFactorRange', () => {
  it('describes the default small range', () => {
    expect(formatFactorRange({ skipEasyRows: false, skipTenRow: false }, 10)).toBe('1er bis 10er Reihe');
  });
  it('starts at 3 when easy rows are skipped', () => {
    expect(formatFactorRange({ skipEasyRows: true, skipTenRow: false }, 10)).toBe('3er bis 10er Reihe');
  });
  it('caps the small range at 9 when the 10er row is skipped', () => {
    expect(formatFactorRange({ skipEasyRows: false, skipTenRow: true }, 10)).toBe('1er bis 9er Reihe');
  });
  it('adds the "ohne 10er" suffix for the large range', () => {
    expect(formatFactorRange({ skipEasyRows: false, skipTenRow: true }, 20)).toBe('1er bis 20er Reihe ohne 10er');
  });
});

describe('makeQuestion', () => {
  const settingsMatrix = [];
  for (const difficulty of ['small', 'large']) {
    for (const answerCount of ANSWER_COUNT_OPTIONS) {
      settingsMatrix.push({ ...DEFAULT_SETTINGS, difficulty, answerCount });
    }
  }

  it.each(settingsMatrix)('respects invariants for %o', (settings) => {
    const pool = factorPoolFor(settings);
    for (let i = 0; i < 100; i += 1) {
      const question = makeQuestion(settings);
      expect(question.correct).toBe(question.a * question.b);
      expect(pool).toContain(question.a);
      expect(pool).toContain(question.b);
      expect(question.options).toHaveLength(settings.answerCount);
      expect(question.options).toContain(question.correct);
      expect(new Set(question.options).size).toBe(settings.answerCount);
      for (const option of question.options) {
        expect(option).toBeGreaterThan(0);
      }
    }
  });
});
