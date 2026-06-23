import { describe, expect, it } from 'vitest';
import {
  buildFactorPairPuzzle,
  buildProductGrid,
  buildPuzzle,
  buildPuzzleSet,
  buildTwinPuzzle,
} from './buildPuzzle.js';

const small = {
  difficulty: 'small',
  skipEasyRows: false,
  skipTenRow: false,
  routeLength: 'medium',
  answerCount: 4,
};
const large = { ...small, difficulty: 'large', answerCount: 6 };

const pairwiseMinGap = (values) => {
  let min = Infinity;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      min = Math.min(min, Math.abs(values[i] - values[j]));
    }
  }
  return min;
};

describe('buildPuzzle', () => {
  it('returns the requested number of unique options that include the correct answer', () => {
    for (let i = 0; i < 80; i += 1) {
      const puzzle = buildPuzzle(small, { count: 4 });
      expect(puzzle.options).toHaveLength(4);
      expect(new Set(puzzle.options).size).toBe(4);
      expect(puzzle.options).toContain(puzzle.correct);
      expect(puzzle.correct).toBe(puzzle.a * puzzle.b);
    }
  });

  it('respects a minimum gap between every option', () => {
    for (let i = 0; i < 80; i += 1) {
      const puzzle = buildPuzzle(large, { count: 6, minGap: 3 });
      expect(pairwiseMinGap(puzzle.options)).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps every option within maxProduct and positive', () => {
    for (let i = 0; i < 60; i += 1) {
      const puzzle = buildPuzzle(small, { count: 4, maxProduct: 100 });
      for (const option of puzzle.options) {
        expect(option).toBeGreaterThan(0);
        expect(option).toBeLessThanOrEqual(100);
      }
    }
  });

  it('excludes square operands when noSquare is set', () => {
    for (let i = 0; i < 80; i += 1) {
      const puzzle = buildPuzzle(small, { count: 4, noSquare: true });
      expect(puzzle.a).not.toBe(puzzle.b);
    }
  });
});

describe('buildPuzzleSet', () => {
  it('builds the requested number of items with DISTINCT results', () => {
    for (let i = 0; i < 60; i += 1) {
      const set = buildPuzzleSet(small, { size: 4 });
      expect(set).toHaveLength(4);
      const results = set.map((item) => item.correct);
      expect(new Set(results).size).toBe(4);
      for (const item of set) {
        expect(item.correct).toBe(item.a * item.b);
      }
    }
  });

  it('keeps results at least minGap apart', () => {
    for (let i = 0; i < 60; i += 1) {
      const set = buildPuzzleSet(large, { size: 5, minGap: 3 });
      expect(pairwiseMinGap(set.map((item) => item.correct))).toBeGreaterThanOrEqual(3);
    }
  });

  it('excludes squares when asked', () => {
    for (let i = 0; i < 60; i += 1) {
      const set = buildPuzzleSet(small, { size: 4, noSquare: true });
      for (const item of set) {
        expect(item.a).not.toBe(item.b);
      }
    }
  });
});

describe('buildProductGrid', () => {
  it('builds the requested number of cells with unique products', () => {
    const grid = buildProductGrid(small, { cellCount: 25 });
    expect(grid).toHaveLength(25);
    expect(new Set(grid.map((cell) => cell.value)).size).toBe(25);
    for (const cell of grid) {
      expect(cell.value).toBe(cell.a * cell.b);
    }
  });

  it('has enough products for the most restricted small bingo board', () => {
    const restricted = { ...small, skipEasyRows: true, skipTenRow: true, answerCount: 8 };
    const grid = buildProductGrid(restricted, { cellCount: 25 });
    expect(grid).toHaveLength(25);
    expect(new Set(grid.map((cell) => cell.value)).size).toBe(25);
  });
});

describe('buildTwinPuzzle', () => {
  it('returns exactly one turned twin option', () => {
    for (let i = 0; i < 80; i += 1) {
      const puzzle = buildTwinPuzzle(small, { count: 6 });
      expect(puzzle.a).not.toBe(puzzle.b);
      expect(puzzle.options).toHaveLength(6);
      const correctOptions = puzzle.options.filter((option) => option.correct);
      expect(correctOptions).toHaveLength(1);
      expect(correctOptions[0].a).toBe(puzzle.b);
      expect(correctOptions[0].b).toBe(puzzle.a);
      expect(puzzle.options.filter((option) => option.product === puzzle.a * puzzle.b)).toHaveLength(1);
    }
  });
});

describe('buildFactorPairPuzzle', () => {
  it('returns exactly one factor pair for the target product', () => {
    for (let i = 0; i < 80; i += 1) {
      const puzzle = buildFactorPairPuzzle(large, { count: 8 });
      expect(puzzle.options).toHaveLength(8);
      expect(puzzle.target).toBe(puzzle.correct.product);
      expect(puzzle.options.filter((option) => option.product === puzzle.target)).toHaveLength(1);
      expect(puzzle.options.filter((option) => option.correct)).toHaveLength(1);
      for (const option of puzzle.options) {
        expect(option.product).toBe(option.a * option.b);
      }
    }
  });
});
