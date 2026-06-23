'use client';

import React from 'react';

// Lightweight per-correct-answer reward (docs §3 "Reward primitives"). A tiny
// cluster of CSS sparkles (< 10 nodes) — cheap enough to fire 1–2× per second
// on an old tablet, unlike the 180-node ConfettiBurst which is reserved for
// round/game completion.
//
// Usage: keep an incrementing counter in the game and render
//   {burst > 0 && <MicroReward key={burst} />}
// inside a position:relative container. The `key` remounts the component so the
// animation replays; it auto-removes nothing (each instance is cheap and the
// next key replaces it). Position it with the `origin` prop (percentages within
// the parent) when the reward should appear at the answer location.
//
// Animation is gated by `prefers-reduced-motion` in CSS: when motion is reduced
// the sparkles render as a single brief static star instead of flying outward.

const SPARKLES = [
  { dx: 0, dy: -34, delay: 0 },
  { dx: 30, dy: -16, delay: 0.02 },
  { dx: 30, dy: 16, delay: 0.04 },
  { dx: 0, dy: 34, delay: 0.05 },
  { dx: -30, dy: 16, delay: 0.03 },
  { dx: -30, dy: -16, delay: 0.01 },
];

export function MicroReward({ origin = { x: 50, y: 50 }, star = '⭐' }) {
  return (
    <div
      className="micro-reward"
      aria-hidden="true"
      style={{ left: `${origin.x}%`, top: `${origin.y}%` }}
    >
      <span className="micro-reward-core">{star}</span>
      {SPARKLES.map((sparkle, index) => (
        <span
          className="micro-reward-spark"
          key={index}
          style={{
            '--mr-dx': `${sparkle.dx}px`,
            '--mr-dy': `${sparkle.dy}px`,
            '--mr-delay': `${sparkle.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
