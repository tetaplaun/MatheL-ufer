'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfettiBurst, makeConfettiPieces } from '../components/ConfettiBurst.jsx';
import { MicroReward } from '../components/MicroReward.jsx';
import { MiniGameShell } from './MiniGameShell.jsx';
import { useReducedMotion } from './useReducedMotion.js';
import { makeMixedGameScoreKey } from './scoreKey.js';
import { loadBestScore, saveBestScore } from './localScores.js';
import { makeEquationCheckQuestion } from './operationQuestions.js';
import styles from './MixedOperations.module.css';

const GAME_ID = 'fehlerfabrik';
const ROUND_COUNT = 8;
const WRONG_MS = 420;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const practicedFactors = (question) => {
  if (question.op === 'multiply') {
    return question.left === question.right ? [question.left] : [question.left, question.right];
  }
  if (question.op === 'divide') {
    return question.right === question.correct ? [question.right] : [question.right, question.correct];
  }
  return [];
};

export default function FehlerFabrik({ settings, onExit, onComplete }) {
  const reducedMotion = useReducedMotion();
  const scoreKey = useMemo(() => makeMixedGameScoreKey(GAME_ID, settings, { includeRoute: false }), [settings]);

  const [question, setQuestion] = useState(() => makeEquationCheckQuestion(settings, { forceWrong: true }));
  const [round, setRound] = useState(1);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [wrongValue, setWrongValue] = useState(null);
  const [microBurst, setMicroBurst] = useState(0);
  const [confettiId, setConfettiId] = useState(0);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);

  const correctRef = useRef(0);
  const wrongRef = useRef(0);
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
    const perfect = wrongRef.current === 0;
    const playedAt = new Date().toISOString();

    saveBestScore(scoreKey, Number(durationSeconds.toFixed(1)), {
      mode: 'time',
      date: playedAt,
      meta: { wrong: wrongRef.current },
    });

    const finalResult = {
      gameId: GAME_ID,
      mode: 'minigame',
      difficulty: settings.difficulty,
      answerCount: settings.answerCount,
      correct: correctRef.current,
      wrong: wrongRef.current,
      perfect,
      bestFlawlessRun: bestStreakRef.current,
      fastestAnswerSeconds: null,
      durationSeconds,
      score: correctRef.current,
      completed: true,
      factorsPracticed: factorsRef.current,
      playedAt,
    };

    setResult({ durationSeconds, wrong: wrongRef.current, perfect });
    setDone(true);
    if (!reducedMotion) {
      setConfettiId((id) => id + 1);
    }
    onComplete?.(finalResult);
  }, [onComplete, reducedMotion, scoreKey, settings.answerCount, settings.difficulty]);

  const handleChoice = useCallback(
    (value) => {
      if (done || completedRef.current) {
        return;
      }

      if (value === question.correct) {
        correctRef.current += 1;
        streakRef.current += 1;
        bestStreakRef.current = Math.max(bestStreakRef.current, streakRef.current);
        factorsRef.current.push(...practicedFactors(question));
        setCorrect((count) => count + 1);
        setMicroBurst((burst) => burst + 1);

        if (correctRef.current >= ROUND_COUNT) {
          finish();
          return;
        }

        setRound((count) => count + 1);
        setQuestion(makeEquationCheckQuestion(settings, { forceWrong: true }));
        return;
      }

      wrongRef.current += 1;
      streakRef.current = 0;
      setWrong((count) => count + 1);
      setWrongValue(value);
      clearTimeout(wrongTimeoutRef.current);
      wrongTimeoutRef.current = window.setTimeout(() => setWrongValue(null), WRONG_MS);
    },
    [done, finish, question, settings],
  );

  const replay = useCallback(() => {
    clearTimeout(wrongTimeoutRef.current);
    correctRef.current = 0;
    wrongRef.current = 0;
    streakRef.current = 0;
    bestStreakRef.current = 0;
    factorsRef.current = [];
    startedAtRef.current = now();
    completedRef.current = false;

    setQuestion(makeEquationCheckQuestion(settings, { forceWrong: true }));
    setRound(1);
    setCorrect(0);
    setWrong(0);
    setWrongValue(null);
    setMicroBurst(0);
    setConfettiId(0);
    setDone(false);
    setResult(null);
  }, [settings]);

  const status = (
    <div className={styles.status}>
      <span>
        Maschine <strong>{Math.min(round, ROUND_COUNT)}</strong> / {ROUND_COUNT}
      </span>
      <span>
        Repariert: <strong>{correct}</strong>
      </span>
      <span>{wrong} Fehler</span>
    </div>
  );

  return (
    <MiniGameShell title="Fehler-Fabrik" icon="🏭" accent="#e1493e" onExit={onExit} status={status}>
      {confettiId > 0 && <ConfettiBurst key={confettiId} pieces={confettiPieces} />}

      {done ? (
        <div className={styles.doneCard} role="status">
          <h3>Fabrik repariert!</h3>
          <p className={styles.doneStat}>
            {ROUND_COUNT} Fehler in <strong>{result?.durationSeconds.toFixed(1)} s</strong>
          </p>
          <p className={styles.doneStat}>{result?.perfect ? 'Fehlerfrei!' : `${result?.wrong} Fehlversuche`}</p>
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
          <div className={styles.promptCard} aria-live="polite">
            <span>Die Maschine hat falsch gedruckt. Was stimmt?</span>
            <strong className={styles.equation}>{question.prompt}</strong>
          </div>

          <div className={styles.options} data-count={settings.answerCount}>
            {question.options.map((value) => (
              <button
                key={`${question.prompt}-${value}`}
                type="button"
                className={`${styles.option} ${wrongValue === value ? styles.optionWrong : ''}`}
                onClick={() => handleChoice(value)}
              >
                {value}
              </button>
            ))}
          </div>

          <div className={styles.microLayer}>
            {microBurst > 0 && <MicroReward key={microBurst} origin={{ x: 50, y: 52 }} star="★" />}
          </div>
        </div>
      )}
    </MiniGameShell>
  );
}
