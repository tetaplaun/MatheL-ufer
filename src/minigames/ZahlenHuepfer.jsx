'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { factorPoolFor, randomInt, ROUTE_OPTIONS } from '../lib/engine.js';
import { ConfettiBurst, makeConfettiPieces } from '../components/ConfettiBurst.jsx';
import { MicroReward } from '../components/MicroReward.jsx';
import { MiniGameShell } from './MiniGameShell.jsx';
import { useReducedMotion } from './useReducedMotion.js';
import { makeMiniGameScoreKey } from './scoreKey.js';
import { loadBestScore, saveBestScore } from './localScores.js';
import styles from './ZahlenHuepfer.module.css';

const GAME_ID = 'zahlenhuepfer';
const WRONG_MS = 420;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const shuffle = (arr) => {
  const next = arr.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const resolveRoute = (settings) => ROUTE_OPTIONS.find((option) => option.id === settings.routeLength) ?? ROUTE_OPTIONS[1];

const routeLabelFor = (settings) => {
  const route = resolveRoute(settings);
  return `${route.label} · ${route.stops} Sprünge`;
};

const pickRow = (settings) => {
  const factors = factorPoolFor(settings);
  return factors[randomInt(0, factors.length - 1)] ?? 1;
};

const makeChoices = (row, stepIndex, count, stops) => {
  const correct = row * (stepIndex + 1);
  const values = [correct];
  const maxMultiplier = Math.max(stops + 4, count + 5);
  const preferredMultipliers = [
    stepIndex,
    stepIndex + 2,
    stepIndex + 3,
    stepIndex - 1,
    stepIndex + 4,
    stepIndex + 5,
  ];

  for (const multiplier of preferredMultipliers) {
    const value = row * multiplier;
    if (value > 0 && value !== correct && !values.includes(value)) {
      values.push(value);
    }
    if (values.length >= count) {
      break;
    }
  }

  let guard = 0;
  while (values.length < count && guard < 300) {
    guard += 1;
    const value = row * randomInt(1, maxMultiplier);
    if (value > 0 && value !== correct && !values.includes(value)) {
      values.push(value);
    }
  }

  guard = 0;
  while (values.length < count && guard < 80) {
    guard += 1;
    const drift = randomInt(-row - 3, row + 3);
    const value = correct + drift;
    if (value > 0 && value !== correct && !values.includes(value)) {
      values.push(value);
    }
  }

  return shuffle(values.slice(0, count));
};

export default function ZahlenHuepfer({ settings, onExit, onComplete }) {
  const reducedMotion = useReducedMotion();
  const route = resolveRoute(settings);
  const routeLabel = useMemo(() => routeLabelFor(settings), [settings]);
  const scoreKey = useMemo(() => makeMiniGameScoreKey(GAME_ID, settings), [settings]);

  const [row, setRow] = useState(() => pickRow(settings));
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState(() => makeChoices(row, 0, settings.answerCount, route.stops));
  const [mistakes, setMistakes] = useState(0);
  const [wrongValue, setWrongValue] = useState(null);
  const [microBurst, setMicroBurst] = useState(0);
  const [microOrigin, setMicroOrigin] = useState({ x: 50, y: 50 });
  const [confettiId, setConfettiId] = useState(0);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);

  const rowRef = useRef(row);
  const stepRef = useRef(0);
  const mistakesRef = useRef(0);
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);
  const factorsRef = useRef([]);
  const startedAtRef = useRef(now());
  const completedRef = useRef(false);
  const wrongTimeoutRef = useRef(null);

  const confettiPieces = useMemo(() => (confettiId > 0 ? makeConfettiPieces() : []), [confettiId]);
  const bestScore = useMemo(() => loadBestScore(scoreKey), [scoreKey, done]);

  useEffect(() => () => clearTimeout(wrongTimeoutRef.current), []);

  const finish = useCallback(() => {
    if (completedRef.current) {
      return;
    }
    completedRef.current = true;

    const durationSeconds = Math.max(0, (now() - startedAtRef.current) / 1000);
    const perfect = mistakesRef.current === 0;
    const playedAt = new Date().toISOString();

    saveBestScore(scoreKey, Number(durationSeconds.toFixed(1)), {
      mode: 'time',
      date: playedAt,
      meta: { mistakes: mistakesRef.current, row: rowRef.current, stops: route.stops },
    });

    const finalResult = {
      gameId: GAME_ID,
      mode: 'minigame',
      difficulty: settings.difficulty,
      answerCount: settings.answerCount,
      correct: route.stops,
      wrong: mistakesRef.current,
      perfect,
      bestFlawlessRun: bestStreakRef.current,
      fastestAnswerSeconds: null,
      durationSeconds,
      score: route.stops,
      completed: true,
      factorsPracticed: factorsRef.current,
      playedAt,
    };

    setResult({ durationSeconds, mistakes: mistakesRef.current, perfect, row: rowRef.current });
    setDone(true);
    if (!reducedMotion) {
      setConfettiId((id) => id + 1);
    }
    onComplete?.(finalResult);
  }, [onComplete, reducedMotion, route.stops, scoreKey, settings.answerCount, settings.difficulty]);

  const handleChoice = useCallback(
    (value) => {
      if (done || completedRef.current) {
        return;
      }

      const nextTarget = rowRef.current * (stepRef.current + 1);
      if (value !== nextTarget) {
        mistakesRef.current += 1;
        streakRef.current = 0;
        setMistakes((count) => count + 1);
        setWrongValue(value);
        clearTimeout(wrongTimeoutRef.current);
        wrongTimeoutRef.current = window.setTimeout(() => setWrongValue(null), WRONG_MS);
        return;
      }

      const completedStep = stepRef.current + 1;
      stepRef.current = completedStep;
      streakRef.current += 1;
      bestStreakRef.current = Math.max(bestStreakRef.current, streakRef.current);
      factorsRef.current.push(rowRef.current);
      setStep(completedStep);
      setMicroOrigin({ x: ((completedStep + 0.5) / (route.stops + 1)) * 100, y: 44 });
      setMicroBurst((burst) => burst + 1);

      if (completedStep >= route.stops) {
        finish();
        return;
      }

      setChoices(makeChoices(rowRef.current, completedStep, settings.answerCount, route.stops));
    },
    [done, finish, route.stops, settings.answerCount],
  );

  const replay = useCallback(() => {
    clearTimeout(wrongTimeoutRef.current);
    const nextRow = pickRow(settings);
    rowRef.current = nextRow;
    stepRef.current = 0;
    mistakesRef.current = 0;
    streakRef.current = 0;
    bestStreakRef.current = 0;
    factorsRef.current = [];
    startedAtRef.current = now();
    completedRef.current = false;

    setRow(nextRow);
    setStep(0);
    setChoices(makeChoices(nextRow, 0, settings.answerCount, route.stops));
    setMistakes(0);
    setWrongValue(null);
    setMicroBurst(0);
    setMicroOrigin({ x: 50, y: 50 });
    setConfettiId(0);
    setDone(false);
    setResult(null);
  }, [route.stops, settings]);

  const target = row * (step + 1);
  const status = (
    <div className={styles.status}>
      <span>
        Reihe: <strong>{row}er</strong>
      </span>
      <span>
        Sprung: <strong>{Math.min(step, route.stops)}</strong> / {route.stops}
      </span>
      <span>{mistakes} Fehler</span>
    </div>
  );

  return (
    <MiniGameShell
      title="Zahlen-Hüpfer"
      icon="🐸"
      accent="#9b5de5"
      onExit={onExit}
      routeLabel={routeLabel}
      status={status}
    >
      {confettiId > 0 && <ConfettiBurst key={confettiId} pieces={confettiPieces} />}

      {done ? (
        <div className={styles.doneCard} role="status">
          <h3>Reihe geschafft!</h3>
          <p className={styles.doneStat}>
            {result?.row}er-Reihe in <strong>{result?.durationSeconds.toFixed(1)} s</strong>
          </p>
          <p className={styles.doneStat}>
            {result?.perfect ? 'Fehlerfrei!' : `${result?.mistakes} Fehlversuche`}
          </p>
          {bestScore && <p className={styles.doneBest}>Bestzeit: {bestScore.value.toFixed(1)} s</p>}
          <div className={styles.doneActions}>
            <button className="primary-action" type="button" onClick={replay}>
              Nochmal
            </button>
            <button className="secondary-action" type="button" onClick={onExit}>
              Zurück
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.play}>
          <div className={styles.prompt} aria-live="polite">
            <span>Nächster Sprung</span>
            <strong>{target}</strong>
          </div>

          <div className={styles.path} aria-label={`${row}er-Reihe`}>
            {Array.from({ length: route.stops + 1 }, (_, index) => (
              <div
                key={index}
                className={`${styles.pathNode} ${index <= step ? styles.pathNodeDone : ''} ${
                  index === step ? styles.pathNodeCurrent : ''
                } ${index === step + 1 ? styles.pathNodeNext : ''}`}
              >
                {row * index}
              </div>
            ))}
            <div className={styles.microLayer}>
              {microBurst > 0 && <MicroReward key={microBurst} origin={microOrigin} star="★" />}
            </div>
          </div>

          <div className={styles.choices} data-count={settings.answerCount}>
            {choices.map((value) => (
              <button
                key={`${step}-${value}`}
                type="button"
                className={`${styles.choice} ${wrongValue === value ? styles.choiceWrong : ''}`}
                onClick={() => handleChoice(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      )}
    </MiniGameShell>
  );
}
