'use client';

import React from 'react';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../lib/achievements.js';

const formatDate = (iso) => {
  if (!iso) {
    return '';
  }
  try {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
};

function AchievementTile({ item }) {
  const showBar = !item.unlocked && item.progress.target > 1;
  const percent = item.progress.target > 0 ? Math.round((item.progress.current / item.progress.target) * 100) : 0;

  return (
    <div
      className={`achievement-tile achievement-tile--${item.tier} ${
        item.unlocked ? 'achievement-tile--unlocked' : 'achievement-tile--locked'
      }`}
    >
      <span className="achievement-tile-icon" aria-hidden="true">
        {item.icon}
      </span>
      <div className="achievement-tile-body">
        <strong className="achievement-tile-title">{item.title}</strong>
        <span className="achievement-tile-desc">{item.description}</span>
        {item.unlocked ? (
          <span className="achievement-tile-earned">Geschafft · {formatDate(item.earnedAt)}</span>
        ) : showBar ? (
          <span className="achievement-tile-progress">
            <span className="achievement-progress-bar">
              <span className="achievement-progress-fill" style={{ width: `${percent}%` }} />
            </span>
            <span className="achievement-progress-text">
              {item.progress.current}/{item.progress.target}
            </span>
          </span>
        ) : (
          <span className="achievement-tile-locked-label">Noch nicht geschafft</span>
        )}
      </div>
      {item.unlocked && (
        <span className="achievement-tile-check" aria-hidden="true">
          ✓
        </span>
      )}
    </div>
  );
}

// Full-screen trophy-case modal. Groups achievements by category and shows
// locked entries with a progress bar so kids see how close they are.
export function AchievementGallery({ achievements, open, onClose }) {
  if (!open || !achievements?.enabled) {
    return null;
  }

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: achievements.list.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <section className="achievement-panel" aria-label="Erfolge" aria-modal="true" role="dialog">
      <div className="achievement-card">
        <div className="achievement-header">
          <div>
            <h2>Erfolge</h2>
            <p>
              {achievements.unlockedCount} von {achievements.totalCount} freigeschaltet
            </p>
          </div>
          <button aria-label="Erfolge schließen" className="rules-close-button" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="achievement-scroll">
          {grouped.map((group) => (
            <section className="achievement-group" key={group.category}>
              <h3>{CATEGORY_LABELS[group.category]}</h3>
              <div className="achievement-grid">
                {group.items.map((item) => (
                  <AchievementTile item={item} key={item.id} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <button className="primary-action" type="button" onClick={onClose}>
          Schließen
        </button>
      </div>
    </section>
  );
}
