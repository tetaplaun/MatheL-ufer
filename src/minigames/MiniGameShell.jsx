'use client';

import React from 'react';

// Shared chrome for every mini-game: a full-screen overlay with a header
// (icon + title + a „Zurück" exit button back to the hub), an optional status
// row (timer, hearts, progress bar), and the play stage that fills the rest.
//
// Each game renders its own play area as `children` inside `.minigame-stage`
// (position:relative, the anchor for absolutely-positioned effects like
// MicroReward / falling numbers). `accent` themes the header.
export function MiniGameShell({ title, icon, accent, onExit, routeLabel, status, children, footer }) {
  return (
    <section
      className="minigame-panel"
      aria-label={title}
      style={accent ? { '--mg-accent': accent } : undefined}
    >
      <div className="minigame-shell">
        <header className="minigame-header">
          <div className="minigame-title">
            <span className="minigame-title-icon" aria-hidden="true">
              {icon}
            </span>
            <div>
              <h2>{title}</h2>
              {routeLabel && <p className="minigame-route-chip">{routeLabel}</p>}
            </div>
          </div>
          <button className="secondary-action minigame-exit" type="button" onClick={onExit}>
            Zurück
          </button>
        </header>

        {status && <div className="minigame-status">{status}</div>}

        <div className="minigame-stage">{children}</div>

        {footer && <footer className="minigame-footer">{footer}</footer>}
      </div>
    </section>
  );
}
