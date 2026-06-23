// Pure achievement engine for Mathe Läufer. No React, no DOM, no network —
// safe to import from the main game, any mini-game, and unit tests.
//
// The system is intentionally game-agnostic: every game (the main race today,
// the mini-games tomorrow) emits a generic `result` event; this module folds it
// into a cumulative `stats` snapshot and decides which badges are newly earned.
// A new mini-game plugs in by emitting a `result` with its own `gameId` plus
// (optionally) one new catalog row — no changes to the reducer are needed.

export const STATS_VERSION = 1;
export const ROW_MASTERY_THRESHOLD = 12;

// The committed mini-games (docs/mini-games-design.md §4.1). These ids are
// forward-looking: the games are not built yet, so achievements that reference
// them stay locked until the matching game ships and emits a result with the
// same gameId. When a mini-game is built it MUST use its id from this list.
export const MINI_GAME_IDS = [
  'antwortkarten',
  'drache',
  'bruecken',
  'memory',
  'regen',
  'blitz',
  'bingo',
  'drehzwillinge',
  'faktorenfinder',
  'zahlenhuepfer',
  'rechendetektiv',
  'teilerei',
  'fehlerfabrik',
  'roboterprogramm',
];

export const EMPTY_STATS = {
  version: STATS_VERSION,
  gamesPlayed: 0,
  gamesByGameId: {}, // { race: 12, blitz: 4, ... }
  racesCompleted: 0,
  correctTotal: 0,
  wrongTotal: 0, // sum of distinct wrong options chosen (documented proxy)
  perfectGames: 0,
  bestFlawlessRun: 0, // longest run of mistake-free answers within one game
  bestStreak: 0, // mini-game miss-streak only (the race never writes this)
  fastestAnswerSeconds: null, // minimum single-answer time seen (null = none)
  topSpeed: 0, // maximum runner speed reached (m/s)
  tableCorrect: {}, // { factor: count } incremented per correct-answer operand
  perGameBest: {}, // { gameId: { score, maxCombo, bestStreak, plays, wins, survived } }
  modesPlayed: [], // distinct gameId list (breadth)
  totalCorrectInLargeMode: 0,
  dayStreak: 0,
  longestDayStreak: 0,
  lastPlayedDate: null, // 'YYYY-MM-DD' (UTC date of the last recorded game)
};

export const TIERS = ['bronze', 'silver', 'gold'];

export const CATEGORY_ORDER = [
  'first-steps',
  'volume',
  'perfection',
  'speed',
  'streak',
  'row-mastery',
  'breadth',
  'mini-game',
  'habit',
];

export const CATEGORY_LABELS = {
  'first-steps': 'Erste Schritte',
  volume: 'Fleiß',
  perfection: 'Perfektion',
  speed: 'Tempo',
  streak: 'Serien',
  'row-mastery': 'Reihen',
  breadth: 'Vielfalt',
  'mini-game': 'Mini-Spiele',
  habit: 'Dranbleiben',
};

const countMasteredRows = (stats) =>
  Object.values(stats.tableCorrect ?? {}).filter((count) => count >= ROW_MASTERY_THRESHOLD).length;

const countRowsMasteredInRange = (stats, max) => {
  const table = stats.tableCorrect ?? {};
  let count = 0;
  for (let factor = 1; factor <= max; factor += 1) {
    if ((table[factor] ?? 0) >= ROW_MASTERY_THRESHOLD) {
      count += 1;
    }
  }
  return count;
};

const countMiniGamesPlayed = (stats) =>
  MINI_GAME_IDS.filter((id) => (stats.modesPlayed ?? []).includes(id)).length;

// Each achievement exposes `metric(stats)` and a `target`. It is unlocked when
// metric >= target; the gallery shows progress as min(metric, target)/target.
// "Lower is better" speed badges express metric as 0/1 with target 1.
export const ACHIEVEMENTS = [
  {
    id: 'first_race',
    title: 'Erster Lauf',
    description: 'Beende dein erstes Rennen.',
    icon: '🏁',
    tier: 'bronze',
    category: 'first-steps',
    target: 1,
    metric: (s) => s.racesCompleted,
  },
  {
    id: 'first_minigame',
    title: 'Neues Spiel',
    description: 'Spiele dein erstes Mini-Spiel.',
    icon: '🎮',
    tier: 'bronze',
    category: 'first-steps',
    target: 1,
    metric: (s) => Object.keys(s.gamesByGameId ?? {}).filter((id) => id !== 'race').length,
  },
  {
    id: 'correct_50',
    title: 'Rechen-Starter',
    description: '50 richtige Antworten.',
    icon: '✏️',
    tier: 'bronze',
    category: 'volume',
    target: 50,
    metric: (s) => s.correctTotal,
  },
  {
    id: 'correct_250',
    title: 'Rechen-Profi',
    description: '250 richtige Antworten.',
    icon: '📘',
    tier: 'silver',
    category: 'volume',
    target: 250,
    metric: (s) => s.correctTotal,
  },
  {
    id: 'correct_1000',
    title: 'Rechen-Meister',
    description: '1000 richtige Antworten.',
    icon: '🧠',
    tier: 'gold',
    category: 'volume',
    target: 1000,
    metric: (s) => s.correctTotal,
  },
  {
    id: 'races_10',
    title: 'Dauerläufer',
    description: 'Beende 10 Rennen.',
    icon: '👟',
    tier: 'silver',
    category: 'volume',
    target: 10,
    metric: (s) => s.racesCompleted,
  },
  {
    id: 'races_50',
    title: 'Marathon-Held',
    description: 'Beende 50 Rennen.',
    icon: '🦸',
    tier: 'gold',
    category: 'volume',
    target: 50,
    metric: (s) => s.racesCompleted,
  },
  {
    id: 'perfect_1',
    title: 'Fehlerfrei',
    description: 'Ein Spiel ohne Fehler.',
    icon: '💎',
    tier: 'bronze',
    category: 'perfection',
    target: 1,
    metric: (s) => s.perfectGames,
  },
  {
    id: 'perfect_10',
    title: 'Makellos',
    description: '10 Spiele ohne Fehler.',
    icon: '🌟',
    tier: 'gold',
    category: 'perfection',
    target: 10,
    metric: (s) => s.perfectGames,
  },
  {
    id: 'flawless_run_10',
    title: 'Volltreffer-Serie',
    description: '10 perfekte Aufgaben in Folge.',
    icon: '🎯',
    tier: 'silver',
    category: 'streak',
    target: 10,
    metric: (s) => s.bestFlawlessRun,
  },
  {
    id: 'fast_under_2',
    title: 'Blitz-Antwort',
    description: 'Antworte in unter 2 Sekunden.',
    icon: '⚡',
    tier: 'bronze',
    category: 'speed',
    target: 1,
    metric: (s) => (s.fastestAnswerSeconds != null && s.fastestAnswerSeconds <= 2 ? 1 : 0),
  },
  {
    id: 'fast_under_1',
    title: 'Gedankenblitz',
    description: 'Antworte in unter 1 Sekunde.',
    icon: '🌩️',
    tier: 'gold',
    category: 'speed',
    target: 1,
    metric: (s) => (s.fastestAnswerSeconds != null && s.fastestAnswerSeconds <= 1 ? 1 : 0),
  },
  {
    id: 'top_speed_15',
    title: 'Tempo-Teufel',
    description: 'Erreiche 15 m/s Tempo.',
    icon: '🚀',
    tier: 'silver',
    category: 'speed',
    target: 15,
    metric: (s) => s.topSpeed,
  },
  {
    id: 'rows_3',
    title: 'Reihen-Sammler',
    description: 'Beherrsche 3 Reihen.',
    icon: '🔢',
    tier: 'bronze',
    category: 'row-mastery',
    target: 3,
    metric: (s) => countMasteredRows(s),
  },
  {
    id: 'rows_6',
    title: 'Reihen-Kenner',
    description: 'Beherrsche 6 Reihen.',
    icon: '📊',
    tier: 'silver',
    category: 'row-mastery',
    target: 6,
    metric: (s) => countMasteredRows(s),
  },
  {
    id: 'rows_all10',
    title: 'Einmaleins-König',
    description: 'Beherrsche alle Reihen 1–10.',
    icon: '👑',
    tier: 'gold',
    category: 'row-mastery',
    target: 10,
    metric: (s) => countRowsMasteredInRange(s, 10),
  },
  {
    id: 'row_7_master',
    title: 'Meister der 7er',
    description: 'Die schwere 7er-Reihe gemeistert.',
    icon: '🍀',
    tier: 'silver',
    category: 'row-mastery',
    target: 20,
    metric: (s) => s.tableCorrect?.[7] ?? 0,
  },
  {
    id: 'large_mode_100',
    title: 'Große Zahlen',
    description: '100 Richtige im großen 1×1.',
    icon: '🐘',
    tier: 'silver',
    category: 'volume',
    target: 100,
    metric: (s) => s.totalCorrectInLargeMode,
  },
  {
    id: 'breadth_3',
    title: 'Spiele-Entdecker',
    description: 'Spiele 3 verschiedene Spiele.',
    icon: '🧭',
    tier: 'bronze',
    category: 'breadth',
    target: 3,
    metric: (s) => (s.modesPlayed ?? []).length,
  },
  {
    id: 'breadth_all',
    title: 'Alles gespielt',
    description: 'Spiele alle Mini-Spiele.',
    icon: '🗺️',
    tier: 'gold',
    category: 'breadth',
    target: MINI_GAME_IDS.length,
    metric: (s) => countMiniGamesPlayed(s),
  },
  {
    id: 'blitz_20',
    title: 'Blitz-Champion',
    description: '20 Treffer im 60-Sekunden-Blitz.',
    icon: '⏱️',
    tier: 'silver',
    category: 'mini-game',
    target: 20,
    metric: (s) => s.perGameBest?.blitz?.score ?? 0,
  },
  {
    id: 'daily_5',
    title: 'Treuer Läufer',
    description: 'Spiele an 5 Tagen hintereinander.',
    icon: '📅',
    tier: 'gold',
    category: 'habit',
    target: 5,
    metric: (s) => s.longestDayStreak,
  },
];

export const ACHIEVEMENTS_BY_ID = ACHIEVEMENTS.reduce((map, achievement) => {
  map[achievement.id] = achievement;
  return map;
}, {});

export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;

export const achievementProgress = (achievement, stats) => {
  const target = achievement.target;
  const current = Math.max(0, Math.min(achievement.metric(stats), target));
  return { current, target };
};

export const isAchievementUnlocked = (achievement, stats) => achievement.metric(stats) >= achievement.target;

// All achievement ids whose condition is currently satisfied by `stats`. This is
// a list of CANDIDATES; whether each is "newly" unlocked is decided by
// diffUnlocked against the authoritative earned-map.
export const evaluateAchievements = (stats) =>
  ACHIEVEMENTS.filter((achievement) => isAchievementUnlocked(achievement, stats)).map((a) => a.id);

// --- result -> stats reducer ------------------------------------------------

const dayDiff = (fromDate, toDate) => {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return null;
  }
  return Math.round((to - from) / 86400000);
};

const nextDayStreak = (stats, playedDate) => {
  const previousDate = stats.lastPlayedDate;
  if (!playedDate) {
    return { dayStreak: stats.dayStreak, longestDayStreak: stats.longestDayStreak, lastPlayedDate: previousDate };
  }
  if (!previousDate) {
    return { dayStreak: 1, longestDayStreak: Math.max(stats.longestDayStreak, 1), lastPlayedDate: playedDate };
  }

  const diff = dayDiff(previousDate, playedDate);
  let dayStreak = stats.dayStreak;
  let lastPlayedDate = previousDate;

  if (diff === 0) {
    // Same day: streak unchanged. Guarantee at least 1 for an existing day.
    dayStreak = Math.max(dayStreak, 1);
  } else if (diff === 1) {
    dayStreak += 1;
    lastPlayedDate = playedDate;
  } else if (diff > 1) {
    dayStreak = 1;
    lastPlayedDate = playedDate;
  } else {
    // diff < 0: clock moved backwards — do not inflate or reset, keep latest date.
    dayStreak = Math.max(dayStreak, 1);
  }

  return {
    dayStreak,
    longestDayStreak: Math.max(stats.longestDayStreak, dayStreak),
    lastPlayedDate,
  };
};

const minNullable = (a, b) => {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
};

// Fold a single game result into the cumulative stats snapshot. Pure: never
// mutates its input.
export const accumulateStats = (stats, result) => {
  const base = { ...EMPTY_STATS, ...stats };
  const gameId = result.gameId ?? 'unknown';
  const correct = result.correct ?? 0;
  const wrong = result.wrong ?? 0;

  const gamesByGameId = { ...base.gamesByGameId, [gameId]: (base.gamesByGameId[gameId] ?? 0) + 1 };

  const tableCorrect = { ...base.tableCorrect };
  for (const factor of result.factorsPracticed ?? []) {
    if (typeof factor === 'number' && Number.isFinite(factor)) {
      tableCorrect[factor] = (tableCorrect[factor] ?? 0) + 1;
    }
  }

  const modesPlayed = base.modesPlayed.includes(gameId) ? base.modesPlayed : [...base.modesPlayed, gameId];

  // Per-game bests: max for scores/combos/streaks, count plays/wins, OR survived.
  const previousBest = base.perGameBest[gameId] ?? {};
  const perGameBest = {
    ...base.perGameBest,
    [gameId]: {
      score: Math.max(previousBest.score ?? 0, result.score ?? 0),
      maxCombo: Math.max(previousBest.maxCombo ?? 0, result.maxCombo ?? 0),
      bestStreak: Math.max(previousBest.bestStreak ?? 0, result.bestStreak ?? 0),
      plays: (previousBest.plays ?? 0) + 1,
      wins: (previousBest.wins ?? 0) + (result.won ? 1 : 0),
      survived: Boolean(previousBest.survived) || Boolean(result.survived),
    },
  };

  const playedDate = typeof result.playedAt === 'string' ? result.playedAt.slice(0, 10) : null;
  const streak = nextDayStreak(base, playedDate);

  return {
    ...base,
    version: STATS_VERSION,
    gamesPlayed: base.gamesPlayed + 1,
    gamesByGameId,
    racesCompleted: base.racesCompleted + (gameId === 'race' && result.completed ? 1 : 0),
    correctTotal: base.correctTotal + correct,
    wrongTotal: base.wrongTotal + wrong,
    perfectGames: base.perfectGames + (result.perfect ? 1 : 0),
    bestFlawlessRun: Math.max(base.bestFlawlessRun, result.bestFlawlessRun ?? 0),
    bestStreak: Math.max(base.bestStreak, result.bestStreak ?? 0),
    fastestAnswerSeconds: minNullable(base.fastestAnswerSeconds, result.fastestAnswerSeconds ?? null),
    topSpeed: Math.max(base.topSpeed, result.topSpeed ?? 0),
    tableCorrect,
    perGameBest,
    modesPlayed,
    totalCorrectInLargeMode: base.totalCorrectInLargeMode + (result.difficulty === 'large' ? correct : 0),
    ...streak,
  };
};

// --- unlock diffing ---------------------------------------------------------

// Given the authoritative earned-map (id -> ISO date) and a fresh stats
// snapshot, return the updated map plus the ids that were earned *just now*.
// Only ids absent from the existing map can become "newly unlocked", and the
// earned date is stamped at this moment — so a wiped/rehydrated stats snapshot
// can never manufacture a fake new unlock.
export const diffUnlocked = (earnedMap, stats, nowIso) => {
  const previous = earnedMap ?? {};
  const candidates = evaluateAchievements(stats);
  const newlyUnlocked = candidates.filter((id) => !(id in previous));
  const nextMap = { ...previous };
  for (const id of newlyUnlocked) {
    nextMap[id] = nowIso;
  }
  return { nextMap, newlyUnlocked };
};

// Union of two earned-maps, keeping the EARLIEST earned date per id.
export const mergeAchievementMaps = (a, b) => {
  const result = { ...(a ?? {}) };
  for (const [id, date] of Object.entries(b ?? {})) {
    if (!(id in result) || (date && date < result[id])) {
      result[id] = date;
    }
  }
  return result;
};

const mergePerGameBest = (a = {}, b = {}) => {
  const result = {};
  for (const gameId of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const left = a[gameId] ?? {};
    const right = b[gameId] ?? {};
    result[gameId] = {
      score: Math.max(left.score ?? 0, right.score ?? 0),
      maxCombo: Math.max(left.maxCombo ?? 0, right.maxCombo ?? 0),
      bestStreak: Math.max(left.bestStreak ?? 0, right.bestStreak ?? 0),
      plays: Math.max(left.plays ?? 0, right.plays ?? 0),
      wins: Math.max(left.wins ?? 0, right.wins ?? 0),
      survived: Boolean(left.survived) || Boolean(right.survived),
    };
  }
  return result;
};

const mergeCountMaps = (a = {}, b = {}) => {
  const result = { ...a };
  for (const [key, value] of Object.entries(b)) {
    result[key] = Math.max(result[key] ?? 0, value);
  }
  return result;
};

// Reconcile two stats snapshots (e.g. local cache vs. remote) WITHOUT
// double-counting: the snapshot with more games played wins the plain counters
// (local is largely a cache of remote, so summing would double-count the shared
// history), while monotonic bests, mastery maps and breadth take the best of
// both so nothing earned offline is lost.
export const mergeStats = (a, b) => {
  if (!a) return b ? { ...EMPTY_STATS, ...b } : { ...EMPTY_STATS };
  if (!b) return { ...EMPTY_STATS, ...a };

  const left = { ...EMPTY_STATS, ...a };
  const right = { ...EMPTY_STATS, ...b };
  const primary = right.gamesPlayed >= left.gamesPlayed ? right : left;
  const secondary = primary === right ? left : right;

  const later =
    !secondary.lastPlayedDate || (primary.lastPlayedDate && primary.lastPlayedDate >= secondary.lastPlayedDate)
      ? primary
      : secondary;

  return {
    version: Math.max(left.version ?? 1, right.version ?? 1),
    gamesPlayed: primary.gamesPlayed,
    racesCompleted: primary.racesCompleted,
    correctTotal: primary.correctTotal,
    wrongTotal: primary.wrongTotal,
    perfectGames: primary.perfectGames,
    totalCorrectInLargeMode: primary.totalCorrectInLargeMode,
    gamesByGameId: mergeCountMaps(left.gamesByGameId, right.gamesByGameId),
    bestFlawlessRun: Math.max(left.bestFlawlessRun, right.bestFlawlessRun),
    bestStreak: Math.max(left.bestStreak, right.bestStreak),
    topSpeed: Math.max(left.topSpeed, right.topSpeed),
    fastestAnswerSeconds: minNullable(left.fastestAnswerSeconds, right.fastestAnswerSeconds),
    tableCorrect: mergeCountMaps(left.tableCorrect, right.tableCorrect),
    perGameBest: mergePerGameBest(left.perGameBest, right.perGameBest),
    modesPlayed: [...new Set([...left.modesPlayed, ...right.modesPlayed])],
    dayStreak: later.dayStreak,
    longestDayStreak: Math.max(left.longestDayStreak, right.longestDayStreak),
    lastPlayedDate: later.lastPlayedDate,
  };
};

// --- main-race adapter ------------------------------------------------------

const parseTask = (task) => {
  if (typeof task !== 'string') {
    return [];
  }
  // Tasks are formatted "a × b" with the U+00D7 multiplication sign.
  return task
    .split('×')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
};

// Convert a finished main race into the generic result event. The race has no
// fail state, so it contributes bestFlawlessRun (longest mistake-free run) and
// deliberately does NOT set bestStreak.
export const buildRaceResult = (raceSummary, answerStats, gameSettings, totalSeconds, playedAt) => {
  const factorsPracticed = [];
  let bestFlawlessRun = 0;
  let currentRun = 0;

  for (const answer of answerStats) {
    const [factorA, factorB] = parseTask(answer.task);
    if (factorA) {
      factorsPracticed.push(factorA);
    }
    if (factorB && factorB !== factorA) {
      factorsPracticed.push(factorB);
    }

    if ((answer.mistakes ?? 0) === 0) {
      currentRun += 1;
      bestFlawlessRun = Math.max(bestFlawlessRun, currentRun);
    } else {
      currentRun = 0;
    }
  }

  const correct = answerStats.length;
  const wrong = answerStats.reduce((sum, answer) => sum + (answer.mistakes ?? 0), 0);
  const perfect = correct > 0 && answerStats.every((answer) => (answer.mistakes ?? 0) === 0);

  return {
    gameId: 'race',
    mode: 'race',
    difficulty: gameSettings.difficulty,
    answerCount: gameSettings.answerCount,
    correct,
    wrong,
    perfect,
    bestFlawlessRun,
    fastestAnswerSeconds: correct > 0 ? raceSummary.fastestAnswerSeconds : null,
    topSpeed: raceSummary.topSpeed ?? 0,
    durationSeconds: totalSeconds ?? null,
    completed: true,
    factorsPracticed,
    playedAt,
  };
};
