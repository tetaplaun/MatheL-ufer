'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core';
import { makeQuestion, ROUTE_OPTIONS } from '../lib/engine.js';
import { ConfettiBurst, makeConfettiPieces } from '../components/ConfettiBurst.jsx';
import { MicroReward } from '../components/MicroReward.jsx';
import { MiniGameShell } from './MiniGameShell.jsx';
import { DraggableChip } from './dnd/DraggableChip.jsx';
import { DroppableZone } from './dnd/DroppableZone.jsx';
import { useAnswerSensors } from './dnd/sensors.js';
import { useReducedMotion } from './useReducedMotion.js';
import { makeMiniGameScoreKey } from './scoreKey.js';
import { loadBestScore, saveBestScore } from './localScores.js';
import styles from './BrueckenBau.module.css';

const GAME_ID = 'bruecken';
const STEP_MS = 460; // plank-firm + runner-step animation before the next gap
const ACTIVE_GAP_ID = 'gap-active';

// How many gaps the bridge has = the chosen route's stops (5 / 7 / 10).
const resolveStops = (settings) =>
  (ROUTE_OPTIONS.find((option) => option.id === settings.routeLength) ?? ROUTE_OPTIONS[1]).stops;

const routeLabelFor = (settings) => {
  const route = ROUTE_OPTIONS.find((option) => option.id === settings.routeLength) ?? ROUTE_OPTIONS[1];
  return `${route.label} · ${route.stops} Brücken`;
};

// One multiplication question per gap (the correct option is always present).
const makeGaps = (settings, stops) => Array.from({ length: stops }, () => makeQuestion(settings));

// Brücken-Bau (docs §4.1, §5): a route-shaped, multi-droppable drag game. The
// runner faces a gorge whose bridge has GAPS — one per route stop. Only the
// NEXT gap is droppable/highlighted; drag the right stone in to firm the plank
// and step the runner forward. Cross every gap to win, against the clock.
export default function BrueckenBau({ settings, onExit, onComplete }) {
  const sensors = useAnswerSensors();
  const reducedMotion = useReducedMotion();
  const stops = useMemo(() => resolveStops(settings), [settings]);
  const routeLabel = useMemo(() => routeLabelFor(settings), [settings]);
  const scoreKey = useMemo(() => makeMiniGameScoreKey(GAME_ID, settings), [settings]);

  const [gaps, setGaps] = useState(() => makeGaps(settings, stops));
  const [index, setIndex] = useState(0); // active gap (planks 0..index-1 are firm)
  const [mistakes, setMistakes] = useState(0);
  const [microBurst, setMicroBurst] = useState(0);
  const [confettiId, setConfettiId] = useState(0);
  const [activeValue, setActiveValue] = useState(null);
  const [selectedStone, setSelectedStone] = useState(null); // tap-to-place
  const [wrongStone, setWrongStone] = useState(null);
  const [stepping, setStepping] = useState(false); // brief firm-plank state
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);

  // Refs read synchronously so rapid input can't double-resolve one gap.
  const resolvingRef = useRef(false);
  const gapMistakesRef = useRef(0);
  const flawlessRunRef = useRef(0);
  const bestFlawlessRef = useRef(0);
  const factorsRef = useRef([]);
  const startedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const completedRef = useRef(false); // fire onComplete exactly once (Strict Mode)
  const stepTimeoutRef = useRef(null);
  const wrongTimeoutRef = useRef(null);

  const gap = gaps[index];
  const confettiPieces = useMemo(() => (confettiId > 0 ? makeConfettiPieces() : []), [confettiId]);
  const bestScore = useMemo(() => loadBestScore(scoreKey), [scoreKey, done]);

  const finish = useCallback(
    (totalMistakes) => {
      if (completedRef.current) {
        return;
      }
      completedRef.current = true;

      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      const durationSeconds = Math.max(0, (now - startedAtRef.current) / 1000);
      const perfect = totalMistakes === 0;

      const finalResult = {
        gameId: GAME_ID,
        mode: 'minigame',
        difficulty: settings.difficulty,
        answerCount: settings.answerCount,
        correct: stops, // gaps crossed
        wrong: totalMistakes,
        perfect,
        bestFlawlessRun: bestFlawlessRef.current,
        fastestAnswerSeconds: null,
        durationSeconds,
        score: stops,
        completed: true,
        factorsPracticed: factorsRef.current,
        playedAt: new Date().toISOString(),
      };

      // Local board: a route is a time-trial — the fastest crossing wins.
      saveBestScore(scoreKey, Number(durationSeconds.toFixed(1)), {
        mode: 'time',
        date: finalResult.playedAt,
        meta: { mistakes: totalMistakes, stops },
      });

      setResult({ durationSeconds, mistakes: totalMistakes, perfect });
      setDone(true);
      if (!reducedMotion) {
        setConfettiId((id) => id + 1);
      }
      onComplete?.(finalResult);
    },
    [onComplete, reducedMotion, scoreKey, settings.answerCount, settings.difficulty, stops],
  );

  const handleCorrect = useCallback(() => {
    resolvingRef.current = true;
    setStepping(true);
    setSelectedStone(null);
    setMicroBurst((value) => value + 1);

    // Flawless-run tracking (gaps crossed with no wrong stone tried).
    if (gapMistakesRef.current === 0) {
      flawlessRunRef.current += 1;
      bestFlawlessRef.current = Math.max(bestFlawlessRef.current, flawlessRunRef.current);
    } else {
      flawlessRunRef.current = 0;
    }
    gapMistakesRef.current = 0;

    // Operands feed row mastery (push b only when distinct, mirroring the race).
    factorsRef.current.push(gap.a);
    if (gap.b !== gap.a) {
      factorsRef.current.push(gap.b);
    }

    stepTimeoutRef.current = window.setTimeout(() => {
      setStepping(false);
      resolvingRef.current = false;
      if (index + 1 >= stops) {
        finish(mistakes);
      } else {
        setIndex((value) => value + 1);
      }
    }, STEP_MS);
  }, [finish, gap, index, mistakes, stops]);

  const handleWrong = useCallback((stoneIndex) => {
    gapMistakesRef.current += 1;
    setMistakes((value) => value + 1);
    setSelectedStone(null);
    setWrongStone(stoneIndex);
    clearTimeout(wrongTimeoutRef.current);
    wrongTimeoutRef.current = window.setTimeout(() => setWrongStone(null), 450);
  }, []);

  const resolve = useCallback(
    (value, stoneIndex) => {
      if (resolvingRef.current || done) {
        return;
      }
      if (value === gap.correct) {
        handleCorrect();
      } else {
        handleWrong(stoneIndex);
      }
    },
    [done, gap, handleCorrect, handleWrong],
  );

  const onDragStart = useCallback((event) => {
    setActiveValue(event.active.data.current?.value ?? null);
  }, []);

  const onDragEnd = useCallback(
    (event) => {
      setActiveValue(null);
      const { active, over } = event;
      // pointerWithin: a stone dropped in empty space resolves nothing; only the
      // single active gap is a (non-disabled) droppable, so it's the only hit.
      if (over?.id === ACTIVE_GAP_ID) {
        resolve(active.data.current?.value, active.data.current?.index);
      }
    },
    [resolve],
  );

  // Tap-to-place fallback: tap a stone to select, tap the active gap to place.
  const onStoneTap = useCallback(
    (value, stoneIndex) => {
      if (resolvingRef.current || done) {
        return;
      }
      setSelectedStone((current) => (current === stoneIndex ? null : stoneIndex));
    },
    [done],
  );

  const onGapTap = useCallback(() => {
    if (selectedStone == null || resolvingRef.current || done) {
      return;
    }
    resolve(gap.options[selectedStone], selectedStone);
  }, [done, gap, resolve, selectedStone]);

  const replay = useCallback(() => {
    clearTimeout(stepTimeoutRef.current);
    clearTimeout(wrongTimeoutRef.current);
    resolvingRef.current = false;
    completedRef.current = false;
    gapMistakesRef.current = 0;
    flawlessRunRef.current = 0;
    bestFlawlessRef.current = 0;
    factorsRef.current = [];
    startedAtRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
    setGaps(makeGaps(settings, stops));
    setIndex(0);
    setMistakes(0);
    setMicroBurst(0);
    setConfettiId(0);
    setSelectedStone(null);
    setWrongStone(null);
    setStepping(false);
    setDone(false);
    setResult(null);
  }, [settings, stops]);

  // Clean up every pending timer on unmount (no stray callbacks / no warnings).
  React.useEffect(
    () => () => {
      clearTimeout(stepTimeoutRef.current);
      clearTimeout(wrongTimeoutRef.current);
    },
    [],
  );

  // Runner position: 0 = before the first gap, `stops` = across (done). While a
  // plank is firming we visually nudge the runner toward the next gap.
  const runnerPos = (done ? stops : index + (stepping ? 1 : 0)) / stops;

  const status = (
    <div className={styles.progress}>
      <div className={styles.progressLabel}>
        <span>Brücke {Math.min(index + 1, stops)} / {stops}</span>
        <span>{mistakes} Fehler</span>
      </div>
      <div className={styles.plankBar} aria-hidden="true">
        {Array.from({ length: stops }, (_, i) => (
          <span
            key={i}
            className={
              i < index || done
                ? styles.plankDoneDot
                : i === index
                  ? styles.plankActiveDot
                  : styles.plankTodoDot
            }
          />
        ))}
      </div>
    </div>
  );

  return (
    <MiniGameShell
      title="Brücken-Bau"
      icon="🌉"
      accent="#ff7a59"
      onExit={onExit}
      routeLabel={routeLabel}
      status={status}
    >
      {confettiId > 0 && <ConfettiBurst key={confettiId} pieces={confettiPieces} />}

      {done ? (
        <div className={styles.doneCard} role="status">
          <h3>Brücke geschafft! 🌉</h3>
          <p className={styles.doneStat}>
            {stops} Lücken in <strong>{result?.durationSeconds.toFixed(1)} s</strong>
          </p>
          <p className={styles.doneStat}>
            {result?.perfect ? 'Fehlerfrei! 💎' : `${result?.mistakes} Fehlversuche`}
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
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className={styles.play}>
            <div className={styles.scene}>
              <span className={styles.cliffLeft} aria-hidden="true" />
              <span className={styles.cliffRight} aria-hidden="true" />

              <div className={styles.bridge}>
                {gaps.map((item, i) => {
                  const isDone = i < index || done;
                  const isActive = i === index && !done;
                  if (isDone) {
                    return (
                      <span key={i} className={`${styles.gap} ${styles.gapDone}`} aria-hidden="true">
                        <span className={styles.plank} />
                      </span>
                    );
                  }
                  if (isActive) {
                    return (
                      <DroppableZone
                        key={i}
                        id={ACTIVE_GAP_ID}
                        onTap={onGapTap}
                        className={`${styles.gap} ${styles.gapActive} ${
                          selectedStone != null ? styles.gapReady : ''
                        } ${stepping ? styles.gapFirming : ''}`}
                      >
                        <span className={styles.gapTask}>
                          {item.a} × {item.b}
                        </span>
                      </DroppableZone>
                    );
                  }
                  return (
                    <span key={i} className={`${styles.gap} ${styles.gapTodo}`} aria-hidden="true" />
                  );
                })}
              </div>

              <span
                className={`${styles.runner} ${stepping ? styles.runnerStepping : ''}`}
                style={{ '--runner-pos': runnerPos }}
                aria-hidden="true"
              >
                🏃
              </span>
            </div>

            <div className={styles.hint} aria-live="polite">
              {selectedStone != null ? 'Tippe die Lücke.' : 'Zieh den richtigen Stein in die Lücke.'}
            </div>

            <div className={styles.stones}>
              {gap.options.map((value, stoneIndex) => (
                <DraggableChip
                  key={`${index}-${stoneIndex}`}
                  index={stoneIndex}
                  value={value}
                  selected={selectedStone === stoneIndex}
                  className={`${styles.stone} ${wrongStone === stoneIndex ? styles.stoneWrong : ''}`}
                  onTap={onStoneTap}
                />
              ))}
            </div>

            <div className={styles.microLayer}>
              {microBurst > 0 && <MicroReward key={microBurst} origin={{ x: 50, y: 38 }} />}
            </div>
          </div>

          <DragOverlay>
            {activeValue != null ? (
              <div className={`mg-chip mg-chip--overlay ${styles.stone}`}>{activeValue}</div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </MiniGameShell>
  );
}
