// Local score-key builder for mini-games (docs/mini-games-design.md §6).
//
// Mini-game scores are stored in localStorage only at MVP. The key must capture
// every setting that changes the challenge so two different configs don't share
// a board — but it must NOT include route length for arcade games that ignore
// it, otherwise the hub (which hides the route control for non-route games)
// would silently split one board into short/medium/long buckets.

// The games whose difficulty genuinely depends on route length. Only these
// include `routeLength` in their score key.
export const ROUTE_SHAPED_GAME_IDS = ['bruecken', 'zahlenhuepfer'];

export const isRouteShapedGame = (gameId) => ROUTE_SHAPED_GAME_IDS.includes(gameId);

// Build a stable localStorage key for one game + settings combination.
// `includeRoute` defaults to whether the game is route-shaped, but a caller can
// force it either way.
export function makeMiniGameScoreKey(gameId, settings, { includeRoute } = {}) {
  const withRoute = includeRoute ?? isRouteShapedGame(gameId);
  const parts = [
    gameId,
    settings.difficulty,
    settings.skipEasyRows ? 'ohne-1-2' : 'mit-1-2',
    settings.skipTenRow ? 'ohne-10' : 'mit-10',
    `${settings.answerCount}-antworten`,
  ];
  if (withRoute) {
    parts.push(settings.routeLength);
  }
  return parts.join('|');
}
