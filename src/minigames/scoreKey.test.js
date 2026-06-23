import { describe, expect, it } from 'vitest';
import { isRouteShapedGame, makeMiniGameScoreKey } from './scoreKey.js';

const base = {
  difficulty: 'small',
  skipEasyRows: false,
  skipTenRow: false,
  routeLength: 'medium',
  answerCount: 4,
};

describe('makeMiniGameScoreKey', () => {
  it('includes gameId, difficulty, skip flags and answer count', () => {
    const key = makeMiniGameScoreKey('blitz', base);
    expect(key).toContain('blitz');
    expect(key).toContain('small');
    expect(key).toContain('mit-1-2');
    expect(key).toContain('mit-10');
    expect(key).toContain('4-antworten');
  });

  it('reflects the skip toggles', () => {
    const key = makeMiniGameScoreKey('blitz', { ...base, skipEasyRows: true, skipTenRow: true });
    expect(key).toContain('ohne-1-2');
    expect(key).toContain('ohne-10');
  });

  it('omits route length for non-route games so the hub-hidden route cannot split boards', () => {
    const short = makeMiniGameScoreKey('blitz', { ...base, routeLength: 'short' });
    const long = makeMiniGameScoreKey('blitz', { ...base, routeLength: 'long' });
    expect(short).toBe(long);
    expect(short).not.toContain('short');
  });

  it('includes route length for route-shaped games', () => {
    const short = makeMiniGameScoreKey('bruecken', { ...base, routeLength: 'short' });
    const long = makeMiniGameScoreKey('bruecken', { ...base, routeLength: 'long' });
    expect(short).not.toBe(long);
    expect(short).toContain('short');
    expect(long).toContain('long');
    expect(makeMiniGameScoreKey('zahlenhuepfer', { ...base, routeLength: 'short' })).toContain('short');
  });

  it('honours an explicit includeRoute override either way', () => {
    expect(makeMiniGameScoreKey('blitz', { ...base, routeLength: 'short' }, { includeRoute: true })).toContain(
      'short',
    );
    expect(
      makeMiniGameScoreKey('bruecken', { ...base, routeLength: 'short' }, { includeRoute: false }),
    ).not.toContain('short');
  });

  it('is stable for identical settings and differs for different ones', () => {
    expect(makeMiniGameScoreKey('blitz', base)).toBe(makeMiniGameScoreKey('blitz', base));
    expect(makeMiniGameScoreKey('blitz', base)).not.toBe(
      makeMiniGameScoreKey('blitz', { ...base, answerCount: 8 }),
    );
  });

  it('knows which games are route-shaped', () => {
    expect(isRouteShapedGame('bruecken')).toBe(true);
    expect(isRouteShapedGame('zahlenhuepfer')).toBe(true);
    expect(isRouteShapedGame('blitz')).toBe(false);
  });
});
