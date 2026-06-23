'use client';

import dynamic from 'next/dynamic';

// The game is a fully client-side SPA (browser timers, localStorage,
// requestAnimationFrame). Render it client-only so behaviour matches the
// original Vite build exactly and there is no server/localStorage mismatch.
const App = dynamic(() => import('../App.jsx'), { ssr: false });

export default function HomePage() {
  return <App />;
}
