'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, rectIntersection } from '@dnd-kit/core';
import { makeQuestion } from '../lib/engine.js';
import { ConfettiBurst, makeConfettiPieces } from '../components/ConfettiBurst.jsx';
import { MicroReward } from '../components/MicroReward.jsx';
import { MiniGameShell } from './MiniGameShell.jsx';
import { DraggableChip } from './dnd/DraggableChip.jsx';
import { DroppableZone } from './dnd/DroppableZone.jsx';
import { useAnswerSensors } from './dnd/sensors.js';
import { useReducedMotion } from './useReducedMotion.js';
import { makeMiniGameScoreKey } from './scoreKey.js';
import { loadBestScore, saveBestScore } from './localScores.js';
import styles from './Drache.module.css';

const GAME_ID = 'drache';
const TOTAL_FEEDS = 8;
const CHEW_MS = 480;
const WRONG_MS = 450;

// Der hungrige Drache (docs §4.1): drag the ball with the right answer into the
// dragon's open mouth (one big droppable, hitbox larger than the art). Correct →
// chew + MicroReward + belly fills + fresh task. Wrong → grimace, ball wobbles
// back. Full belly (8 feeds) → happy roar + ConfettiBurst + done screen.
// Mirrors AntwortKarten's idempotent, ref-guarded resolve/handleCorrect/handleWrong.
export default function Drache({ settings, onExit, onComplete }) {
  const sensors = useAnswerSensors();
  const reducedMotion = useReducedMotion();
  const scoreKey = useMemo(() => makeMiniGameScoreKey(GAME_ID, settings), [settings]);

  const [question, setQuestion] = useState(() => makeQuestion(settings));
  const [feeds, setFeeds] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [microBurst, setMicroBurst] = useState(0);
  const [confettiId, setConfettiId] = useState(0);
  const [activeValue, setActiveValue] = useState(null);
  const [selectedChip, setSelectedChip] = useState(null); // tap-to-place
  const [wrongChip, setWrongChip] = useState(null);
  const [chewing, setChewing] = useState(false); // brief happy-chew state
  const [grimace, setGrimace] = useState(false); // brief wrong-answer face
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);

  // Refs read synchronously so rapid input can't double-feed the dragon.
  const resolvingRef = useRef(false);
  const feedMistakesRef = useRef(0);
  const flawlessRunRef = useRef(0);
  const bestFlawlessRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const factorsRef = useRef([]);
  const fastestRef = useRef(null);
  const feedStartRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const startedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const wrongTimeoutRef = useRef(null);
  const grimaceTimeoutRef = useRef(null);
  const chewTimeoutRef = useRef(null);

  const confettiPieces = useMemo(() => (confettiId > 0 ? makeConfettiPieces() : []), [confettiId]);
  const bestScore = useMemo(() => loadBestScore(scoreKey), [scoreKey, done]);

  const finish = useCallback(
    (totalMistakes) => {
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      const durationSeconds = Math.max(0, (now - startedAtRef.current) / 1000);
      const perfect = totalMistakes === 0;

      const finalResult = {
        gameId: GAME_ID,
        mode: 'minigame',
        difficulty: settings.difficulty,
        answerCount: settings.answerCount,
        correct: TOTAL_FEEDS,
        wrong: totalMistakes,
        perfect,
        bestFlawlessRun: bestFlawlessRef.current,
        fastestAnswerSeconds: fastestRef.current,
        durationSeconds,
        score: TOTAL_FEEDS,
        maxCombo: maxComboRef.current,
        completed: true,
        factorsPracticed: factorsRef.current,
        playedAt: new Date().toISOString(),
      };

      // Local board: a faster full belly is better (lower time wins).
      saveBestScore(scoreKey, Number(durationSeconds.toFixed(1)), {
        mode: 'time',
        date: finalResult.playedAt,
        meta: { mistakes: totalMistakes },
      });

      setResult({ durationSeconds, mistakes: totalMistakes, perfect });
      setDone(true);
      if (!reducedMotion) {
        setConfettiId((id) => id + 1);
      }
      onComplete?.(finalResult);
    },
    [onComplete, reducedMotion, scoreKey, settings.answerCount, settings.difficulty],
  );

  const handleCorrect = useCallback(
    (correctQuestion) => {
      resolvingRef.current = true;
      setChewing(true);
      setGrimace(false);
      setSelectedChip(null);
      setMicroBurst((value) => value + 1);

      // Per-feed timing → fastest answer.
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      const elapsed = (now - feedStartRef.current) / 1000;
      if (fastestRef.current == null || elapsed < fastestRef.current) {
        fastestRef.current = elapsed;
      }

      // Feed-streak combo (consecutive correct feeds, reset by any wrong try).
      comboRef.current += 1;
      maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);

      // Flawless-run tracking (consecutive feeds with no wrong tries at all).
      if (feedMistakesRef.current === 0) {
        flawlessRunRef.current += 1;
        bestFlawlessRef.current = Math.max(bestFlawlessRef.current, flawlessRunRef.current);
      } else {
        flawlessRunRef.current = 0;
      }
      feedMistakesRef.current = 0;

      // Operands feed row mastery (push b only when distinct, mirroring the race).
      factorsRef.current.push(correctQuestion.a);
      if (correctQuestion.b !== correctQuestion.a) {
        factorsRef.current.push(correctQuestion.b);
      }

      const nextFeeds = feeds + 1;
      setFeeds(nextFeeds);

      chewTimeoutRef.current = window.setTimeout(() => {
        setChewing(false);
        resolvingRef.current = false;
        if (nextFeeds >= TOTAL_FEEDS) {
          finish(mistakes);
        } else {
          feedStartRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
          setQuestion(makeQuestion(settings));
        }
      }, CHEW_MS);
    },
    [feeds, finish, mistakes, settings],
  );

  const handleWrong = useCallback((chipIndex) => {
    feedMistakesRef.current += 1;
    comboRef.current = 0;
    setMistakes((value) => value + 1);
    setSelectedChip(null);
    setWrongChip(chipIndex);
    setGrimace(true);
    clearTimeout(wrongTimeoutRef.current);
    clearTimeout(grimaceTimeoutRef.current);
    wrongTimeoutRef.current = window.setTimeout(() => setWrongChip(null), WRONG_MS);
    grimaceTimeoutRef.current = window.setTimeout(() => setGrimace(false), WRONG_MS);
  }, []);

  const resolve = useCallback(
    (value, chipIndex) => {
      if (resolvingRef.current || done) {
        return;
      }
      if (value === question.correct) {
        handleCorrect(question);
      } else {
        handleWrong(chipIndex);
      }
    },
    [done, handleCorrect, handleWrong, question],
  );

  const onDragStart = useCallback((event) => {
    setActiveValue(event.active.data.current?.value ?? null);
  }, []);

  const onDragEnd = useCallback(
    (event) => {
      setActiveValue(null);
      const { active, over } = event;
      if (over?.id === 'mouth') {
        resolve(active.data.current?.value, active.data.current?.index);
      }
    },
    [resolve],
  );

  // Tap-to-place fallback: tap a ball to select, tap the mouth to feed it.
  const onChipTap = useCallback(
    (value, chipIndex) => {
      if (resolvingRef.current || done) {
        return;
      }
      setSelectedChip((current) => (current === chipIndex ? null : chipIndex));
    },
    [done],
  );

  const onMouthTap = useCallback(() => {
    if (selectedChip == null || resolvingRef.current || done) {
      return;
    }
    const chip = question.options[selectedChip];
    resolve(chip, selectedChip);
  }, [done, question, resolve, selectedChip]);

  const replay = useCallback(() => {
    clearTimeout(wrongTimeoutRef.current);
    clearTimeout(grimaceTimeoutRef.current);
    clearTimeout(chewTimeoutRef.current);
    resolvingRef.current = false;
    feedMistakesRef.current = 0;
    flawlessRunRef.current = 0;
    bestFlawlessRef.current = 0;
    comboRef.current = 0;
    maxComboRef.current = 0;
    factorsRef.current = [];
    fastestRef.current = null;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    feedStartRef.current = now;
    startedAtRef.current = now;
    setQuestion(makeQuestion(settings));
    setFeeds(0);
    setMistakes(0);
    setMicroBurst(0);
    setConfettiId(0);
    setSelectedChip(null);
    setWrongChip(null);
    setChewing(false);
    setGrimace(false);
    setDone(false);
    setResult(null);
  }, [settings]);

  const dragonFace = chewing ? '😋' : grimace ? '😖' : '🐉';

  const status = (
    <div className={styles.progress}>
      <div className={styles.progressLabel}>
        <span>Häppchen {Math.min(feeds, TOTAL_FEEDS)} / {TOTAL_FEEDS}</span>
        <span>{mistakes} Fehler</span>
      </div>
      <div className={styles.bellyBar} aria-hidden="true">
        <div
          className={styles.bellyFill}
          style={{ width: `${(Math.min(feeds, TOTAL_FEEDS) / TOTAL_FEEDS) * 100}%` }}
        />
      </div>
    </div>
  );

  return (
    <MiniGameShell title="Der hungrige Drache" icon="🐉" accent="#9b5de5" onExit={onExit} status={status}>
      {confettiId > 0 && <ConfettiBurst key={confettiId} pieces={confettiPieces} />}

      {done ? (
        <div className={styles.doneCard} role="status">
          <h3>Satt und glücklich! 🐉🎉</h3>
          <p className={styles.doneStat}>
            Bauch voll in <strong>{result?.durationSeconds.toFixed(1)} s</strong>
          </p>
          <p className={styles.doneStat}>
            {result?.perfect ? 'Fehlerfrei! 💎' : `${result?.mistakes} Fehlversuche`}
          </p>
          {bestScore && (
            <p className={styles.doneBest}>Bestzeit: {bestScore.value.toFixed(1)} s</p>
          )}
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
          collisionDetection={rectIntersection}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className={styles.play}>
            <div className={styles.dragonArea}>
              <div className={styles.sign}>
                {question.a} × {question.b} =
              </div>

              <DroppableZone
                id="mouth"
                className={`${styles.mouth} ${selectedChip != null ? styles.mouthReady : ''} ${
                  chewing ? styles.mouthChew : ''
                } ${grimace ? styles.mouthGrimace : ''}`}
                onTap={onMouthTap}
              >
                <span className={styles.dragon} aria-hidden="true">
                  {dragonFace}
                </span>
                <span className={styles.mouthHint} aria-hidden="true">
                  {selectedChip != null ? 'Hier tippen!' : 'Füttern'}
                </span>
              </DroppableZone>
            </div>

            <div className={styles.hint} aria-live="polite">
              {selectedChip != null
                ? 'Tippe den Drachen, zum Füttern.'
                : 'Zieh die richtige Kugel in den Mund.'}
            </div>

            <div className={styles.balls}>
              {question.options.map((value, chipIndex) => (
                <DraggableChip
                  key={`${feeds}-${chipIndex}`}
                  index={chipIndex}
                  value={value}
                  selected={selectedChip === chipIndex}
                  className={`${styles.ball} ${wrongChip === chipIndex ? styles.ballWrong : ''}`}
                  onTap={onChipTap}
                />
              ))}
            </div>

            <div className={styles.microLayer}>
              {microBurst > 0 && <MicroReward key={microBurst} origin={{ x: 50, y: 32 }} />}
            </div>
          </div>

          <DragOverlay>
            {activeValue != null ? (
              <div className="mg-chip mg-chip--overlay">{activeValue}</div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </MiniGameShell>
  );
}
