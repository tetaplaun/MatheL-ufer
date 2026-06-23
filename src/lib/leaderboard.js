// Leaderboard ranking + persistence for Mathe Läufer scores. Talks to the
// public Supabase REST API with the anon key, and falls back to localStorage.
// No React — safe to import from anywhere.

const LEADERBOARD_KEY = 'mathelaeufer-leaderboard';
const LAST_PLAYER_NAME_KEY = 'mathelaeufer-last-player-name';
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SUPABASE_LEADERBOARD_TABLE = 'leaderboard_entries';

export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const LEADERBOARD_LIMIT = 100;

export const compareLeaderboardEntries = (a, b) =>
  a.totalSeconds - b.totalSeconds || a.mistakes - b.mistakes || a.averageAnswerSeconds - b.averageAnswerSeconds;
const makeLeaderboardScoreKey = (entry) => `${Math.round(entry.totalSeconds * 10)}|${entry.mistakes}`;
export const addLeaderboardRanks = (entries) => {
  let lastScoreKey = '';
  let currentRank = 0;

  return entries.map((entry, index) => {
    const scoreKey = makeLeaderboardScoreKey(entry);

    if (scoreKey !== lastScoreKey) {
      currentRank = index + 1;
      lastScoreKey = scoreKey;
    }

    return {
      ...entry,
      rank: currentRank,
    };
  });
};
export const mergeLeaderboardEntries = (entries, settingsKey, nextSettingEntries) => [
  ...entries.filter((entry) => entry.settingsKey !== settingsKey),
  ...nextSettingEntries.sort(compareLeaderboardEntries).slice(0, LEADERBOARD_LIMIT),
];
export const persistLocalLeaderboard = (entries) => {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
  } catch {
    // The in-memory list still updates if browser storage is unavailable.
  }
};
export const loadLeaderboard = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
export const loadLastPlayerName = () => {
  try {
    return localStorage.getItem(LAST_PLAYER_NAME_KEY) ?? '';
  } catch {
    return '';
  }
};
export const saveLastPlayerName = (name) => {
  try {
    localStorage.setItem(LAST_PLAYER_NAME_KEY, name);
  } catch {
    // Keeping the current field value is enough if browser storage is unavailable.
  }
};
const supabaseHeaders = () => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
});
const mapSupabaseEntry = (row) => ({
  id: row.id,
  name: row.player_name,
  date: row.created_at,
  settingsKey: row.settings_key,
  difficultyLabel: row.difficulty_label,
  factorRangeLabel: row.factor_range_label,
  routeLabel: row.route_label,
  routeMeters: Number(row.route_meters) || 0,
  stops: Number(row.stops) || 0,
  answerCount: Number(row.answer_count) || 0,
  totalSeconds: Number(row.total_seconds) || 0,
  mistakes: Number(row.mistakes) || 0,
  averageAnswerSeconds: Number(row.average_answer_seconds) || 0,
  fastestAnswerSeconds: Number(row.fastest_answer_seconds) || 0,
  topSpeed: Number(row.top_speed) || 0,
});
const mapEntryToSupabase = (entry) => ({
  player_name: entry.name,
  settings_key: entry.settingsKey,
  difficulty_label: entry.difficultyLabel,
  factor_range_label: entry.factorRangeLabel,
  route_label: entry.routeLabel,
  route_meters: entry.routeMeters,
  stops: entry.stops,
  answer_count: entry.answerCount,
  total_seconds: entry.totalSeconds,
  mistakes: entry.mistakes,
  average_answer_seconds: entry.averageAnswerSeconds,
  fastest_answer_seconds: entry.fastestAnswerSeconds,
  top_speed: entry.topSpeed,
});
export const loadSupabaseLeaderboard = async (settingsKey) => {
  const params = new URLSearchParams({
    select:
      'id,player_name,settings_key,difficulty_label,factor_range_label,route_label,route_meters,stops,answer_count,total_seconds,mistakes,average_answer_seconds,fastest_answer_seconds,top_speed,created_at',
    settings_key: `eq.${settingsKey}`,
    order: 'total_seconds.asc,mistakes.asc,average_answer_seconds.asc',
    limit: String(LEADERBOARD_LIMIT),
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_LEADERBOARD_TABLE}?${params.toString()}`, {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    throw new Error('Supabase leaderboard could not be loaded.');
  }

  const rows = await response.json();
  return rows.map(mapSupabaseEntry);
};
export const saveSupabaseLeaderboardEntry = async (entry) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_LEADERBOARD_TABLE}`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(mapEntryToSupabase(entry)),
  });

  if (!response.ok) {
    throw new Error('Supabase leaderboard entry could not be saved.');
  }

  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? mapSupabaseEntry(rows[0]) : entry;
};
