'use client';

import React, { useState } from 'react';
import { DEFAULT_OPERATIONS, DIFFICULTY_OPTIONS, OPERATION_OPTIONS } from '../lib/engine.js';
import { DifficultyPanel } from '../components/DifficultyPanel.jsx';
import { MINI_GAME_REGISTRY } from './registry.js';

// The Mini Games hub (docs §2): a grid of colorful game cards plus a compact,
// shared difficulty control. Route length is hidden here — it only matters to
// route-shaped games, which expose it themselves when launched.
export function MiniGamesHub({ settings, onChangeSetting, onPlay, onBack }) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const difficulty =
    DIFFICULTY_OPTIONS.find((option) => option.id === settings.difficulty) ?? DIFFICULTY_OPTIONS[0];
  const operations = { ...DEFAULT_OPERATIONS, ...(settings.operations ?? {}) };
  const operationSummary = OPERATION_OPTIONS.filter((option) => operations[option.id])
    .map((option) => option.symbol)
    .join(' ');
  const summary = `${difficulty.label} · ${settings.answerCount} Antworten · ${operationSummary}`;

  return (
    <section className="minigames-panel" aria-label="Mini-Spiele">
      <div className="minigames-shell">
        <header className="minigames-header">
          <div>
            <h2>Mini-Spiele</h2>
            <p>Kurze Spiele rund ums Einmaleins.</p>
          </div>
          <button className="secondary-action minigames-back" type="button" onClick={onBack}>
            Zurück
          </button>
        </header>

        <button
          className="minigames-settings-chip"
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          aria-label={`Einstellungen ändern. Aktuell: ${summary}`}
        >
          <span aria-hidden="true">⚙️</span>
          <span>{summary}</span>
          <span className="minigames-settings-edit">ändern</span>
        </button>

        <div className="minigames-grid" role="list">
          {MINI_GAME_REGISTRY.map((game) => {
            const playable = game.tier === 'core';
            return (
              <button
                key={game.id}
                type="button"
                role="listitem"
                className={`minigame-card ${playable ? '' : 'minigame-card--locked'}`}
                style={{ '--mg-accent': game.accent }}
                disabled={!playable}
                onClick={() => playable && onPlay(game.id)}
              >
                <span className="minigame-card-icon" aria-hidden="true">
                  {game.icon}
                </span>
                <span className="minigame-card-name">{game.name}</span>
                <span className="minigame-card-tagline">{game.tagline}</span>
                <span className={`minigame-card-badge minigame-card-badge--${game.tier}`}>
                  {playable ? game.kind : 'Bald'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isSettingsOpen && (
        <div
          className="minigame-settings-panel"
          aria-label="Mini-Spiel-Einstellungen"
          aria-modal="true"
          role="dialog"
        >
          <div className="minigame-settings-card">
            <div className="minigame-settings-header">
              <h3>Einstellungen</h3>
              <button
                aria-label="Einstellungen schließen"
                className="rules-close-button"
                type="button"
                onClick={() => setIsSettingsOpen(false)}
              >
                ×
              </button>
            </div>
            <DifficultyPanel
              settings={settings}
              onChange={onChangeSetting}
              fields={['difficulty', 'skipRows', 'answerCount', 'operations']}
              ariaLabel="Mini-Spiel-Einstellungen"
            />
            <button className="primary-action" type="button" onClick={() => setIsSettingsOpen(false)}>
              Fertig
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
