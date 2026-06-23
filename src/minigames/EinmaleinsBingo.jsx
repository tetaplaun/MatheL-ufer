'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { randomInt } from '../lib/engine.js';
import { buildProductGrid } from './buildPuzzle.js';
import { ConfettiBurst, makeConfettiPieces } from '../components/ConfettiBurst.jsx';
import { MicroReward } from '../components/MicroReward.jsx';
import { MiniGameShell } from './MiniGameShell.jsx';
import { useReducedMotion } from './useReducedMotion.js';
import { makeMiniGameScoreKey } from './scoreKey.js';
import { loadBestScore, saveBestScore } from './localScores.js';
import styles from './EinmaleinsBingo.module.css';

const GAME_ID = 'bingo';
const WRONG_MS = 420;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const gridSizeFor = (answerCount) => {
  if (answerCount <= 4) {
    return 3;
  }
  if (answerCount <= 6) {
    return 4;
  }
  return 5;
};

const makeBoard = (settings) => {
  const size = gridSizeFor(settings.answerCount);
  return buildProductGrid(settings, { cellCount: size * size }).map((cell) => ({
    ...cell,
    marked: false,
  }));
};

const pickTarget = (board) => {
  const open = board.filter((cell) => !cell.marked);
  if (open.length === 0) {
    return null;
  }
  return open[randomInt(0, open.length - 1)];
};

const winningLinesFor = (size) => {
  const lines = [];
  for (let row = 0; row < size; row += 1) {
    lines.push(Array.from({ length: size }, (_, col) => row * size + col));
  }
  for (let col = 0; col < size; col += 1) {
    lines.push(Array.from({ length: size }, (_, row) => row * size + col));
  }
  lines.push(Array.from({ length: size }, (_, i) => i * size + i));
  lines.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));
  return lines;
};

const findWinningLine = (board, size) => {
  const lines = winningLinesFor(size);
  for (const line of lines) {
    if (line.every((index) => board[index]?.marked)) {
      return line.map((index) => board[index].id);
    }
  }
  return null;
};

export default function EinmaleinsBingo({ settings, onExit, onComplete }) {
  const reducedMotion = useReducedMotion();
  const size = gridSizeFor(settings.answerCount);
  const scoreKey = useMemo(() => makeMiniGameScoreKey(GAME_ID, settings, { includeRoute: false }), [settings]);

  const initialBoard = useMemo(() => makeBoard(settings), [settings]);
  const [board, setBoard] = useState(initialBoard);
  const [target, setTarget] = useState(() => pickTarget(initialBoard));
  const [hits, setHits] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [wrongId, setWrongId] = useState(null);
  const [winLine, setWinLine] = useState([]);
  const [microBurst, setMicroBurst] = useState(0);
  const [microOrigin, setMicroOrigin] = useState({ x: 50, y: 50 });
  const [confettiId, setConfettiId] = useState(0);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);

  const boardRef = useRef(initialBoard);
  const hitsRef = useRef(0);
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

  const finish = useCallback(
    (lineIds) => {
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
        meta: { wrong: wrongRef.current, hits: hitsRef.current },
      });

      const finalResult = {
        gameId: GAME_ID,
        mode: 'minigame',
        difficulty: settings.difficulty,
        answerCount: settings.answerCount,
        correct: hitsRef.current,
        wrong: wrongRef.current,
        perfect,
        bestFlawlessRun: bestStreakRef.current,
        fastestAnswerSeconds: null,
        durationSeconds,
        score: hitsRef.current,
        won: true,
        completed: true,
        factorsPracticed: factorsRef.current,
        playedAt,
      };

      setWinLine(lineIds);
      setResult({ durationSeconds, wrong: wrongRef.current, hits: hitsRef.current, perfect });
      setDone(true);
      if (!reducedMotion) {
        setConfettiId((id) => id + 1);
      }
      onComplete?.(finalResult);
    },
    [onComplete, reducedMotion, scoreKey, settings.answerCount, settings.difficulty],
  );

  const handleCell = useCallback(
    (cellId) => {
      if (done || completedRef.current || !target) {
        return;
      }

      const currentBoard = boardRef.current;
      const cell = currentBoard.find((item) => item.id === cellId);
      if (!cell || cell.marked) {
        return;
      }

      if (cell.value !== target.value) {
        wrongRef.current += 1;
        streakRef.current = 0;
        setWrong((value) => value + 1);
        setWrongId(cellId);
        clearTimeout(wrongTimeoutRef.current);
        wrongTimeoutRef.current = window.setTimeout(() => setWrongId(null), WRONG_MS);
        return;
      }

      hitsRef.current += 1;
      streakRef.current += 1;
      bestStreakRef.current = Math.max(bestStreakRef.current, streakRef.current);
      factorsRef.current.push(target.a);
      if (target.b !== target.a) {
        factorsRef.current.push(target.b);
      }

      const nextBoard = currentBoard.map((item) => (item.id === cellId ? { ...item, marked: true } : item));
      boardRef.current = nextBoard;
      setBoard(nextBoard);
      setHits((value) => value + 1);

      const index = currentBoard.findIndex((item) => item.id === cellId);
      const row = Math.floor(index / size);
      const col = index % size;
      setMicroOrigin({ x: ((col + 0.5) / size) * 100, y: ((row + 0.5) / size) * 100 });
      setMicroBurst((value) => value + 1);

      const line = findWinningLine(nextBoard, size);
      if (line) {
        finish(line);
        return;
      }
      setTarget(pickTarget(nextBoard));
    },
    [done, finish, size, target],
  );

  const replay = useCallback(() => {
    clearTimeout(wrongTimeoutRef.current);
    const freshBoard = makeBoard(settings);
    boardRef.current = freshBoard;
    hitsRef.current = 0;
    wrongRef.current = 0;
    streakRef.current = 0;
    bestStreakRef.current = 0;
    factorsRef.current = [];
    startedAtRef.current = now();
    completedRef.current = false;

    setBoard(freshBoard);
    setTarget(pickTarget(freshBoard));
    setHits(0);
    setWrong(0);
    setWrongId(null);
    setWinLine([]);
    setMicroBurst(0);
    setMicroOrigin({ x: 50, y: 50 });
    setConfettiId(0);
    setDone(false);
    setResult(null);
  }, [settings]);

  const status = (
    <div className={styles.status}>
      <span>
        Treffer: <strong>{hits}</strong>
      </span>
      <span>
        Ziel: <strong>{size} in einer Reihe</strong>
      </span>
      <span>{wrong} Fehler</span>
    </div>
  );

  return (
    <MiniGameShell title="Einmaleins-Bingo" icon="🔢" accent="#247fc3" onExit={onExit} status={status}>
      {confettiId > 0 && <ConfettiBurst key={confettiId} pieces={confettiPieces} />}

      {done ? (
        <div className={styles.doneCard} role="status">
          <h3>Bingo!</h3>
          <p className={styles.doneStat}>
            {result?.hits} Treffer in <strong>{result?.durationSeconds.toFixed(1)} s</strong>
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
          <div className={styles.prompt} aria-live="polite">
            <span>Tippe das Ergebnis</span>
            <strong>
              {target?.a} × {target?.b}
            </strong>
          </div>

          <div className={styles.board} data-size={size} aria-label="Bingo-Feld">
            {board.map((cell) => (
              <button
                key={cell.id}
                type="button"
                className={`${styles.cell} ${cell.marked ? styles.cellMarked : ''} ${
                  winLine.includes(cell.id) ? styles.cellWin : ''
                } ${wrongId === cell.id ? styles.cellWrong : ''}`}
                disabled={cell.marked}
                onClick={() => handleCell(cell.id)}
              >
                {cell.value}
              </button>
            ))}
            <div className={styles.microLayer}>
              {microBurst > 0 && <MicroReward key={microBurst} origin={microOrigin} star="★" />}
            </div>
          </div>
        </div>
      )}
    </MiniGameShell>
  );
}
