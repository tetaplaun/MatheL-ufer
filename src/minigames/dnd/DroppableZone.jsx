'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';

// A droppable target (the card slot, the dragon's mouth, a bridge gap, a result
// tile). The hitbox should be drawn larger than the visible art via CSS (docs
// §5 "hitbox larger than the visible art"). `isOver` is exposed as a class so
// the zone can highlight while a chip hovers it.
//
// For the tap-to-place fallback the same element is clickable via `onTap`.
export function DroppableZone({
  id,
  data,
  disabled = false,
  className = '',
  as: Tag = 'div',
  onTap,
  children,
}) {
  const { isOver, setNodeRef } = useDroppable({ id, data, disabled });

  const classes = ['mg-zone', className, isOver ? 'mg-zone--over' : '', disabled ? 'mg-zone--done' : '']
    .filter(Boolean)
    .join(' ');

  const tapProps = onTap
    ? {
        role: 'button',
        tabIndex: disabled ? -1 : 0,
        onClick: () => !disabled && onTap(id, data),
        onKeyDown: (event) => {
          if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onTap(id, data);
          }
        },
      }
    : {};

  return (
    <Tag ref={setNodeRef} className={classes} {...tapProps}>
      {children}
    </Tag>
  );
}
