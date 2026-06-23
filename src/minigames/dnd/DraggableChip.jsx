'use client';

import React from 'react';
import { useDraggable } from '@dnd-kit/core';

// A draggable number chip (docs §5 "Canonical chip / slot pattern").
//
// CRITICAL: the draggable `id` is stable and unique (`chip-<index>`), NEVER the
// raw numeric value — the same number can be the correct answer one round and a
// distractor the next, which breaks DnD over-detection and the DragOverlay. The
// numeric value travels in `data: { value }` so onDragEnd can compare it to the
// question's correct answer.
//
// `touch-action: none` is applied inline so the page can't scroll mid-drag.
// When `locked` (already placed) or `selected` (tap-to-place selection) the chip
// renders without drag listeners / with a visual state.
export function DraggableChip({
  index,
  value,
  disabled = false,
  selected = false,
  className = '',
  onTap,
  children,
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `chip-${index}`,
    data: { value, index },
    disabled,
  });

  const classes = [
    'mg-chip',
    className,
    isDragging ? 'mg-chip--dragging' : '',
    selected ? 'mg-chip--selected' : '',
    disabled ? 'mg-chip--locked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      ref={setNodeRef}
      className={classes}
      style={{ touchAction: 'none' }}
      disabled={disabled}
      aria-pressed={selected || undefined}
      onClick={() => {
        if (!disabled && onTap) {
          onTap(value, index);
        }
      }}
      {...listeners}
      {...attributes}
    >
      {children ?? value}
    </button>
  );
}
