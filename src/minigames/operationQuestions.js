import { DEFAULT_OPERATIONS, OPERATION_OPTIONS, randomInt } from '../lib/engine.js';

export const OP_SYMBOLS = {
  add: '+',
  subtract: '-',
  multiply: 'x',
  divide: '/',
};

const DIVISORS = [2, 3, 4, 5, 6, 8, 10];

const rangeFor = (settings, explicitMax) => {
  if (explicitMax) {
    return explicitMax;
  }
  return settings.difficulty === 'large' ? 200 : 100;
};

export function enabledOperations(operations) {
  const merged = { ...DEFAULT_OPERATIONS, ...(operations ?? {}) };
  const enabled = OPERATION_OPTIONS.filter((option) => merged[option.id]).map((option) => option.id);
  return enabled.length > 0 ? enabled : OPERATION_OPTIONS.filter((option) => DEFAULT_OPERATIONS[option.id]).map((option) => option.id);
}

const pick = (items) => items[randomInt(0, items.length - 1)];

const evaluate = (op, left, right) => {
  if (op === 'add') {
    return left + right;
  }
  if (op === 'subtract') {
    return left - right;
  }
  if (op === 'multiply') {
    return left * right;
  }
  if (op === 'divide') {
    return right !== 0 && left % right === 0 ? left / right : null;
  }
  return null;
};

function makeExpression(settings, op, { maxResult } = {}) {
  const max = rangeFor(settings, maxResult);

  if (op === 'add') {
    const left = randomInt(1, Math.max(1, Math.floor(max / 2)));
    const right = randomInt(1, Math.max(1, max - left));
    return { op, left, right, correct: left + right };
  }

  if (op === 'subtract') {
    const left = randomInt(1, max);
    const right = randomInt(0, left);
    return { op, left, right, correct: left - right };
  }

  if (op === 'multiply') {
    const factorMax = settings.difficulty === 'large' ? 12 : 10;
    let left = 1;
    let right = 1;
    let correct = 1;
    let guard = 0;
    do {
      left = randomInt(1, factorMax);
      right = randomInt(1, factorMax);
      correct = left * right;
      guard += 1;
    } while (correct > max && guard < 100);
    return { op, left, right, correct };
  }

  return makeIntegerDivisionQuestion(settings, { maxResult: max });
}

function makePrompt({ left, right, op, correct }, format = 'result', hidden = 'result') {
  if (format === 'missingOperator') {
    return `${left} ? ${right} = ${correct}`;
  }
  if (format === 'missingOperand') {
    const leftText = hidden === 'left' ? '?' : left;
    const rightText = hidden === 'right' ? '?' : right;
    return `${leftText} ${OP_SYMBOLS[op]} ${rightText} = ${correct}`;
  }
  return `${left} ${OP_SYMBOLS[op]} ${right} = ?`;
}

function makeNumberOptions(correct, count, { min = 0, max = 100, avoid = [] } = {}) {
  const options = [correct];
  const banned = new Set(avoid);
  banned.add(correct);

  let guard = 0;
  while (options.length < count && guard < 600) {
    guard += 1;
    const nearby = correct + (Math.random() > 0.5 ? 1 : -1) * randomInt(1, 12);
    const random = randomInt(min, max);
    const candidate = Math.random() > 0.45 ? nearby : random;
    if (candidate >= min && candidate <= max && !options.includes(candidate) && !banned.has(candidate)) {
      options.push(candidate);
    }
  }

  let step = 1;
  while (options.length < count) {
    const up = correct + step;
    const down = correct - step;
    if (up <= max && !options.includes(up) && !banned.has(up)) {
      options.push(up);
    } else if (down >= min && !options.includes(down) && !banned.has(down)) {
      options.push(down);
    }
    step += 1;
    if (step > max + count + 20) {
      break;
    }
  }

  return shuffle(options.slice(0, count));
}

const shuffle = (items) => {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

export function makeIntegerDivisionQuestion(settings, { maxResult } = {}) {
  const max = rangeFor(settings, maxResult);
  const validDivisors = DIVISORS.filter((divisor) => divisor <= max);
  let divisor = pick(validDivisors);
  let quotient = randomInt(1, settings.difficulty === 'large' ? 20 : 10);
  let dividend = divisor * quotient;
  let guard = 0;

  while (dividend > max && guard < 100) {
    divisor = pick(validDivisors);
    quotient = randomInt(1, settings.difficulty === 'large' ? 20 : 10);
    dividend = divisor * quotient;
    guard += 1;
  }

  return {
    op: 'divide',
    left: dividend,
    right: divisor,
    correct: quotient,
    prompt: `${dividend} / ${divisor} = ?`,
    options: makeNumberOptions(quotient, settings.answerCount, { min: 1, max: Math.max(12, quotient + 12) }),
    meta: { integerDivision: true, divisor, quotient, dividend },
  };
}

export function makeOperationQuestion(settings, options = {}) {
  const {
    operations = settings.operations,
    format = 'result',
    maxResult,
  } = options;

  if (format === 'missingOperator') {
    return makeMissingOperatorQuestion(settings, options);
  }
  if (format === 'missingOperand') {
    return makeMissingOperandQuestion(settings, options);
  }
  if (format === 'equationCheck') {
    return makeEquationCheckQuestion(settings, options);
  }

  const op = pick(enabledOperations(operations));
  const expression = makeExpression(settings, op, { maxResult });
  const max = rangeFor(settings, maxResult);
  return {
    ...expression,
    prompt: makePrompt(expression),
    options: makeNumberOptions(expression.correct, settings.answerCount, { min: 0, max }),
    meta: {
      carry: expression.op === 'add' && expression.left % 10 + expression.right % 10 >= 10,
      borrow: expression.op === 'subtract' && expression.left % 10 < expression.right % 10,
      integerDivision: expression.op === 'divide',
    },
  };
}

export function makeMissingOperatorQuestion(settings, { operations = settings.operations, maxResult } = {}) {
  const enabled = enabledOperations(operations);
  let expression = null;
  let guard = 0;

  while (!expression && guard < 800) {
    guard += 1;
    const candidate = makeExpression(settings, pick(enabled), { maxResult });
    const matchingOps = enabled.filter((op) => evaluate(op, candidate.left, candidate.right) === candidate.correct);
    if (matchingOps.length === 1) {
      expression = candidate;
    }
  }

  if (!expression) {
    expression = makeExpression(settings, enabled[0], { maxResult });
  }

  return {
    ...expression,
    prompt: makePrompt(expression, 'missingOperator'),
    options: enabled.map((op) => ({
      id: op,
      symbol: OP_SYMBOLS[op],
      label: OPERATION_OPTIONS.find((option) => option.id === op)?.label ?? op,
      correct: op === expression.op,
    })),
    meta: { integerDivision: expression.op === 'divide' },
  };
}

export function makeMissingOperandQuestion(settings, { operations = settings.operations, maxResult } = {}) {
  const op = pick(enabledOperations(operations));
  const expression = makeExpression(settings, op, { maxResult });
  const hidden = Math.random() > 0.5 ? 'left' : 'right';
  const correct = hidden === 'left' ? expression.left : expression.right;
  const max = rangeFor(settings, maxResult);

  return {
    ...expression,
    hidden,
    missing: correct,
    prompt: makePrompt(expression, 'missingOperand', hidden),
    options: makeNumberOptions(correct, settings.answerCount, { min: op === 'divide' && hidden === 'right' ? 1 : 0, max }),
    meta: { integerDivision: op === 'divide' },
  };
}

export function makeEquationCheckQuestion(settings, { operations = settings.operations, maxResult, forceWrong = true } = {}) {
  const expression = makeOperationQuestion(settings, { operations, maxResult });
  const max = rangeFor(settings, maxResult);
  const wrongOptions = makeNumberOptions(expression.correct, settings.answerCount, { min: 0, max }).filter(
    (value) => value !== expression.correct,
  );
  const displayedResult = forceWrong ? wrongOptions[0] : Math.random() > 0.5 ? expression.correct : wrongOptions[0];

  return {
    op: expression.op,
    left: expression.left,
    right: expression.right,
    correct: expression.correct,
    displayedResult,
    isCorrect: displayedResult === expression.correct,
    prompt: `${expression.left} ${OP_SYMBOLS[expression.op]} ${expression.right} = ${displayedResult}`,
    options: makeNumberOptions(expression.correct, settings.answerCount, { min: 0, max, avoid: [displayedResult] }),
    meta: expression.meta,
  };
}

export function makeSharingQuestion(settings, { maxResult } = {}) {
  const division = makeIntegerDivisionQuestion(settings, { maxResult });
  const askFor = Math.random() > 0.5 ? 'perGroup' : 'groups';
  const total = division.left;
  const groups = division.right;
  const perGroup = division.correct;
  const correct = askFor === 'perGroup' ? perGroup : groups;

  return {
    total,
    groups,
    perGroup,
    askFor,
    correct,
    prompt:
      askFor === 'perGroup'
        ? `${total} Dinge auf ${groups} Kisten`
        : `${total} Dinge, ${perGroup} pro Kiste`,
    options: makeNumberOptions(correct, settings.answerCount, { min: 1, max: Math.max(groups, perGroup) + 12 }),
    factorsPracticed: [groups, perGroup],
  };
}
