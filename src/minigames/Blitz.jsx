'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeQuestion } from '../lib/engine.js';
import { ConfettiBurst, makeConfettiPieces } from '../components/ConfettiBurst.jsx';
import { MicroReward } from '../components/MicroReward.jsx';
import { MiniGameShell } from './MiniGameShell.jsx';
import { useReducedMotion } from './useReducedMotion.js';
import { makeMiniGameScoreKey } from './scoreKey.js';
import { loadBestScore, saveBestScore } from './localScores.js';
import styles from './Blitz.module.css';

const GAME_ID = 'blitz';
const ROUND_MS = 60000;
const ROUND_SECONDS = ROUND_MS / 1000;
const WRONG_LOCK_MS = 700;
const TICK_MS = 100;
const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52 in the SVG below

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// 60-Sekunden-Blitz (docs §4.1): answer as many "a × b = ?" tasks as possible in
// 60 seconds. Correct → +1 hit, MicroReward, INSTANT next task. Wrong → red
// wobble + a brief lock, then next task. Pure hit count is the score; a new
// personal best triggers the confetti.
export default function Blitz({ settings, onExit, onComplete }) {
  const reducedMotion = useReducedMotion();
  const scoreKey = useMemo(
    () => makeMiniGameScoreKey(GAME_ID, settings, { includeRoute: false }),
    [settings],
  );

  const [phase, setPhase] = useState('ready'); // 'ready' | 'playing' | 'done'
  const [question, setQuestion] = useState(null);
  const [hits, setHits] = useState(0);
  const [remainingMs, setRemainingMs] = useState(ROUND_MS);
  const [microBurst, setMicroBurst] = useState(0);
  const [confettiId, setConfettiId] = useState(0);
  const [wrongIndex, setWrongIndex] = useState(null);
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState(null);
  const [bestScore, setBestScore] = useState(null);

  // Refs read/written synchronously so rapid taps can't double-count or fire
  // onComplete twice (also covers React Strict Mode's double-invoke).
  const questionRef = useRef(null);
  const hitsRef = useRef(0);
  const wrongRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const fastestRef = useRef(null);
  const factorsRef = useRef([]);
  const questionStartRef = useRef(0);
  const roundStartRef = useRef(0);
  const lockTimeoutRef = useRef(null);
  const tickTimerRef = useRef(null);
  const finishedRef = useRef(false);

  const confettiPieces = useMemo(() => (confettiId > 0 ? makeConfettiPieces() : []), [confettiId]);

  // Load the stored best whenever we land on the ready/done screens.
  useEffect(() => {
    if (phase !== 'playing') {
      setBestScore(loadBestScore(scoreKey));
    }
  }, [phase, scoreKey, confettiId]);

  const clearTimers = useCallback(() => {
    if (lockTimeoutRef.current) {
      window.clearTimeout(lockTimeoutRef.current);
      lockTimeoutRef.current = null;
    }
    if (tickTimerRef.current) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  // Clean up every timer on unmount — no stray ticks / locks after teardown.
  useEffect(() => clearTimers, [clearTimers]);

  const nextQuestion = useCallback(() => {
    const q = makeQuestion(settings);
    questionRef.current = q;
    questionStartRef.current = now();
    setQuestion(q);
  }, [settings]);

  const finish = useCallback(() => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;
    clearTimers();
    setLocked(true);
    setRemainingMs(0);

    const totalHits = hitsRef.current;
    const totalWrong = wrongRef.current;
    const perfect = totalWrong === 0 && totalHits > 0;
    const playedAt = new Date().toISOString();

    // Local board: highest hit count wins (the canonical highscore shape).
    const { best, isRecord } = saveBestScore(scoreKey, totalHits, {
      mode: 'highscore',
      date: playedAt,
      meta: { accuracy: totalHits + totalWrong > 0 ? totalHits / (totalHits + totalWrong) : 0 },
    });

    const accuracy =
      totalHits + totalWrong > 0 ? Math.round((totalHits / (totalHits + totalWrong)) * 100) : 0;

    setResult({
      hits: totalHits,
      wrong: totalWrong,
      accuracy,
      fastest: fastestRef.current,
      perfect,
      isRecord,
    });
    setBestScore(best);
    setPhase('done');

    // Confetti ONLY on a new personal best, and only when motion is allowed.
    if (isRecord && totalHits > 0 && !reducedMotion) {
      setConfettiId((id) => id + 1);
    }

    onComplete?.({
      gameId: GAME_ID,
      mode: 'minigame',
      difficulty: settings.difficulty,
      answerCount: settings.answerCount,
      correct: totalHits,
      wrong: totalWrong,
      perfect,
      bestFlawlessRun: maxComboRef.current,
      fastestAnswerSeconds: fastestRef.current,
      durationSeconds: ROUND_SECONDS,
      score: totalHits,
      maxCombo: maxComboRef.current,
      completed: true,
      factorsPracticed: factorsRef.current,
      playedAt,
    });
  }, [clearTimers, onComplete, reducedMotion, scoreKey, settings.answerCount, settings.difficulty]);

  const startRound = useCallback(() => {
    clearTimers();
    finishedRef.current = false;
    hitsRef.current = 0;
    wrongRef.current = 0;
    comboRef.current = 0;
    maxComboRef.current = 0;
    fastestRef.current = null;
    factorsRef.current = [];
    roundStartRef.current = now();

    setHits(0);
    setWrongIndex(null);
    setLocked(false);
    setResult(null);
    setRemainingMs(ROUND_MS);
    setMicroBurst(0);
    setConfettiId(0);
    setPhase('playing');
    nextQuestion();

    // Compute remaining from the start timestamp — never trust tick counts.
    tickTimerRef.current = window.setInterval(() => {
      const elapsed = now() - roundStartRef.current;
      const left = ROUND_MS - elapsed;
      if (left <= 0) {
        setRemainingMs(0);
        finish();
      } else {
        setRemainingMs(left);
      }
    }, TICK_MS);
  }, [clearTimers, finish, nextQuestion]);

  const handleAnswer = useCallback(
    (value, optionIndex) => {
      if (phase !== 'playing' || locked || finishedRef.current) {
        return;
      }
      const current = questionRef.current;
      if (!current) {
        return;
      }

      if (value === current.correct) {
        // Per-answer timing → fastest answer.
        const elapsed = (now() - questionStartRef.current) / 1000;
        if (fastestRef.current == null || elapsed < fastestRef.current) {
          fastestRef.current = elapsed;
        }

        hitsRef.current += 1;
        comboRef.current += 1;
        maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);

        // Operands feed row mastery (push b only when distinct).
        factorsRef.current.push(current.a);
        if (current.b !== current.a) {
          factorsRef.current.push(current.b);
        }

        setHits(hitsRef.current);
        setMicroBurst((value2) => value2 + 1);
        nextQuestion(); // INSTANT next task
      } else {
        wrongRef.current += 1;
        comboRef.current = 0;
        setWrongIndex(optionIndex);
        setLocked(true);
        if (lockTimeoutRef.current) {
          window.clearTimeout(lockTimeoutRef.current);
        }
        lockTimeoutRef.current = window.setTimeout(() => {
          lockTimeoutRef.current = null;
          if (finishedRef.current) {
            return;
          }
          setWrongIndex(null);
          setLocked(false);
          nextQuestion();
        }, WRONG_LOCK_MS);
      }
    },
    [locked, nextQuestion, phase],
  );

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const fraction = Math.max(0, Math.min(1, remainingMs / ROUND_MS));
  const ringOffset = RING_CIRCUMFERENCE * (1 - fraction);
  const lowTime = remainingMs <= 10000;

  const status = (
    <div className={styles.status}>
      <span className={styles.statusHits}>
        Treffer: <strong>{hits}</strong>
      </span>
      <span className={`${styles.statusTime} ${lowTime ? styles.statusTimeLow : ''}`}>
        {phase === 'playing' ? `${remainingSeconds} s` : `${ROUND_SECONDS} s`}
      </span>
    </div>
  );

  return (
    <MiniGameShell title="60-Sekunden-Blitz" icon="⏱️" accent="#e1493e" onExit={onExit} status={status}>
      {confettiId > 0 && <ConfettiBurst key={confettiId} pieces={confettiPieces} />}

      {phase === 'ready' && (
        <div className={styles.intro} role="status">
          <div className={styles.introIcon} aria-hidden="true">
            ⏱️
          </div>
          <h3>Bereit?</h3>
          <p className={styles.introText}>
            Löse in <strong>60 Sekunden</strong> so viele Aufgaben wie du kannst!
          </p>
          {bestScore && (
            <p className={styles.introBest}>Rekord: {bestScore.value} Treffer</p>
          )}
          <div className={styles.actions}>
            <button className="primary-action primary-action--large" type="button" onClick={startRound}>
              Los!
            </button>
            <button className="secondary-action" type="button" onClick={onExit}>
              Zurück
            </button>
          </div>
        </div>
      )}

      {phase === 'playing' && question && (
        <div className={styles.play}>
          <div className={`${styles.ringWrap} ${lowTime ? styles.ringLow : ''}`}>
            <svg className={styles.ring} viewBox="0 0 120 120" aria-hidden="true">
              <circle className={styles.ringTrack} cx="60" cy="60" r="52" />
              <circle
                className={styles.ringFill}
                cx="60"
                cy="60"
                r="52"
                style={{
                  strokeDasharray: RING_CIRCUMFERENCE,
                  strokeDashoffset: ringOffset,
                }}
              />
            </svg>
            <span className={styles.ringLabel}>{remainingSeconds}</span>
          </div>

          <div className={styles.task} aria-live="polite">
            {question.a} × {question.b} = ?
          </div>

          <div
            className={styles.answers}
            data-count={settings.answerCount}
          >
            {question.options.map((value, optionIndex) => (
              <button
                key={`${hits}-${optionIndex}-${value}`}
                type="button"
                className={`answer-button ${styles.answer} ${
                  wrongIndex === optionIndex ? styles.answerWrong : ''
                }`}
                disabled={locked}
                onClick={() => handleAnswer(value, optionIndex)}
              >
                {value}
              </button>
            ))}
          </div>

          <div className={styles.microLayer}>
            {microBurst > 0 && <MicroReward key={microBurst} origin={{ x: 50, y: 22 }} />}
          </div>
        </div>
      )}

      {phase === 'done' && result && (
        <div className={styles.doneCard} role="status">
          <h3>{result.perfect ? 'Perfekt! 💎' : 'Zeit um! ⏱️'}</h3>
          <p className={styles.doneHits}>
            <strong>{result.hits}</strong> Treffer
          </p>
          <p className={styles.doneStat}>Genauigkeit: {result.accuracy}%</p>
          {result.fastest != null && (
            <p className={styles.doneStat}>Schnellste Antwort: {result.fastest.toFixed(1)} s</p>
          )}
          {result.isRecord && result.hits > 0 ? (
            <p className={styles.doneRecord}>Neuer Rekord! 🏆</p>
          ) : (
            bestScore && <p className={styles.doneBest}>Rekord: {bestScore.value} Treffer</p>
          )}
          <div className={styles.actions}>
            <button className="primary-action" type="button" onClick={startRound}>
              Nochmal
            </button>
            <button className="secondary-action" type="button" onClick={onExit}>
              Zurück
            </button>
          </div>
        </div>
      )}
    </MiniGameShell>
  );
}
