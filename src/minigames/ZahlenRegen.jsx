'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeQuestion } from '../lib/engine.js';
import { ConfettiBurst, makeConfettiPieces } from '../components/ConfettiBurst.jsx';
import { MicroReward } from '../components/MicroReward.jsx';
import { MiniGameShell } from './MiniGameShell.jsx';
import { useReducedMotion } from './useReducedMotion.js';
import { makeMiniGameScoreKey } from './scoreKey.js';
import { loadBestScore, saveBestScore } from './localScores.js';
import styles from './ZahlenRegen.module.css';

const GAME_ID = 'regen';
const START_HEARTS = 3;

// Fall speed (in % of stage height per second). Combo ramps the speed gently;
// reduced motion pins it to the slow base with no ramping.
const BASE_SPEED = 16; // %/s for the first task
const SPEED_PER_COMBO = 1.4; // each correct answer speeds things up a touch
const MAX_SPEED = 42; // never faster than this

// Tile vertical position is the tile CENTER as a % of the field height, so the
// numbers rain across the whole field and land on a visible line near the
// bottom. SPAWN_Y is just above the top; a correct number whose center crosses
// CATCH_LINE_Y has been missed.
const SPAWN_Y = -12; // % (center just above the field top)
const CATCH_LINE_Y = 85; // % (the visible red "Boden" line and the miss threshold)

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Lay out N tiles across the width in shuffled columns. They share one vertical
// start and speed, so the whole row reaches the ground line together — the
// moment it lands is an unambiguous "round over" (no bubble sinks below ground).
const spawnTiles = (question) => {
  const count = question.options.length;
  // Even columns with margins; jitter a little so it feels organic.
  const columns = question.options.map((_, i) => {
    const slot = (i + 0.5) / count; // 0..1 centre of the slot
    const jitter = (Math.random() - 0.5) * (0.6 / count);
    return Math.min(0.92, Math.max(0.08, slot + jitter)) * 100;
  });
  // Shuffle which value sits in which column so the correct one moves around.
  const order = question.options.map((_, i) => i).sort(() => Math.random() - 0.5);
  return order.map((optionIndex, i) => ({
    id: `${optionIndex}-${Math.random().toString(36).slice(2, 8)}`,
    value: question.options[optionIndex],
    correct: question.options[optionIndex] === question.correct,
    x: columns[i],
    y: SPAWN_Y, // one row; every bubble reaches the ground at the same moment
  }));
};

// Zahlen-Regen (docs §4.1): tap the correct falling number before it lands.
// A single delta-time rAF loop drives the tiles via translateY; positions live
// in a ref and the DOM nodes are moved imperatively so we don't re-render per
// frame. The loop pauses while the tab is hidden so a backgrounded game never
// accumulates a huge delta.
export default function ZahlenRegen({ settings, onExit, onComplete }) {
  const reducedMotion = useReducedMotion();
  const scoreKey = useMemo(() => makeMiniGameScoreKey(GAME_ID, settings), [settings]);

  const [question, setQuestion] = useState(() => makeQuestion(settings));
  const [tiles, setTiles] = useState(() => spawnTiles(question));
  const [hearts, setHearts] = useState(START_HEARTS);
  const [hits, setHits] = useState(0);
  const [combo, setCombo] = useState(0);
  const [microBurst, setMicroBurst] = useState(0);
  const [microOrigin, setMicroOrigin] = useState({ x: 50, y: 50 });
  const [confettiId, setConfettiId] = useState(0);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);
  const [shakeId, setShakeId] = useState(0);

  // ---- refs read synchronously inside the rAF loop / rapid taps -----------
  const tileNodesRef = useRef(new Map()); // id -> DOM node (for imperative transform)
  const fieldRef = useRef(null); // the falling field, measured for ground-hit detection
  const positionsRef = useRef(new Map()); // id -> current y (%)
  const tilesRef = useRef(tiles); // current tile list (avoid stale closures)
  const correctValueRef = useRef(question.correct);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const pausedRef = useRef(false);
  const doneRef = useRef(false);
  const resolvingRef = useRef(false); // guards a single spawn->resolve cycle

  // round stats
  const heartsRef = useRef(START_HEARTS);
  const hitsRef = useRef(0);
  const comboRef = useRef(0);
  const mistakesRef = useRef(0);
  const maxComboRef = useRef(0);
  const bestFlawlessRef = useRef(0);
  const factorsRef = useRef([]);
  const fastestRef = useRef(null);
  const taskStartRef = useRef(now());
  const startedAtRef = useRef(now());
  const completedRef = useRef(false); // onComplete fires exactly once

  const confettiPieces = useMemo(() => (confettiId > 0 ? makeConfettiPieces() : []), [confettiId]);
  const bestScore = useMemo(() => loadBestScore(scoreKey), [scoreKey, done]);

  // Keep tilesRef + correctValueRef in sync whenever a new task is rendered.
  // Clearing `resolvingRef` here (not in nextTask) closes the race where the
  // loop could re-trigger on the OLD correct tile after it was already resolved
  // but before the new tiles are committed.
  useEffect(() => {
    tilesRef.current = tiles;
    positionsRef.current = new Map(tiles.map((t) => [t.id, t.y]));
    if (!doneRef.current) {
      resolvingRef.current = false;
    }
  }, [tiles]);

  useEffect(() => {
    correctValueRef.current = question.correct;
  }, [question]);

  const currentSpeed = useCallback(() => {
    if (reducedMotion) {
      return BASE_SPEED; // gentle constant, no ramping
    }
    return Math.min(MAX_SPEED, BASE_SPEED + comboRef.current * SPEED_PER_COMBO);
  }, [reducedMotion]);

  // Finish the round once: persist best score, fire confetti, emit result.
  const finish = useCallback(() => {
    if (completedRef.current) {
      return;
    }
    completedRef.current = true;
    doneRef.current = true;
    cancelAnimationFrame(rafRef.current);

    const durationSeconds = Math.max(0, (now() - startedAtRef.current) / 1000);
    const hitsTotal = hitsRef.current;
    const mistakes = mistakesRef.current;
    const perfect = mistakes === 0 && hitsTotal > 0;

    const finalResult = {
      gameId: GAME_ID,
      mode: 'minigame',
      difficulty: settings.difficulty,
      answerCount: settings.answerCount,
      correct: hitsTotal,
      wrong: mistakes,
      perfect,
      bestFlawlessRun: bestFlawlessRef.current,
      fastestAnswerSeconds: fastestRef.current,
      durationSeconds: Number(durationSeconds.toFixed(1)),
      score: hitsTotal,
      maxCombo: maxComboRef.current,
      completed: true,
      factorsPracticed: factorsRef.current,
      playedAt: new Date().toISOString(),
    };

    const accuracy = hitsTotal + mistakes > 0 ? Math.round((hitsTotal / (hitsTotal + mistakes)) * 100) : 0;

    // Local board: highscore (more hits is better).
    const { best } = saveBestScore(scoreKey, hitsTotal, {
      mode: 'highscore',
      date: finalResult.playedAt,
      meta: { maxCombo: maxComboRef.current, accuracy },
    });

    setResult({ hits: hitsTotal, mistakes, accuracy, maxCombo: maxComboRef.current, perfect, best });
    setDone(true);
    if (!reducedMotion) {
      setConfettiId((id) => id + 1);
    }
    onComplete?.(finalResult);
  }, [onComplete, reducedMotion, scoreKey, settings.answerCount, settings.difficulty]);

  // Advance to the next task: new question + freshly spawned tiles. Resolving
  // stays locked until the new tiles commit (cleared in the [tiles] effect).
  const nextTask = useCallback(() => {
    const nextQuestion = makeQuestion(settings);
    taskStartRef.current = now();
    setQuestion(nextQuestion);
    setTiles(spawnTiles(nextQuestion));
  }, [settings]);

  // Lose one heart (wrong tap or a missed correct tile) → maybe end the round.
  const loseHeart = useCallback(() => {
    if (resolvingRef.current || doneRef.current) {
      return;
    }
    resolvingRef.current = true;
    mistakesRef.current += 1;
    comboRef.current = 0;
    setCombo(0);
    setShakeId((id) => id + 1);

    const remaining = heartsRef.current - 1;
    heartsRef.current = remaining;
    setHearts(remaining);

    if (remaining <= 0) {
      finish();
    } else {
      nextTask();
    }
  }, [finish, nextTask]);

  // Correct tap: reward + score/combo + advance.
  const handleCorrect = useCallback(
    (tile) => {
      if (resolvingRef.current || doneRef.current) {
        return;
      }
      resolvingRef.current = true;

      // per-task timing → fastest answer
      const elapsed = (now() - taskStartRef.current) / 1000;
      if (fastestRef.current == null || elapsed < fastestRef.current) {
        fastestRef.current = elapsed;
      }

      // flawless run = consecutive correct with no wrong in between
      bestFlawlessRef.current = Math.max(bestFlawlessRef.current, comboRef.current + 1);

      hitsRef.current += 1;
      setHits(hitsRef.current);
      comboRef.current += 1;
      maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
      setCombo(comboRef.current);

      // operands feed row mastery (push b only when distinct, mirroring the race)
      factorsRef.current.push(question.a);
      if (question.b !== question.a) {
        factorsRef.current.push(question.b);
      }

      // MicroReward at the tapped tile location
      setMicroOrigin({ x: tile.x, y: Math.min(94, Math.max(6, positionsRef.current.get(tile.id) ?? tile.y)) });
      setMicroBurst((value) => value + 1);

      nextTask();
    },
    [nextTask, question.a, question.b],
  );

  const onTileTap = useCallback(
    (tile) => {
      if (resolvingRef.current || doneRef.current) {
        return;
      }
      if (tile.value === correctValueRef.current) {
        handleCorrect(tile);
      } else {
        loseHeart();
      }
    },
    [handleCorrect, loseHeart],
  );

  // ---- the single delta-time animation loop -------------------------------
  // Owns the rAF loop AND the visibilitychange listener. It tears down when the
  // round ends (`done` true) and re-arms on replay (`done` flips back to false),
  // so there is never more than one loop running. currentSpeed/loseHeart are
  // stable callbacks, so the loop is not re-created every frame or every render.
  useEffect(() => {
    if (done) {
      return undefined;
    }
    doneRef.current = false;
    lastTsRef.current = 0;

    const step = (ts) => {
      if (doneRef.current) {
        return;
      }
      if (pausedRef.current) {
        // While hidden, keep the frame loop alive but freeze time so a
        // backgrounded tab never accumulates a huge delta.
        lastTsRef.current = ts;
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      if (lastTsRef.current === 0) {
        lastTsRef.current = ts;
      }
      // Clamp delta so a hitch never teleports a tile across the floor.
      const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      const speed = currentSpeed();
      // A bubble counts as "landed" when its BOTTOM edge meets the line, not its
      // centre. Measure the bubble half-height as a % of the field live so it
      // stays correct across resizes / responsive tile sizes.
      const fieldH = fieldRef.current ? fieldRef.current.clientHeight : 0;
      const sampleNode = tilesRef.current[0] ? tileNodesRef.current.get(tilesRef.current[0].id) : null;
      const halfPct = fieldH > 0 && sampleNode ? ((sampleNode.offsetHeight / 2) / fieldH) * 100 : 8;
      let groundHit = false;

      for (const tile of tilesRef.current) {
        const y = (positionsRef.current.get(tile.id) ?? tile.y) + speed * dt;
        positionsRef.current.set(tile.id, y);
        const node = tileNodesRef.current.get(tile.id);
        if (node) {
          node.style.top = `${y}%`;
        }
        // Landed once the bubble's bottom edge reaches the line.
        if (y + halfPct >= CATCH_LINE_Y) {
          groundHit = true;
        }
      }

      // The row reaching the ground ends the task — the correct number was not
      // caught in time, so it costs a heart (no bubble sinks below the line).
      if (groundHit && !resolvingRef.current) {
        loseHeart();
      }

      rafRef.current = requestAnimationFrame(step);
    };

    const onVisibility = () => {
      if (document.hidden) {
        pausedRef.current = true;
      } else {
        pausedRef.current = false;
        lastTsRef.current = 0; // reset so we don't apply a huge accumulated delta
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    rafRef.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [done, currentSpeed, loseHeart]);

  const replay = useCallback(() => {
    completedRef.current = false;
    doneRef.current = false;
    resolvingRef.current = false;
    pausedRef.current = false;
    heartsRef.current = START_HEARTS;
    hitsRef.current = 0;
    comboRef.current = 0;
    mistakesRef.current = 0;
    maxComboRef.current = 0;
    bestFlawlessRef.current = 0;
    factorsRef.current = [];
    fastestRef.current = null;
    lastTsRef.current = 0;
    const t = now();
    taskStartRef.current = t;
    startedAtRef.current = t;

    const fresh = makeQuestion(settings);
    setQuestion(fresh);
    setTiles(spawnTiles(fresh));
    setHearts(START_HEARTS);
    setHits(0);
    setCombo(0);
    setMicroBurst(0);
    setConfettiId(0);
    setResult(null);
    // Flipping `done` back to false re-arms the loop effect above.
    setDone(false);
  }, [settings]);

  const status = (
    <div className={styles.status}>
      <span className={styles.hearts} aria-label={`${hearts} Leben`}>
        {Array.from({ length: START_HEARTS }, (_, i) => (
          <span key={i} className={i < hearts ? styles.heartOn : styles.heartOff} aria-hidden="true">
            {i < hearts ? '❤️' : '🤍'}
          </span>
        ))}
      </span>
      <span className={styles.statusStat}>
        Treffer <strong>{hits}</strong>
      </span>
      <span className={styles.statusStat}>
        Combo <strong>{combo}</strong>
      </span>
    </div>
  );

  return (
    <MiniGameShell title="Zahlen-Regen" icon="🌧️" accent="#2f9b61" onExit={onExit} status={status}>
      {confettiId > 0 && <ConfettiBurst key={confettiId} pieces={confettiPieces} />}

      {done ? (
        <div className={styles.doneCard} role="status">
          <h3>Stark gespielt! 🌈</h3>
          <p className={styles.doneStat}>
            <strong>{result?.hits ?? 0}</strong> Treffer
          </p>
          <p className={styles.doneStat}>
            {result?.perfect ? 'Fehlerfrei! 💎' : `Genauigkeit ${result?.accuracy ?? 0}%`}
          </p>
          {result?.maxCombo > 1 && <p className={styles.doneStat}>Beste Combo: {result.maxCombo}</p>}
          {bestScore && <p className={styles.doneBest}>Rekord: {bestScore.value} Treffer</p>}
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
        <div className={`${styles.play} ${shakeId > 0 && !reducedMotion ? styles.playShake : ''}`} key={shakeId}>
          <div className={styles.task} aria-live="polite">
            <span className={styles.taskText}>
              {question.a} × {question.b} =
            </span>
            <span className={styles.taskQ}>?</span>
          </div>

          <div ref={fieldRef} className={styles.field} aria-hidden="false">
            <div className={styles.ground} aria-hidden="true" />
            <div className={styles.catchLine} aria-hidden="true">
              <span className={styles.catchLabel}>Boden</span>
            </div>
            {tiles.map((tile) => (
              <button
                key={tile.id}
                type="button"
                className={styles.tile}
                style={{ left: `${tile.x}%`, top: `${tile.y}%`, transform: 'translate(-50%, -50%)' }}
                ref={(node) => {
                  if (node) {
                    tileNodesRef.current.set(tile.id, node);
                  } else {
                    tileNodesRef.current.delete(tile.id);
                  }
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  onTileTap(tile);
                }}
              >
                {tile.value}
              </button>
            ))}
          </div>

          <div className={styles.microLayer}>
            {microBurst > 0 && <MicroReward key={microBurst} origin={microOrigin} />}
          </div>
        </div>
      )}
    </MiniGameShell>
  );
}
