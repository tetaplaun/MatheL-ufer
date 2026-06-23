// Puzzle-constraint layer on top of the engine (docs §3 "Puzzle-constraint
// layer"). `makeQuestion`'s distractors are only de-duplicated by a Set; they
// are NOT guaranteed to be a minimum distance apart, to exclude squares, or to
// stay readable in large mode (where "399 vs 400" is unreadable for a young
// child). Games that need those guarantees use these helpers instead.
//
// Pure (uses Math.random via the engine, not seedable — fine for MVP).

import { DIFFICULTY_OPTIONS, factorPoolFor, randomInt } from '../lib/engine.js';

const resolveDifficulty = (settings) =>
  DIFFICULTY_OPTIONS.find((option) => option.id === settings.difficulty) ?? DIFFICULTY_OPTIONS[0];

// A gap that keeps distractors visually distinct. In the large 1×1 products are
// big, so neighbours must be further apart to stay tellable apart on a tablet.
const defaultMinGap = (settings) => (settings.difficulty === 'large' ? 3 : 1);

const pick = (arr) => arr[randomInt(0, arr.length - 1)];

// Choose an operand pair from the pool, optionally excluding squares (a === b).
function pickOperands(factors, { noSquare }) {
  if (factors.length === 0) {
    return [1, 1];
  }
  let a = pick(factors);
  let b = pick(factors);
  if (noSquare && factors.length > 1) {
    let guard = 0;
    while (b === a && guard < 24) {
      b = pick(factors);
      guard += 1;
    }
    if (b === a) {
      // Pool collapsed to one value-ish; nudge b to a different factor.
      b = factors.find((f) => f !== a) ?? b;
    }
  }
  return [a, b];
}

const farEnough = (candidate, chosen, minGap) =>
  chosen.every((value) => Math.abs(value - candidate) >= minGap);

// Build one multiple-choice question whose options are unique, at least `minGap`
// apart, within `maxProduct`, and (optionally) with non-square operands.
// Returns { a, b, correct, options } like makeQuestion.
export function buildPuzzle(settings, constraints = {}) {
  const factors = factorPoolFor(settings);
  const difficulty = resolveDifficulty(settings);
  const {
    count = settings.answerCount,
    minGap = defaultMinGap(settings),
    noSquare = false,
    maxProduct = difficulty.maxFactor * difficulty.maxFactor,
  } = constraints;

  const [a, b] = pickOperands(factors, { noSquare });
  const correct = a * b;
  const options = [correct];

  // Prefer plausible "table-like" products as distractors; this keeps wrong
  // answers pedagogically close (they look like real multiplication results).
  const tableProducts = [];
  for (const x of factors) {
    for (const y of factors) {
      const product = x * y;
      if (product > 0 && product <= maxProduct) {
        tableProducts.push(product);
      }
    }
  }

  const tryAdd = (candidate) => {
    if (
      candidate > 0 &&
      candidate <= maxProduct &&
      !options.includes(candidate) &&
      farEnough(candidate, options, minGap)
    ) {
      options.push(candidate);
      return true;
    }
    return false;
  };

  let guard = 0;
  while (options.length < count && guard < 600) {
    guard += 1;
    // Mix table-like products with small offsets around the correct answer.
    const candidate =
      Math.random() > 0.4 && tableProducts.length > 0
        ? pick(tableProducts)
        : correct + (Math.random() > 0.5 ? 1 : -1) * randomInt(minGap, minGap + difficulty.maxFactor);
    tryAdd(candidate);
  }

  // Deterministic fallback so we ALWAYS return `count` options even if the pool
  // is tiny: step away from the correct answer by multiples of the gap.
  let step = 1;
  while (options.length < count) {
    const up = correct + step * minGap;
    const down = correct - step * minGap;
    if (!tryAdd(up)) {
      tryAdd(down);
    }
    step += 1;
    if (step > count + 50) {
      break; // give up; extremely small pool — return what we have
    }
  }

  return {
    a,
    b,
    correct,
    options: options.slice(0, count).sort(() => Math.random() - 0.5),
  };
}

// Build a SET of `size` questions with DISTINCT correct results — used by games
// that show many facts at once (Zahlen-Memory pairs, Einmaleins-Bingo cells,
// Dreh-Zwillinge twins). Results are at least `minGap` apart so two tiles are
// never visually identical.
export function buildPuzzleSet(settings, constraints = {}) {
  const factors = factorPoolFor(settings);
  const {
    size = settings.answerCount,
    minGap = defaultMinGap(settings),
    noSquare = false,
  } = constraints;

  const items = [];
  const usedResults = [];
  let guard = 0;

  while (items.length < size && guard < 800) {
    guard += 1;
    const [a, b] = pickOperands(factors, { noSquare });
    const correct = a * b;
    if (usedResults.includes(correct)) {
      continue;
    }
    if (!usedResults.every((value) => Math.abs(value - correct) >= minGap)) {
      continue;
    }
    usedResults.push(correct);
    items.push({ a, b, correct });
  }

  return items;
}
