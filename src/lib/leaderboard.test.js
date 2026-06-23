import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEADERBOARD_LIMIT,
  SUPABASE_ENABLED,
  addLeaderboardRanks,
  compareLeaderboardEntries,
  loadLastPlayerName,
  loadLeaderboard,
  loadSupabaseLeaderboard,
  mergeLeaderboardEntries,
  persistLocalLeaderboard,
  saveLastPlayerName,
  saveSupabaseLeaderboardEntry,
} from './leaderboard.js';

const makeEntry = (overrides = {}) => ({
  id: 'id',
  name: 'Spieler',
  settingsKey: 'k',
  totalSeconds: 10,
  mistakes: 0,
  averageAnswerSeconds: 2,
  ...overrides,
});

describe('compareLeaderboardEntries', () => {
  it('orders by time, then mistakes, then average answer time', () => {
    const a = makeEntry({ totalSeconds: 10, mistakes: 1, averageAnswerSeconds: 2 });
    const b = makeEntry({ totalSeconds: 12, mistakes: 0, averageAnswerSeconds: 1 });
    const c = makeEntry({ totalSeconds: 10, mistakes: 0, averageAnswerSeconds: 5 });
    const d = makeEntry({ totalSeconds: 10, mistakes: 0, averageAnswerSeconds: 3 });
    const sorted = [a, b, c, d].sort(compareLeaderboardEntries);
    expect(sorted).toEqual([d, c, a, b]);
  });
});

describe('addLeaderboardRanks', () => {
  it('gives tied scores the same rank and skips ranks after ties', () => {
    const ranked = addLeaderboardRanks([
      makeEntry({ id: '1', totalSeconds: 10, mistakes: 0 }),
      makeEntry({ id: '2', totalSeconds: 10, mistakes: 0 }),
      makeEntry({ id: '3', totalSeconds: 11, mistakes: 0 }),
    ]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1, 3]);
  });
});

describe('mergeLeaderboardEntries', () => {
  it('keeps other settings, replaces the target key, and sorts the replacement', () => {
    const existing = [
      makeEntry({ id: 'other', settingsKey: 'other', totalSeconds: 5 }),
      makeEntry({ id: 'old', settingsKey: 'k', totalSeconds: 99 }),
    ];
    const replacement = [
      makeEntry({ id: 'slow', settingsKey: 'k', totalSeconds: 20 }),
      makeEntry({ id: 'fast', settingsKey: 'k', totalSeconds: 8 }),
    ];
    const merged = mergeLeaderboardEntries(existing, 'k', replacement);
    expect(merged.find((entry) => entry.settingsKey === 'other')).toBeTruthy();
    expect(merged.some((entry) => entry.id === 'old')).toBe(false);
    const kEntries = merged.filter((entry) => entry.settingsKey === 'k');
    expect(kEntries.map((entry) => entry.id)).toEqual(['fast', 'slow']);
  });

  it('caps the replacement at the leaderboard limit', () => {
    const replacement = Array.from({ length: LEADERBOARD_LIMIT + 25 }, (_, index) =>
      makeEntry({ id: `e${index}`, settingsKey: 'k', totalSeconds: index }),
    );
    const merged = mergeLeaderboardEntries([], 'k', replacement);
    expect(merged).toHaveLength(LEADERBOARD_LIMIT);
  });
});

describe('localStorage persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips the leaderboard', () => {
    const entries = [makeEntry({ id: '1' }), makeEntry({ id: '2', totalSeconds: 7 })];
    persistLocalLeaderboard(entries);
    expect(loadLeaderboard()).toEqual(entries);
  });

  it('returns an empty array when nothing is stored', () => {
    expect(loadLeaderboard()).toEqual([]);
  });

  it('returns an empty array when the stored value is corrupt', () => {
    localStorage.setItem('mathelaeufer-leaderboard', '{not valid json');
    expect(loadLeaderboard()).toEqual([]);
  });

  it('round-trips the last player name', () => {
    expect(loadLastPlayerName()).toBe('');
    saveLastPlayerName('Mia');
    expect(loadLastPlayerName()).toBe('Mia');
  });
});

describe('Supabase wrappers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is enabled when the public env vars are present', () => {
    expect(SUPABASE_ENABLED).toBe(true);
  });

  it('loads and maps rows from the REST API', async () => {
    const row = {
      id: 'row-1',
      player_name: 'Mia',
      settings_key: 'k',
      difficulty_label: 'Kleines Einmaleins',
      factor_range_label: '1er bis 10er Reihe',
      route_label: 'Mittel',
      route_meters: '500',
      stops: '7',
      answer_count: '4',
      total_seconds: '12.3',
      mistakes: '2',
      average_answer_seconds: '3.1',
      fastest_answer_seconds: '1.2',
      top_speed: '9.4',
      created_at: '2024-05-01T00:00:00Z',
    };
    fetch.mockResolvedValue({ ok: true, json: async () => [row] });

    const result = await loadSupabaseLeaderboard('k');

    const url = fetch.mock.calls[0][0];
    expect(url).toContain('https://test.supabase.co/rest/v1/leaderboard_entries');
    expect(url).toContain('settings_key=eq.k');
    expect(result).toEqual([
      {
        id: 'row-1',
        name: 'Mia',
        date: '2024-05-01T00:00:00Z',
        settingsKey: 'k',
        difficultyLabel: 'Kleines Einmaleins',
        factorRangeLabel: '1er bis 10er Reihe',
        routeLabel: 'Mittel',
        routeMeters: 500,
        stops: 7,
        answerCount: 4,
        totalSeconds: 12.3,
        mistakes: 2,
        averageAnswerSeconds: 3.1,
        fastestAnswerSeconds: 1.2,
        topSpeed: 9.4,
      },
    ]);
  });

  it('throws when the load response is not ok', async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => [] });
    await expect(loadSupabaseLeaderboard('k')).rejects.toThrow();
  });

  it('posts a mapped entry and returns the saved row', async () => {
    const entry = makeEntry({
      id: 'local',
      name: 'Mia',
      difficultyLabel: 'Kleines Einmaleins',
      factorRangeLabel: '1er bis 10er Reihe',
      routeLabel: 'Mittel',
      routeMeters: 500,
      stops: 7,
      answerCount: 4,
      totalSeconds: 12.3,
      mistakes: 2,
      averageAnswerSeconds: 3.1,
      fastestAnswerSeconds: 1.2,
      topSpeed: 9.4,
    });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'server-1',
          player_name: 'Mia',
          settings_key: 'k',
          total_seconds: '12.3',
          mistakes: '2',
          created_at: '2024-05-01T00:00:00Z',
        },
      ],
    });

    const saved = await saveSupabaseLeaderboardEntry(entry);

    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://test.supabase.co/rest/v1/leaderboard_entries');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ player_name: 'Mia', settings_key: 'k', total_seconds: 12.3, mistakes: 2 });
    expect(saved).toMatchObject({ id: 'server-1', name: 'Mia' });
  });

  it('throws when the save response is not ok', async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => [] });
    await expect(saveSupabaseLeaderboardEntry(makeEntry())).rejects.toThrow();
  });
});
