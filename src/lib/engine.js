// Pure game engine: multiplication-question generation, difficulty config,
// settings keys, and small math/format helpers. No React, no DOM — safe to
// import from the main game and from any mini-game.

export const DIFFICULTY_OPTIONS = [
  { id: 'small', label: 'Kleines Einmaleins', maxFactor: 10, description: 'bis 10 × 10' },
  { id: 'large', label: 'Großes Einmaleins', maxFactor: 20, description: 'bis 20 × 20' },
];

export const ROUTE_OPTIONS = [
  { id: 'short', label: 'Kurz', meters: 300, stops: 5 },
  { id: 'medium', label: 'Mittel', meters: 500, stops: 7 },
  { id: 'long', label: 'Lang', meters: 800, stops: 10 },
];

export const ANSWER_COUNT_OPTIONS = [4, 6, 8];

export const OPERATION_OPTIONS = [
  { id: 'add', symbol: '+', label: 'Plus' },
  { id: 'subtract', symbol: '-', label: 'Minus' },
  { id: 'multiply', symbol: 'x', label: 'Mal' },
  { id: 'divide', symbol: '/', label: 'Geteilt' },
];

export const DEFAULT_OPERATIONS = {
  add: true,
  subtract: true,
  multiply: true,
  divide: false,
};

export const DEFAULT_SETTINGS = {
  difficulty: 'small',
  skipEasyRows: false,
  skipTenRow: false,
  routeLength: 'medium',
  answerCount: 4,
  operations: DEFAULT_OPERATIONS,
};

export const FINISH_PROGRESS = 100;

export const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const formatSeconds = (seconds) => `${seconds.toFixed(1)} s`;
export const makeCheckpoints = (stops) =>
  Array.from({ length: stops }, (_, index) => Math.round(((index + 1) / (stops + 1)) * FINISH_PROGRESS));

export const makeFactorPool = (settings, maxFactor) => {
  const minFactor = settings.skipEasyRows ? 3 : 1;
  return Array.from({ length: maxFactor - minFactor + 1 }, (_, index) => minFactor + index).filter(
    (factor) => !(settings.skipTenRow && factor === 10),
  );
};

// Resolve the active difficulty's maxFactor, then build the factor pool.
// Mini-games should call this instead of makeFactorPool(settings): passing a
// single argument leaves maxFactor undefined and yields an empty pool.
export const factorPoolFor = (settings) => {
  const difficulty = DIFFICULTY_OPTIONS.find((option) => option.id === settings.difficulty) ?? DIFFICULTY_OPTIONS[0];
  return makeFactorPool(settings, difficulty.maxFactor);
};

export const pickFactor = (factors) => factors[randomInt(0, factors.length - 1)];

export const makeSettingsKey = (settings) =>
  [
    settings.difficulty,
    settings.skipEasyRows ? 'ohne-1-2' : 'mit-1-2',
    settings.skipTenRow ? 'ohne-10' : 'mit-10',
    settings.routeLength,
    `${settings.answerCount}-antworten`,
  ].join('|');

export const formatFactorRange = (settings, maxFactor) => {
  const minFactor = settings.skipEasyRows ? 3 : 1;
  const effectiveMax = settings.skipTenRow && maxFactor === 10 ? 9 : maxFactor;
  const suffix = settings.skipTenRow && maxFactor > 10 ? ' ohne 10er' : '';
  return `${minFactor}er bis ${effectiveMax}er Reihe${suffix}`;
};

export function makeQuestion(settings) {
  const difficulty = DIFFICULTY_OPTIONS.find((option) => option.id === settings.difficulty) ?? DIFFICULTY_OPTIONS[0];
  const maxFactor = difficulty.maxFactor;
  const factors = makeFactorPool(settings, maxFactor);
  const a = pickFactor(factors);
  const b = pickFactor(factors);
  const correct = a * b;
  const options = new Set([correct]);

  while (options.size < settings.answerCount) {
    const drift = randomInt(-(maxFactor + 4), maxFactor + 4);
    const nearby = correct + drift;
    const tableLike = pickFactor(factors) * pickFactor(factors);
    const candidate = Math.random() > 0.45 ? nearby : tableLike;

    if (candidate > 0 && candidate !== correct) {
      options.add(candidate);
    }
  }

  return {
    a,
    b,
    correct,
    options: [...options].sort(() => Math.random() - 0.5),
  };
}
