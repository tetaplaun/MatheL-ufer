import React from 'react';
import { ANSWER_COUNT_OPTIONS, DIFFICULTY_OPTIONS, ROUTE_OPTIONS } from '../lib/engine.js';

// Controlled settings panel for a round: difficulty, skip-row toggles, route
// length, and answer count. Shared by the start card today and the Mini Games
// hub later. `fields` lets a caller hide controls it doesn't need (e.g. the
// hub omits 'route' for non-route games); `children` renders below the
// controls (e.g. the start card's live preview line).
const DEFAULT_FIELDS = ['difficulty', 'skipRows', 'route', 'answerCount'];

export function DifficultyPanel({
  settings,
  onChange,
  fields = DEFAULT_FIELDS,
  ariaLabel = 'Rundeneinstellungen',
  children,
}) {
  const shows = (field) => fields.includes(field);

  return (
    <div className="setup-panel" aria-label={ariaLabel}>
      {shows('difficulty') && (
        <div className="setup-group">
          <span className="setup-label">Schwierigkeit</span>
          <div className="segmented-control" role="group" aria-label="Schwierigkeit wählen">
            {DIFFICULTY_OPTIONS.map((option) => (
              <button
                className={`segment-button ${settings.difficulty === option.id ? 'segment-button--active' : ''}`}
                key={option.id}
                type="button"
                onClick={() => onChange('difficulty', option.id)}
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {shows('skipRows') && (
        <>
          <label className="checkbox-row">
            <input
              checked={settings.skipEasyRows}
              type="checkbox"
              onChange={(event) => onChange('skipEasyRows', event.target.checked)}
            />
            <span>1er- und 2er-Reihe weglassen</span>
          </label>

          <label className="checkbox-row">
            <input
              checked={settings.skipTenRow}
              type="checkbox"
              onChange={(event) => onChange('skipTenRow', event.target.checked)}
            />
            <span>10er-Reihe weglassen</span>
          </label>
        </>
      )}

      {shows('route') && (
        <div className="setup-group">
          <span className="setup-label">Streckenlänge</span>
          <div className="segmented-control segmented-control--routes" role="group" aria-label="Streckenlänge wählen">
            {ROUTE_OPTIONS.map((option) => (
              <button
                className={`segment-button ${settings.routeLength === option.id ? 'segment-button--active' : ''}`}
                key={option.id}
                type="button"
                onClick={() => onChange('routeLength', option.id)}
              >
                <strong>{option.label}</strong>
                <span>{option.meters} m · {option.stops} Stopps</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {shows('answerCount') && (
        <div className="setup-group">
          <span className="setup-label">Antwortmöglichkeiten</span>
          <div
            className="segmented-control segmented-control--answers"
            role="group"
            aria-label="Anzahl Antwortmöglichkeiten wählen"
          >
            {ANSWER_COUNT_OPTIONS.map((count) => (
              <button
                className={`segment-button ${settings.answerCount === count ? 'segment-button--active' : ''}`}
                key={count}
                type="button"
                onClick={() => onChange('answerCount', count)}
              >
                <strong>{count}</strong>
                <span>Antworten</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
