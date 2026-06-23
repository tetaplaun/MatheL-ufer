'use client';

import React, { Suspense } from 'react';
import { getMiniGame } from './registry.js';

// Resolves an active mini-game id to its lazy component and renders it. A
// Suspense fallback covers the code-split chunk download (e.g. @dnd-kit for the
// drag games). Every game receives the same contract:
//   settings   — the active difficulty settings (shared with the main race)
//   onExit()   — return to the hub
//   onComplete(result) — emit a generic achievement result on a finished round
export function MiniGameHost({ gameId, settings, onExit, onComplete }) {
  const game = getMiniGame(gameId);

  if (!game || !game.Component) {
    return null;
  }

  const { Component } = game;

  return (
    <Suspense
      fallback={
        <section className="minigame-panel minigame-panel--loading" aria-label="Lädt">
          <div className="minigame-loading">Lädt…</div>
        </section>
      }
    >
      <Component settings={settings} onExit={onExit} onComplete={onComplete} />
    </Suspense>
  );
}
