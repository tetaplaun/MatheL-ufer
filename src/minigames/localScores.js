// localStorage-backed best-score store for mini-games (docs §6: "start local").
//
// Each game keeps ONE best record per score key (see scoreKey.js). A record is
// { value, mode, date, meta? }. `mode` decides what "best" means:
//   * 'highscore' — higher value wins (blitz hits, points, combo).
//   * 'time'      — lower value wins (completion seconds; ties broken outside).
// All access is guarded so a disabled/again private-mode localStorage degrades
// to "no saved score" rather than throwing.

const STORAGE_PREFIX = 'mathelaeufer-minigame-';

const storageKey = (scoreKey) => `${STORAGE_PREFIX}${scoreKey}`;

export function loadBestScore(scoreKey) {
  if (!scoreKey || typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(storageKey(scoreKey));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.value !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Returns whether `value` beats the stored best for the given mode.
export function isNewBest(scoreKey, value, mode = 'highscore') {
  const best = loadBestScore(scoreKey);
  if (!best || typeof best.value !== 'number') {
    return true;
  }
  return mode === 'time' ? value < best.value : value > best.value;
}

// Persist `value` only if it beats the stored best. Returns the record now
// considered best (existing or freshly written) plus whether it was a record.
export function saveBestScore(scoreKey, value, { mode = 'highscore', date, meta } = {}) {
  const previous = loadBestScore(scoreKey);
  const record = { value, mode, date: date ?? null, meta: meta ?? null };

  const beatsPrevious =
    !previous || typeof previous.value !== 'number'
      ? true
      : mode === 'time'
        ? value < previous.value
        : value > previous.value;

  if (!beatsPrevious) {
    return { best: previous, isRecord: false };
  }

  if (scoreKey && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(storageKey(scoreKey), JSON.stringify(record));
    } catch {
      // In-memory result is still returned even if persistence fails.
    }
  }
  return { best: record, isRecord: true };
}
