import React from 'react';
import { randomInt } from '../lib/engine.js';

const CONFETTI_COLORS = ['#e9493e', '#ffc83d', '#247fc3', '#2f9b61', '#ff7a59', '#8ed1fc', '#ff9f1c', '#9b5de5'];
const CONFETTI_COUNT = 180;

export const makeConfettiPieces = () =>
  Array.from({ length: CONFETTI_COUNT }, (_, index) => {
    const size = 7 + Math.random() * 10;
    const shape = index % 7 === 0 ? 'dot' : index % 3 === 0 ? 'ribbon' : 'paper';
    const width = shape === 'ribbon' ? size * 0.55 : size;
    const height = shape === 'dot' ? size : shape === 'ribbon' ? size * 2.2 : size * 1.45;

    return {
      id: index,
      startX: 3 + Math.random() * 94,
      startY: 14 + Math.random() * 56,
      x: -180 + Math.random() * 360,
      y: -220 + Math.random() * 500,
      rotation: -620 + Math.random() * 1240,
      delay: Math.random() * 0.22,
      duration: 1050 + Math.random() * 650,
      width,
      height,
      color: CONFETTI_COLORS[randomInt(0, CONFETTI_COLORS.length - 1)],
      shape,
    };
  });

export function ConfettiBurst({ pieces }) {
  return (
    <div className="confetti-burst" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          className={`confetti-piece confetti-piece--${piece.shape}`}
          key={piece.id}
          style={{
            '--confetti-color': piece.color,
            '--confetti-delay': `${piece.delay}s`,
            '--confetti-duration': `${piece.duration}ms`,
            '--confetti-height': `${piece.height}px`,
            '--confetti-rotation': `${piece.rotation}deg`,
            '--confetti-start-x': `${piece.startX}%`,
            '--confetti-start-y': `${piece.startY}%`,
            '--confetti-width': `${piece.width}px`,
            '--confetti-x': `${piece.x}px`,
            '--confetti-y': `${piece.y}px`,
          }}
        />
      ))}
    </div>
  );
}
