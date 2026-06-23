import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/engine.js';
import {
  enabledOperations,
  makeEquationCheckQuestion,
  makeIntegerDivisionQuestion,
  makeMissingOperandQuestion,
  makeMissingOperatorQuestion,
  makeOperationQuestion,
  makeSharingQuestion,
} from './operationQuestions.js';

const plusMinus = {
  ...DEFAULT_SETTINGS,
  operations: { add: true, subtract: true, multiply: false, divide: false },
};

const allOps = {
  ...DEFAULT_SETTINGS,
  operations: { add: true, subtract: true, multiply: true, divide: true },
};

describe('enabledOperations', () => {
  it('uses only enabled operations and falls back if all are disabled', () => {
    expect(enabledOperations({ add: false, subtract: true, multiply: false, divide: true })).toEqual([
      'subtract',
      'divide',
    ]);
    expect(enabledOperations({ add: false, subtract: false, multiply: false, divide: false })).toEqual([
      'add',
      'subtract',
      'multiply',
    ]);
  });
});

describe('makeOperationQuestion', () => {
  it('only emits enabled operations', () => {
    for (let i = 0; i < 120; i += 1) {
      const question = makeOperationQuestion(plusMinus);
      expect(['add', 'subtract']).toContain(question.op);
    }
  });

  it('never creates negative subtraction by default', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      operations: { add: false, subtract: true, multiply: false, divide: false },
    };
    for (let i = 0; i < 120; i += 1) {
      const question = makeOperationQuestion(settings);
      expect(question.op).toBe('subtract');
      expect(question.left).toBeGreaterThanOrEqual(question.right);
      expect(question.correct).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns unique answer options with exactly one correct result', () => {
    for (let i = 0; i < 120; i += 1) {
      const question = makeOperationQuestion(allOps);
      expect(question.options).toHaveLength(allOps.answerCount);
      expect(new Set(question.options).size).toBe(question.options.length);
      expect(question.options.filter((option) => option === question.correct)).toHaveLength(1);
    }
  });
});

describe('integer division', () => {
  it('always has a non-zero divisor and integer quotient', () => {
    for (let i = 0; i < 160; i += 1) {
      const question = makeIntegerDivisionQuestion(allOps);
      expect(question.right).toBeGreaterThan(0);
      expect(question.left % question.right).toBe(0);
      expect(question.correct).toBe(question.left / question.right);
      expect(Number.isInteger(question.correct)).toBe(true);
    }
  });

  it('keeps sharing questions remainder-free', () => {
    for (let i = 0; i < 100; i += 1) {
      const question = makeSharingQuestion(allOps);
      expect(question.total).toBe(question.groups * question.perGroup);
      expect(Number.isInteger(question.total / question.groups)).toBe(true);
      expect(question.options).toContain(question.correct);
    }
  });
});

describe('mixed operation variants', () => {
  it('missing operator questions have exactly one correct operator', () => {
    for (let i = 0; i < 120; i += 1) {
      const question = makeMissingOperatorQuestion(allOps);
      expect(question.options.filter((option) => option.correct)).toHaveLength(1);
      expect(question.options.map((option) => option.id)).toEqual(['add', 'subtract', 'multiply', 'divide']);
    }
  });

  it('missing operand division stays integer-valid', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      operations: { add: false, subtract: false, multiply: false, divide: true },
    };
    for (let i = 0; i < 100; i += 1) {
      const question = makeMissingOperandQuestion(settings);
      expect(question.op).toBe('divide');
      expect(question.left % question.right).toBe(0);
      expect(question.options).toContain(question.missing);
    }
  });

  it('equation-check questions expose a wrong result and the correct fix', () => {
    for (let i = 0; i < 100; i += 1) {
      const question = makeEquationCheckQuestion(allOps, { forceWrong: true });
      expect(question.displayedResult).not.toBe(question.correct);
      expect(question.isCorrect).toBe(false);
      expect(question.options).toContain(question.correct);
      expect(question.options).not.toContain(question.displayedResult);
    }
  });
});
