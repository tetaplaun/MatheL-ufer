'use client';

import { useEffect, useState } from 'react';

// Whether the user asked the OS to minimise motion. Mini-games use this to skip
// the heavy ConfettiBurst (degrade to a static badge) and to disable shake /
// fall animations, mirroring the CSS `prefers-reduced-motion` gates in App.css.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return undefined;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event) => setReduced(event.matches);
    // addEventListener is the modern API; older Safari uses addListener.
    if (query.addEventListener) {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  return reduced;
}
