import React from 'react';

export function Runner({ progress, state }) {
  const isCheering = state === 'cheering';

  return (
    <div
      className={`runner runner--${state}`}
      style={{ left: `clamp(18px, ${progress}%, calc(100% - 86px))` }}
      aria-label={`Läufer ${state}`}
    >
      <svg viewBox="0 0 96 112" role="img" aria-hidden="true">
        <g className="runner-shadow">
          <ellipse cx="48" cy="103" rx="27" ry="6" />
        </g>
        <g className="runner-body">
          <circle className="skin" cx="48" cy="22" r="15" />
          <path className="hair" d="M34 19c4-13 25-14 30 0-9-5-19-6-30 0Z" />
          <circle className="eye" cx="43" cy="21" r="2.1" />
          <circle className="eye" cx="54" cy="21" r="2.1" />
          <path className="mouth mouth-smile" d="M42 29c4 5 10 5 14 0" />
          <path className="mouth mouth-sad" d="M42 31c4-4 10-4 14 0" />
          <path className="torso" d="M35 42c7-8 20-8 27 0l-4 31H39L35 42Z" />
          <path className="bib" d="M43 47h11l2 15H41l2-15Z" />
          <path className="arm arm-left" d={isCheering ? 'M37 48 25 25' : 'M37 48 22 62'} />
          <path className="arm arm-right" d={isCheering ? 'M59 48 73 24' : 'M59 48 77 56'} />
          <path className="leg leg-left" d="M43 72 29 93" />
          <path className="leg leg-right" d="M55 72 71 92" />
          <circle className="shoe" cx="28" cy="94" r="5" />
          <circle className="shoe" cx="72" cy="93" r="5" />
          <path className="spark spark-left" d="M26 33 14 27M27 40l-14 2" />
          <path className="spark spark-right" d="M69 34 82 27M70 41l13 4" />
        </g>
      </svg>
    </div>
  );
}
