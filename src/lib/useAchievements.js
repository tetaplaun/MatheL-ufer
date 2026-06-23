'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  EMPTY_STATS,
  TOTAL_ACHIEVEMENTS,
  accumulateStats,
  achievementProgress,
  diffUnlocked,
  mergeAchievementMaps,
  mergeStats,
} from './achievements.js';
import {
  ACHIEVEMENTS_ENABLED,
  loadLocalProgress,
  loadRemoteProgress,
  saveLocalProgress,
  saveRemoteProgress,
} from './achievementsStore.js';

// Achievement state for the logged-in user. Hydrates from the localStorage
// cache instantly, then reconciles with Supabase. `recordGameResult` is the one
// entry point every game (the race today, mini-games later) calls when a game
// ends. The hook is a no-op when auth is unavailable or the user is logged out,
// so callers can always call it unconditionally.
export function useAchievements(auth) {
  const enabled = ACHIEVEMENTS_ENABLED && Boolean(auth?.isLoggedIn);
  const userId = auth?.user?.id ?? null;

  const [stats, setStats] = useState(EMPTY_STATS);
  const [earnedMap, setEarnedMap] = useState({});
  const [ready, setReady] = useState(!ACHIEVEMENTS_ENABLED);
  const [recentlyUnlocked, setRecentlyUnlocked] = useState([]);
  const [lastUnlockedIds, setLastUnlockedIds] = useState([]);

  // Mirror of the persisted state, read synchronously by recordGameResult so it
  // never works from a stale render closure.
  const progressRef = useRef({ stats: EMPTY_STATS, achievements: {} });

  const applyProgress = useCallback((nextStats, nextMap) => {
    progressRef.current = { stats: nextStats, achievements: nextMap };
    setStats(nextStats);
    setEarnedMap(nextMap);
  }, []);

  useEffect(() => {
    let active = true;

    if (!ACHIEVEMENTS_ENABLED || !auth?.isLoggedIn || !userId) {
      applyProgress(EMPTY_STATS, {});
      setRecentlyUnlocked([]);
      setLastUnlockedIds([]);
      setReady(true);
      return undefined;
    }

    setReady(false);

    const local = loadLocalProgress(userId);
    const localStats = local?.stats ? mergeStats(EMPTY_STATS, local.stats) : null;
    const localMap = local?.achievements ?? {};
    if (localStats) {
      applyProgress(localStats, localMap);
    }

    loadRemoteProgress(userId)
      .then((remote) => {
        if (!active) {
          return;
        }
        // The server is the source of truth. A successful fetch that returns no
        // row means progress was intentionally cleared (account reset) or never
        // existed — reset and drop the local cache, otherwise a stale cache
        // would resurrect deleted progress on the next load.
        if (!remote) {
          applyProgress(EMPTY_STATS, {});
          saveLocalProgress(userId, { stats: EMPTY_STATS, achievements: {} });
          setReady(true);
          return;
        }

        const remoteStats = remote.stats ?? null;
        const remoteMap = remote.achievements ?? {};
        const finalStats = mergeStats(localStats, remoteStats);
        const finalMap = mergeAchievementMaps(remoteMap, localMap);
        applyProgress(finalStats, finalMap);
        setReady(true);

        saveLocalProgress(userId, { stats: finalStats, achievements: finalMap });

        // Push back to Supabase only when the local cache held progress the
        // server was missing (offline play), so we don't write on every login.
        const localAhead =
          (localStats?.gamesPlayed ?? 0) > (remoteStats?.gamesPlayed ?? 0) ||
          Object.keys(localMap).some((id) => !(id in remoteMap));
        if (localAhead) {
          saveRemoteProgress(userId, { stats: finalStats, achievements: finalMap }).catch(() => {});
        }
      })
      .catch(() => {
        if (!active) {
          return;
        }
        // Offline / fetch failed: keep whatever the local cache gave us.
        setReady(true);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.isLoggedIn, userId, applyProgress]);

  const recordGameResult = useCallback(
    (result) => {
      if (!ACHIEVEMENTS_ENABLED || !auth?.isLoggedIn || !userId || !result) {
        return;
      }
      const current = progressRef.current;
      const nextStats = accumulateStats(current.stats, result);
      const nowIso = new Date().toISOString();
      const { nextMap, newlyUnlocked } = diffUnlocked(current.achievements, nextStats, nowIso);

      applyProgress(nextStats, nextMap);
      setLastUnlockedIds(newlyUnlocked);
      if (newlyUnlocked.length > 0) {
        setRecentlyUnlocked((queue) => [
          ...queue,
          ...newlyUnlocked.map((id) => ACHIEVEMENTS_BY_ID[id]).filter(Boolean),
        ]);
      }

      saveLocalProgress(userId, { stats: nextStats, achievements: nextMap });
      saveRemoteProgress(userId, { stats: nextStats, achievements: nextMap }).catch(() => {});
    },
    [auth?.isLoggedIn, userId, applyProgress],
  );

  const dismissUnlocked = useCallback(() => {
    setRecentlyUnlocked((queue) => queue.slice(1));
  }, []);

  const list = useMemo(
    () =>
      ACHIEVEMENTS.map((achievement) => ({
        id: achievement.id,
        title: achievement.title,
        description: achievement.description,
        icon: achievement.icon,
        tier: achievement.tier,
        category: achievement.category,
        unlocked: achievement.id in earnedMap,
        earnedAt: earnedMap[achievement.id] ?? null,
        progress: achievementProgress(achievement, stats),
      })),
    [stats, earnedMap],
  );

  const unlockedCount = useMemo(() => ACHIEVEMENTS.filter((a) => a.id in earnedMap).length, [earnedMap]);

  const lastUnlocked = useMemo(
    () => lastUnlockedIds.map((id) => ACHIEVEMENTS_BY_ID[id]).filter(Boolean),
    [lastUnlockedIds],
  );

  return {
    enabled,
    ready,
    stats,
    list,
    unlockedCount,
    totalCount: TOTAL_ACHIEVEMENTS,
    recentlyUnlocked,
    dismissUnlocked,
    lastUnlocked,
    recordGameResult,
  };
}
