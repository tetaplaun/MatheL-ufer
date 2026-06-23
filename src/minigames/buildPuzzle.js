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

const shuffle = (arr) => {
  const next = arr.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

function buildProductEntries(settings, { noSquare = false, maxProduct } = {}) {
  const factors = factorPoolFor(settings);
  const difficulty = resolveDifficulty(settings);
  const cap = maxProduct ?? difficulty.maxFactor * difficulty.maxFactor;
  const entries = [];

  for (const a of factors) {
    for (const b of factors) {
      const product = a * b;
      if ((!noSquare || a !== b) && product > 0 && product <= cap) {
        entries.push({ a, b, product });
      }
    }
  }

  return shuffle(entries);
}

function uniqueProductEntries(settings, options = {}) {
  const seen = new Set();
  const entries = [];

  for (const entry of buildProductEntries(settings, options)) {
    if (seen.has(entry.product)) {
      continue;
    }
    seen.add(entry.product);
    entries.push(entry);
  }

  return entries;
}

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

// Build a bingo/product grid with one unique product per cell. Each cell carries
// one operand pair that makes the product so the game can ask "a x b = ?".
export function buildProductGrid(settings, constraints = {}) {
  const { cellCount = settings.answerCount, noSquare = false, maxProduct } = constraints;
  const entries = uniqueProductEntries(settings, { noSquare, maxProduct }).slice(0, cellCount);

  return entries.map((entry, index) => ({
    id: `cell-${index}`,
    a: entry.a,
    b: entry.b,
    value: entry.product,
  }));
}

// Build one commutativity puzzle: the child sees a x b and must choose b x a.
// Distractors avoid the same product so "same amount" never competes with the
// exact turned twin.
export function buildTwinPuzzle(settings, constraints = {}) {
  const { count = settings.answerCount } = constraints;
  const factors = factorPoolFor(settings);
  const [a, b] = pickOperands(factors, { noSquare: true });
  const targetProduct = a * b;
  const options = [{ a: b, b: a, product: targetProduct, correct: true }];
  const usedPairs = new Set([`${b}x${a}`]);

  let guard = 0;
  while (options.length < count && guard < 600) {
    guard += 1;
    const [x, y] = pickOperands(factors, { noSquare: true });
    const product = x * y;
    if (product === targetProduct) {
      continue;
    }

    const option = Math.random() > 0.5 ? { a: x, b: y } : { a: y, b: x };
    const key = `${option.a}x${option.b}`;
    if (usedPairs.has(key)) {
      continue;
    }

    usedPairs.add(key);
    options.push({ ...option, product, correct: false });
  }

  return {
    a,
    b,
    correct: { a: b, b: a, product: targetProduct },
    options: shuffle(options).map((option, index) => ({ ...option, id: `twin-${index}` })),
  };
}

// Reverse recall: the child sees a product and chooses the factor pair that
// makes it. Exactly one option has product === target.
export function buildFactorPairPuzzle(settings, constraints = {}) {
  const { count = settings.answerCount, noSquare = false } = constraints;
  const factors = factorPoolFor(settings);
  const [a, b] = pickOperands(factors, { noSquare });
  const target = a * b;
  const options = [{ a, b, product: target, correct: true }];
  const usedProducts = new Set([target]);
  const usedPairs = new Set([`${a}x${b}`]);

  let guard = 0;
  while (options.length < count && guard < 800) {
    guard += 1;
    const [x, y] = pickOperands(factors, { noSquare });
    const product = x * y;
    const key = `${x}x${y}`;
    if (product === target || usedProducts.has(product) || usedPairs.has(key)) {
      continue;
    }
    usedProducts.add(product);
    usedPairs.add(key);
    options.push({ a: x, b: y, product, correct: false });
  }

  return {
    target,
    correct: { a, b, product: target },
    options: shuffle(options).map((option, index) => ({ ...option, id: `factor-${index}` })),
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
