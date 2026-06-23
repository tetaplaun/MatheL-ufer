'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { randomInt } from '../lib/engine.js';
import { ConfettiBurst, makeConfettiPieces } from '../components/ConfettiBurst.jsx';
import { MicroReward } from '../components/MicroReward.jsx';
import { MiniGameShell } from './MiniGameShell.jsx';
import { useReducedMotion } from './useReducedMotion.js';
import { makeMixedGameScoreKey } from './scoreKey.js';
import { loadBestScore, saveBestScore } from './localScores.js';
import { enabledOperations, OP_SYMBOLS } from './operationQuestions.js';
import styles from './MixedOperations.module.css';

const GAME_ID = 'roboterprogramm';
const PROGRAM_COUNT = 6;
const WRONG_MS = 420;
const DIVISORS = [2, 3, 4, 5, 6, 8, 10];

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const commandLabel = (command) => `${OP_SYMBOLS[command.op]} ${command.value}`;

const applyCommand = (current, command) => {
  if (command.op === 'add') {
    return current + command.value;
  }
  if (command.op === 'subtract') {
    return current - command.value;
  }
  if (command.op === 'multiply') {
    return current * command.value;
  }
  return current / command.value;
};

const commandFactors = (command, current) => {
  if (command.op === 'multiply') {
    return [command.value];
  }
  if (command.op === 'divide') {
    return [command.value, current / command.value].filter((value, index, arr) => arr.indexOf(value) === index);
  }
  return [];
};

const possibleCommands = (current, operations, max) => {
  const commands = [];

  if (operations.includes('add')) {
    for (let value = 1; value <= 12; value += 1) {
      if (current + value <= max) {
        commands.push({ op: 'add', value, result: current + value });
      }
    }
  }

  if (operations.includes('subtract')) {
    for (let value = 1; value <= Math.min(12, current); value += 1) {
      commands.push({ op: 'subtract', value, result: current - value });
    }
  }

  if (operations.includes('multiply')) {
    for (let value = 2; value <= 5; value += 1) {
      if (current * value <= max) {
        commands.push({ op: 'multiply', value, result: current * value });
      }
    }
  }

  if (operations.includes('divide')) {
    for (const value of DIVISORS) {
      if (current > 0 && current % value === 0) {
        commands.push({ op: 'divide', value, result: current / value });
      }
    }
  }

  return commands;
};

const shuffle = (items) => {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const uniqueCommands = (commands) => {
  const seen = new Set();
  return commands.filter((command) => {
    const key = `${command.op}:${command.value}:${command.result}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

function buildDivideOnlyProgram(max, length) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const values = Array.from({ length }, () => DIVISORS[randomInt(0, DIVISORS.length - 1)]);
    const target = randomInt(1, 8);
    const start = values.reduce((acc, value) => acc * value, target);
    if (start <= max) {
      let current = start;
      const sequence = values.map((value) => {
        const command = { op: 'divide', value, result: current / value };
        current = command.result;
        return command;
      });
      return { start, target, sequence };
    }
  }
  return null;
}

function buildProgram(settings) {
  const max = settings.difficulty === 'large' ? 200 : 100;
  const operations = enabledOperations(settings.operations);
  const length = settings.difficulty === 'large' ? 3 : 2;

  if (operations.length === 1 && operations[0] === 'divide') {
    const divideProgram = buildDivideOnlyProgram(max, length);
    if (divideProgram) {
      return divideProgram;
    }
  }

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const start = randomInt(2, settings.difficulty === 'large' ? 60 : 36);
    let current = start;
    const sequence = [];
    let valid = true;

    for (let step = 0; step < length; step += 1) {
      const commands = possibleCommands(current, operations, max);
      if (commands.length === 0) {
        valid = false;
        break;
      }
      const command = commands[randomInt(0, commands.length - 1)];
      sequence.push(command);
      current = command.result;
    }

    if (valid && sequence.length === length && current !== start) {
      return { start, target: current, sequence };
    }
  }

  if (operations.includes('divide')) {
    return { start: 20, target: 10, sequence: [{ op: 'divide', value: 2, result: 10 }] };
  }
  if (operations.includes('multiply')) {
    return { start: 2, target: 4, sequence: [{ op: 'multiply', value: 2, result: 4 }] };
  }
  if (operations.includes('subtract')) {
    return { start: 10, target: 0, sequence: [{ op: 'subtract', value: 10, result: 0 }] };
  }
  return { start: 10, target: 20, sequence: [{ op: 'add', value: 10, result: 20 }] };
}

function buildOptions(current, correctCommand, settings) {
  const max = settings.difficulty === 'large' ? 200 : 100;
  const operations = enabledOperations(settings.operations);
  const correctResult = applyCommand(current, correctCommand);
  const distractors = possibleCommands(current, operations, max).filter(
    (command) => commandLabel(command) !== commandLabel(correctCommand) && command.result !== correctResult,
  );
  return shuffle(uniqueCommands([correctCommand, ...shuffle(distractors).slice(0, settings.answerCount - 1)]));
}

export default function RoboterProgramm({ settings, onExit, onComplete }) {
  const reducedMotion = useReducedMotion();
  const scoreKey = useMemo(() => makeMixedGameScoreKey(GAME_ID, settings, { includeRoute: false }), [settings]);

  const [program, setProgram] = useState(() => buildProgram(settings));
  const [programIndex, setProgramIndex] = useState(1);
  const [stepIndex, setStepIndex] = useState(0);
  const [current, setCurrent] = useState(() => program.start);
  const [wrong, setWrong] = useState(0);
  const [wrongLabel, setWrongLabel] = useState(null);
  const [microBurst, setMicroBurst] = useState(0);
  const [confettiId, setConfettiId] = useState(0);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);

  const commandHitsRef = useRef(0);
  const wrongRef = useRef(0);
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);
  const factorsRef = useRef([]);
  const startedAtRef = useRef(now());
  const completedRef = useRef(false);
  const wrongTimeoutRef = useRef(null);

  const confettiPieces = useMemo(() => (confettiId > 0 ? makeConfettiPieces() : []), [confettiId]);
  const bestScore = useMemo(() => loadBestScore(scoreKey), [scoreKey, done]);
  const correctCommand = program.sequence[stepIndex];
  const options = useMemo(
    () => buildOptions(current, correctCommand, settings),
    [correctCommand, current, settings],
  );
  const progress = Math.round((stepIndex / program.sequence.length) * 100);

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
      meta: { wrong: wrongRef.current, programs: PROGRAM_COUNT },
    });

    const finalResult = {
      gameId: GAME_ID,
      mode: 'minigame',
      difficulty: settings.difficulty,
      answerCount: settings.answerCount,
      correct: commandHitsRef.current,
      wrong: wrongRef.current,
      perfect,
      bestFlawlessRun: bestStreakRef.current,
      fastestAnswerSeconds: null,
      durationSeconds,
      score: commandHitsRef.current,
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

  const startNextProgram = useCallback(() => {
    const nextProgram = buildProgram(settings);
    setProgram(nextProgram);
    setCurrent(nextProgram.start);
    setStepIndex(0);
    setProgramIndex((value) => value + 1);
  }, [settings]);

  const handleCommand = useCallback(
    (command) => {
      if (done || completedRef.current) {
        return;
      }
      const label = commandLabel(command);

      if (label !== commandLabel(correctCommand)) {
        wrongRef.current += 1;
        streakRef.current = 0;
        setWrong((value) => value + 1);
        setWrongLabel(label);
        clearTimeout(wrongTimeoutRef.current);
        wrongTimeoutRef.current = window.setTimeout(() => setWrongLabel(null), WRONG_MS);
        return;
      }

      const nextValue = applyCommand(current, correctCommand);
      commandHitsRef.current += 1;
      streakRef.current += 1;
      bestStreakRef.current = Math.max(bestStreakRef.current, streakRef.current);
      factorsRef.current.push(...commandFactors(correctCommand, current));
      setMicroBurst((value) => value + 1);
      setCurrent(nextValue);

      if (stepIndex + 1 >= program.sequence.length) {
        if (programIndex >= PROGRAM_COUNT) {
          finish();
          return;
        }
        startNextProgram();
        return;
      }

      setStepIndex((value) => value + 1);
    },
    [correctCommand, current, done, finish, program.sequence.length, programIndex, startNextProgram, stepIndex],
  );

  const replay = useCallback(() => {
    clearTimeout(wrongTimeoutRef.current);
    const fresh = buildProgram(settings);
    commandHitsRef.current = 0;
    wrongRef.current = 0;
    streakRef.current = 0;
    bestStreakRef.current = 0;
    factorsRef.current = [];
    startedAtRef.current = now();
    completedRef.current = false;

    setProgram(fresh);
    setCurrent(fresh.start);
    setProgramIndex(1);
    setStepIndex(0);
    setWrong(0);
    setWrongLabel(null);
    setMicroBurst(0);
    setConfettiId(0);
    setDone(false);
    setResult(null);
  }, [settings]);

  const status = (
    <div className={styles.status}>
      <span>
        Programm <strong>{Math.min(programIndex, PROGRAM_COUNT)}</strong> / {PROGRAM_COUNT}
      </span>
      <span>
        Schritt: <strong>{stepIndex + 1}</strong> / {program.sequence.length}
      </span>
      <span>{wrong} Fehler</span>
    </div>
  );

  return (
    <MiniGameShell title="Roboter-Programm" icon="🤖" accent="#9b5de5" onExit={onExit} status={status}>
      {confettiId > 0 && <ConfettiBurst key={confettiId} pieces={confettiPieces} />}

      {done ? (
        <div className={styles.doneCard} role="status">
          <h3>Roboter am Ziel!</h3>
          <p className={styles.doneStat}>
            {PROGRAM_COUNT} Programme in <strong>{result?.durationSeconds.toFixed(1)} s</strong>
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
            <span>Bring den Roboter zur Zielzahl</span>
            <strong className={styles.equation}>
              {current} → {program.target}
            </strong>
          </div>

          <div className={styles.robotTrack} aria-hidden="true">
            <span className={styles.robotNode}>{current}</span>
            <span className={styles.robotLine}>
              <span className={styles.robotProgress} style={{ width: `${progress}%` }} />
            </span>
            <span className={styles.robotNode}>{program.target}</span>
          </div>

          <div className={styles.options} data-count={options.length}>
            {options.map((command) => {
              const label = commandLabel(command);
              return (
                <button
                  key={`${current}-${label}`}
                  type="button"
                  className={`${styles.option} ${styles.optionSmall} ${wrongLabel === label ? styles.optionWrong : ''}`}
                  onClick={() => handleCommand(command)}
                >
                  <span>{label}</span>
                  <small>→ {command.result}</small>
                </button>
              );
            })}
          </div>

          <div className={styles.microLayer}>
            {microBurst > 0 && <MicroReward key={microBurst} origin={{ x: 50, y: 54 }} star="★" />}
          </div>
        </div>
      )}
    </MiniGameShell>
  );
}
