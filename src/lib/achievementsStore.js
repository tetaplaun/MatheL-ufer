// Persistence for per-user achievement progress. Reads/writes a single
// `user_progress` row through the AUTHENTICATED Supabase client (the JWT is
// attached automatically, so the per-user RLS policies apply), with a
// localStorage write-through cache for instant paint and offline resilience.
//
// Unlike leaderboard.js (public table, raw REST + anon key), this data is
// private to each logged-in user, so it must go through the session client.

import { supabase } from './supabaseClient.js';

const PROGRESS_TABLE = 'user_progress';
const cacheKey = (userId) => `mathelaeufer-progress-${userId}`;

export const ACHIEVEMENTS_ENABLED = Boolean(supabase);

export const loadLocalProgress = (userId) => {
  if (!userId) {
    return null;
  }
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return { stats: parsed.stats ?? null, achievements: parsed.achievements ?? {} };
  } catch {
    return null;
  }
};

export const saveLocalProgress = (userId, progress) => {
  if (!userId) {
    return;
  }
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(progress));
  } catch {
    // In-memory state still updates if browser storage is unavailable.
  }
};

// Fetch the user's row. Returns { stats, achievements } or null when there is
// no row yet. Throws when the request fails so the caller can fall back to the
// local cache and flag an offline state.
export const loadRemoteProgress = async (userId) => {
  if (!supabase || !userId) {
    return null;
  }
  const { data, error } = await supabase
    .from(PROGRESS_TABLE)
    .select('stats,achievements')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'user_progress could not be loaded.');
  }
  if (!data) {
    return null;
  }
  return { stats: data.stats ?? null, achievements: data.achievements ?? {} };
};

// Upsert the user's single progress row. Throws on failure.
export const saveRemoteProgress = async (userId, progress) => {
  if (!supabase || !userId) {
    return;
  }
  const { error } = await supabase
    .from(PROGRESS_TABLE)
    .upsert(
      { user_id: userId, stats: progress.stats, achievements: progress.achievements },
      { onConflict: 'user_id' },
    );

  if (error) {
    throw new Error(error.message || 'user_progress could not be saved.');
  }
};
