'use client';

import React, { useEffect } from 'react';

// Celebratory pop-up shown when an achievement is unlocked. Renders one toast at
// a time from the queue and auto-dismisses after a few seconds; tapping it
// dismisses early. Renders nothing when the queue is empty.
export function AchievementToast({ queue, onDismiss }) {
  const current = queue && queue.length > 0 ? queue[0] : null;

  useEffect(() => {
    if (!current) {
      return undefined;
    }
    const timeoutId = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timeoutId);
  }, [current, onDismiss]);

  if (!current) {
    return null;
  }

  return (
    <div className="achievement-toast-layer" aria-live="polite">
      <button
        key={current.id}
        className={`achievement-toast achievement-toast--${current.tier}`}
        type="button"
        onClick={onDismiss}
      >
        <span className="achievement-toast-icon" aria-hidden="true">
          {current.icon}
        </span>
        <span className="achievement-toast-text">
          <span className="achievement-toast-label">Erfolg freigeschaltet!</span>
          <strong className="achievement-toast-title">{current.title}</strong>
        </span>
        <span className="achievement-toast-trophy" aria-hidden="true">
          🏆
        </span>
      </button>
    </div>
  );
}
