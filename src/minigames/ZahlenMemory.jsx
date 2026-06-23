'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core';
import { buildPuzzleSet } from './buildPuzzle.js';
import { randomInt } from '../lib/engine.js';
import { ConfettiBurst, makeConfettiPieces } from '../components/ConfettiBurst.jsx';
import { MicroReward } from '../components/MicroReward.jsx';
import { MiniGameShell } from './MiniGameShell.jsx';
import { DraggableChip } from './dnd/DraggableChip.jsx';
import { DroppableZone } from './dnd/DroppableZone.jsx';
import { useAnswerSensors } from './dnd/sensors.js';
import { useReducedMotion } from './useReducedMotion.js';
import { makeMiniGameScoreKey } from './scoreKey.js';
import { loadBestScore, saveBestScore } from './localScores.js';
import styles from './ZahlenMemory.module.css';

const GAME_ID = 'memory';
const WRONG_MS = 460;
const SOLVE_MS = 420;

const shuffle = (arr) => {
  const next = arr.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

// Build a fresh round: `answerCount` distinct facts → question tiles on the
// left, their results shuffled into result tiles on the right. A wider minGap in
// large mode keeps results from looking visually identical on a tablet.
const makeRound = (settings) => {
  const minGap = settings.difficulty === 'large' ? 5 : 2;
  const pairs = buildPuzzleSet(settings, { size: settings.answerCount, minGap, noSquare: true });
  const questions = pairs.map((pair, i) => ({
    qid: `q-${i}`,
    a: pair.a,
    b: pair.b,
    value: pair.correct,
    solved: false,
  }));
  const results = shuffle(pairs.map((pair) => pair.correct)).map((value, i) => ({
    rid: `res-${i}`,
    value,
    solved: false,
  }));
  return { questions, results };
};

// Zahlen-Memory (docs §4.1): connect each „a×b" question tile to the result tile
// that holds its product. Many-to-many drag with pointerWithin collision; both
// tiles vanish on a correct connect, wrong targets gently bounce back.
export default function ZahlenMemory({ settings, onExit, onComplete }) {
  const sensors = useAnswerSensors();
  const reducedMotion = useReducedMotion();
  const scoreKey = useMemo(() => makeMiniGameScoreKey(GAME_ID, settings), [settings]);

  const totalPairs = settings.answerCount;

  const [round, setRound] = useState(() => makeRound(settings));
  const [matched, setMatched] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [microBurst, setMicroBurst] = useState(0);
  const [microOrigin, setMicroOrigin] = useState({ x: 50, y: 50 });
  const [confettiId, setConfettiId] = useState(0);
  const [activeLabel, setActiveLabel] = useState(null);
  const [selectedQ, setSelectedQ] = useState(null); // tap-to-place: chosen question
  const [wrongPair, setWrongPair] = useState(null); // { qid, rid } that just failed
  const [glowRid, setGlowRid] = useState(null); // result tile briefly glowing on match
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);

  // Refs read synchronously so rapid input can't double-resolve or double-finish.
  const finishedRef = useRef(false);
  const matchedRef = useRef(0);
  const wrongRef = useRef(0);
  const flawlessRunRef = useRef(0);
  const bestFlawlessRef = useRef(0);
  const factorsRef = useRef([]);
  const startedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const wrongTimeoutRef = useRef(null);
  const glowTimeoutRef = useRef(null);

  const confettiPieces = useMemo(() => (confettiId > 0 ? makeConfettiPieces() : []), [confettiId]);
  const bestScore = useMemo(() => loadBestScore(scoreKey), [scoreKey, done]);

  const finish = useCallback(() => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;

    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const durationSeconds = Math.max(0, (now - startedAtRef.current) / 1000);
    const perfect = wrongRef.current === 0;

    const finalResult = {
      gameId: GAME_ID,
      mode: 'minigame',
      difficulty: settings.difficulty,
      answerCount: settings.answerCount,
      correct: matchedRef.current,
      wrong: wrongRef.current,
      perfect,
      bestFlawlessRun: bestFlawlessRef.current,
      fastestAnswerSeconds: null,
      durationSeconds,
      score: matchedRef.current,
      completed: true,
      factorsPracticed: factorsRef.current,
      playedAt: new Date().toISOString(),
    };

    // Local board: fastest full clear wins (lower time is better).
    saveBestScore(scoreKey, Number(durationSeconds.toFixed(1)), {
      mode: 'time',
      date: finalResult.playedAt,
      meta: { wrong: wrongRef.current },
    });

    setResult({ durationSeconds, wrong: wrongRef.current, perfect });
    setDone(true);
    if (!reducedMotion) {
      setConfettiId((id) => id + 1);
    }
    onComplete?.(finalResult);
  }, [onComplete, reducedMotion, scoreKey, settings.answerCount, settings.difficulty]);

  const handleMatch = useCallback(
    (question, resultTile) => {
      matchedRef.current += 1;
      flawlessRunRef.current += 1;
      bestFlawlessRef.current = Math.max(bestFlawlessRef.current, flawlessRunRef.current);

      // Operands feed row mastery (push b only when distinct, mirroring the race).
      factorsRef.current.push(question.a);
      if (question.b !== question.a) {
        factorsRef.current.push(question.b);
      }

      setSelectedQ(null);
      setMicroOrigin({ x: 72, y: 46 });
      setMicroBurst((value) => value + 1);
      setMatched((value) => value + 1);

      // Brief green glow on the result tile before both vanish.
      setGlowRid(resultTile.rid);
      clearTimeout(glowTimeoutRef.current);
      glowTimeoutRef.current = window.setTimeout(() => setGlowRid(null), SOLVE_MS);

      setRound((current) => ({
        questions: current.questions.map((q) =>
          q.qid === question.qid ? { ...q, solved: true } : q,
        ),
        results: current.results.map((r) =>
          r.rid === resultTile.rid ? { ...r, solved: true } : r,
        ),
      }));

      if (matchedRef.current >= totalPairs) {
        finish();
      }
    },
    [finish, totalPairs],
  );

  const handleWrong = useCallback((question, resultTile) => {
    wrongRef.current += 1;
    flawlessRunRef.current = 0;
    setWrongCount((value) => value + 1);
    setSelectedQ(null);
    setWrongPair({ qid: question.qid, rid: resultTile?.rid ?? null });
    clearTimeout(wrongTimeoutRef.current);
    wrongTimeoutRef.current = window.setTimeout(() => setWrongPair(null), WRONG_MS);
  }, []);

  // Resolve a question→result attempt. Reads `round` via the latest closure.
  const resolve = useCallback(
    (questionId, resultId) => {
      if (finishedRef.current || done) {
        return;
      }
      const question = round.questions.find((q) => q.qid === questionId);
      const resultTile = round.results.find((r) => r.rid === resultId);
      if (!question || !resultTile || question.solved || resultTile.solved) {
        return;
      }
      if (question.value === resultTile.value) {
        handleMatch(question, resultTile);
      } else {
        handleWrong(question, resultTile);
      }
    },
    [done, handleMatch, handleWrong, round],
  );

  const onDragStart = useCallback(
    (event) => {
      // DraggableChip carries the question's qid in data.index (its stable id).
      const q = round.questions.find((item) => item.qid === event.active.data.current?.index);
      setActiveLabel(q ? `${q.a} × ${q.b}` : null);
      setSelectedQ(null);
    },
    [round],
  );

  const onDragEnd = useCallback(
    (event) => {
      setActiveLabel(null);
      const { active, over } = event;
      if (!over) {
        return;
      }
      resolve(active.data.current?.index, over.data.current?.rid);
    },
    [resolve],
  );

  // Tap-to-place fallback: tap a question to select it, then tap a result tile.
  const onQuestionTap = useCallback(
    (_value, qid) => {
      if (finishedRef.current || done) {
        return;
      }
      setSelectedQ((current) => (current === qid ? null : qid));
    },
    [done],
  );

  const onResultTap = useCallback(
    (rid) => {
      if (selectedQ == null || finishedRef.current || done) {
        return;
      }
      resolve(selectedQ, rid);
    },
    [done, resolve, selectedQ],
  );

  const replay = useCallback(() => {
    clearTimeout(wrongTimeoutRef.current);
    clearTimeout(glowTimeoutRef.current);
    finishedRef.current = false;
    matchedRef.current = 0;
    wrongRef.current = 0;
    flawlessRunRef.current = 0;
    bestFlawlessRef.current = 0;
    factorsRef.current = [];
    startedAtRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
    setRound(makeRound(settings));
    setMatched(0);
    setWrongCount(0);
    setMicroBurst(0);
    setConfettiId(0);
    setActiveLabel(null);
    setSelectedQ(null);
    setWrongPair(null);
    setGlowRid(null);
    setDone(false);
    setResult(null);
  }, [settings]);

  // Clean up any pending timers on unmount.
  React.useEffect(
    () => () => {
      clearTimeout(wrongTimeoutRef.current);
      clearTimeout(glowTimeoutRef.current);
    },
    [],
  );

  const status = (
    <div className={styles.progress}>
      <div className={styles.progressLabel}>
        <span>
          {Math.min(matched, totalPairs)} / {totalPairs} Paare
        </span>
        <span>{wrongCount} Fehler</span>
      </div>
      <div className={styles.starBar} aria-hidden="true">
        {Array.from({ length: totalPairs }, (_, i) => (
          <span key={i} className={i < matched ? styles.starOn : styles.starOff}>
            ★
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <MiniGameShell title="Zahlen-Memory" icon="🧩" accent="#ffc83d" onExit={onExit} status={status}>
      {confettiId > 0 && <ConfettiBurst key={confettiId} pieces={confettiPieces} />}

      {done ? (
        <div className={styles.doneCard} role="status">
          <h3>Alle Paare! 🎉</h3>
          <p className={styles.doneStat}>
            {totalPairs} Paare in <strong>{result?.durationSeconds.toFixed(1)} s</strong>
          </p>
          <p className={styles.doneStat}>
            {result?.perfect ? 'Fehlerfrei! 💎' : `${result?.wrong} Fehlversuche`}
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
            <div className={styles.hint} aria-live="polite">
              {selectedQ != null ? 'Tippe die richtige Zahl.' : 'Ziehe die Aufgabe zur Antwort.'}
            </div>

            <div className={styles.board}>
              <div className={styles.column} aria-label="Aufgaben">
                {round.questions.map((q) => {
                  if (q.solved) {
                    return (
                      <div key={q.qid} className={`${styles.tile} ${styles.tileSolved}`} aria-hidden="true">
                        ✓
                      </div>
                    );
                  }
                  return (
                    <DraggableChip
                      key={q.qid}
                      index={q.qid}
                      value={q.value}
                      selected={selectedQ === q.qid}
                      className={`${styles.tile} ${styles.questionTile} ${
                        wrongPair?.qid === q.qid ? styles.tileWrong : ''
                      }`}
                      onTap={onQuestionTap}
                    >
                      {q.a} × {q.b}
                    </DraggableChip>
                  );
                })}
              </div>

              <div className={styles.column} aria-label="Antworten">
                {round.results.map((r) => {
                  if (r.solved) {
                    return (
                      <div
                        key={r.rid}
                        className={`${styles.tile} ${styles.tileSolved} ${
                          glowRid === r.rid ? styles.tileGlow : ''
                        }`}
                        aria-hidden="true"
                      >
                        {glowRid === r.rid ? r.value : '✓'}
                      </div>
                    );
                  }
                  return (
                    <DroppableZone
                      key={r.rid}
                      id={r.rid}
                      data={{ rid: r.rid, value: r.value }}
                      className={`${styles.tile} ${styles.resultTile} ${
                        selectedQ != null ? styles.resultReady : ''
                      } ${wrongPair?.rid === r.rid ? styles.tileWrong : ''}`}
                      onTap={onResultTap}
                    >
                      {r.value}
                    </DroppableZone>
                  );
                })}
              </div>
            </div>

            <div className={styles.microLayer}>
              {microBurst > 0 && <MicroReward key={microBurst} origin={microOrigin} />}
            </div>
          </div>

          <DragOverlay>
            {activeLabel != null ? (
              <div className="mg-chip mg-chip--overlay">{activeLabel}</div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </MiniGameShell>
  );
}
