'use client';

import { KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';

// The canonical sensor set for every drag mini-game (docs §5):
//  * PointerSensor — mouse/trackpad, 6px activation so a click isn't a drag.
//  * TouchSensor   — finger, short 90ms press-and-hold with a small tolerance
//                    so an accidental drag isn't triggered while scrolling.
//  * KeyboardSensor — AT users (the tap-to-place fallback is the primary
//                    non-drag path, but this adds keyboard dragging for free).
export function useAnswerSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 90, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );
}
