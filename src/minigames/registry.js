'use client';

import { lazy } from 'react';

// The mini-games hub registry (docs §2, §4.1). Each entry's `id` MUST match an
// id in MINI_GAME_IDS (src/lib/achievements.js) so local scores, the hub, and
// achievement events all key off the same string.
//
// `tier`:
//   'core' — built and playable now. Has a lazy `Component`.
//   'bald' — committed but not built yet ("Bald" = soon); rendered as a locked
//            card. No Component.
//
// Core games are lazy-loaded so the drag library (@dnd-kit) only downloads when
// a kid actually opens a drag game — arcade-only players never pay for it.

export const MINI_GAME_REGISTRY = [
  {
    id: 'antwortkarten',
    name: 'Antwort-Karten',
    tagline: 'Zieh die richtige Zahl auf die Karte.',
    icon: '🃏',
    kind: 'Ziehen',
    tier: 'core',
    accent: '#247fc3',
    Component: lazy(() => import('./AntwortKarten.jsx')),
  },
  {
    id: 'regen',
    name: 'Zahlen-Regen',
    tagline: 'Tippe die richtige fallende Zahl.',
    icon: '🌧️',
    kind: 'Geschick',
    tier: 'core',
    accent: '#2f9b61',
    Component: lazy(() => import('./ZahlenRegen.jsx')),
  },
  {
    id: 'blitz',
    name: '60-Sekunden-Blitz',
    tagline: 'Wie viele Aufgaben in einer Minute?',
    icon: '⏱️',
    kind: 'Wettkampf',
    tier: 'core',
    accent: '#e1493e',
    Component: lazy(() => import('./Blitz.jsx')),
  },
  {
    id: 'drache',
    name: 'Der hungrige Drache',
    tagline: 'Füttere den Drachen mit der richtigen Zahl.',
    icon: '🐉',
    kind: 'Ziehen',
    tier: 'core',
    accent: '#9b5de5',
    Component: lazy(() => import('./Drache.jsx')),
  },
  {
    id: 'bruecken',
    name: 'Brücken-Bau',
    tagline: 'Zieh den richtigen Stein in jede Lücke.',
    icon: '🌉',
    kind: 'Ziehen',
    tier: 'core',
    accent: '#ff7a59',
    Component: lazy(() => import('./BrueckenBau.jsx')),
  },
  {
    id: 'memory',
    name: 'Zahlen-Memory',
    tagline: 'Zieh die Aufgabe auf ihr Ergebnis.',
    icon: '🧩',
    kind: 'Ziehen',
    tier: 'core',
    accent: '#ffc83d',
    Component: lazy(() => import('./ZahlenMemory.jsx')),
  },
  {
    id: 'bingo',
    name: 'Einmaleins-Bingo',
    tagline: 'Tippe das richtige Produkt — drei in einer Reihe.',
    icon: '🔢',
    kind: 'Rätsel',
    tier: 'core',
    accent: '#247fc3',
    Component: lazy(() => import('./EinmaleinsBingo.jsx')),
  },
  {
    id: 'drehzwillinge',
    name: 'Dreh-Zwillinge',
    tagline: 'Finde die gedrehte Zwillings-Aufgabe.',
    icon: '🔁',
    kind: 'Logik',
    tier: 'core',
    accent: '#2f9b61',
    Component: lazy(() => import('./DrehZwillinge.jsx')),
  },
  {
    id: 'faktorenfinder',
    name: 'Faktoren-Finder',
    tagline: 'Finde das Paar zur Zahl.',
    icon: '🧮',
    kind: 'Denken',
    tier: 'core',
    accent: '#e1493e',
    Component: lazy(() => import('./FaktorenFinder.jsx')),
  },
  {
    id: 'zahlenhuepfer',
    name: 'Zahlen-Hüpfer',
    tagline: 'Spring in der Reihe weiter.',
    icon: '🐸',
    kind: 'Zahlenraum',
    tier: 'core',
    accent: '#9b5de5',
    Component: lazy(() => import('./ZahlenHuepfer.jsx')),
  },
  {
    id: 'rechendetektiv',
    name: 'Rechen-Detektiv',
    tagline: 'Finde die fehlende Rechenart.',
    icon: '🕵️',
    kind: 'Gemischt',
    tier: 'core',
    accent: '#247fc3',
    Component: lazy(() => import('./RechenDetektiv.jsx')),
  },
  {
    id: 'teilerei',
    name: 'Bruchfreie Teilerei',
    tagline: 'Teile alles fair und ohne Rest.',
    icon: '📦',
    kind: 'Teilen',
    tier: 'core',
    accent: '#2f9b61',
    Component: lazy(() => import('./BruchfreieTeilerei.jsx')),
  },
  {
    id: 'fehlerfabrik',
    name: 'Fehler-Fabrik',
    tagline: 'Repariere falsche Rechnungen.',
    icon: '🏭',
    kind: 'Prüfen',
    tier: 'core',
    accent: '#e1493e',
    Component: lazy(() => import('./FehlerFabrik.jsx')),
  },
  {
    id: 'roboterprogramm',
    name: 'Roboter-Programm',
    tagline: 'Wähle Befehle bis zur Zielzahl.',
    icon: '🤖',
    kind: 'Planen',
    tier: 'core',
    accent: '#9b5de5',
    Component: lazy(() => import('./RoboterProgramm.jsx')),
  },
];

export const MINI_GAME_BY_ID = MINI_GAME_REGISTRY.reduce((map, game) => {
  map[game.id] = game;
  return map;
}, {});

export const getMiniGame = (id) => MINI_GAME_BY_ID[id] ?? null;
