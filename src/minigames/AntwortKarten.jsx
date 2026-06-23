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
import styles from './AntwortKarten.module.css';

const GAME_ID = 'antwortkarten';
const TOTAL_CARDS = 10;
const GLOW_MS = 480;

const makeCards = (settings) => Array.from({ length: TOTAL_CARDS }, () => makeQuestion(settings));

// Antwort-Karten (docs §4.1): drag the right number chip onto the card slot.
// The canonical single-droppable drag pattern; also the tap-to-place fallback.
export default function AntwortKarten({ settings, onExit, onComplete }) {
  const sensors = useAnswerSensors();
  const reducedMotion = useReducedMotion();
  const scoreKey = useMemo(() => makeMiniGameScoreKey(GAME_ID, settings), [settings]);

  const [cards, setCards] = useState(() => makeCards(settings));
  const [index, setIndex] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [microBurst, setMicroBurst] = useState(0);
  const [confettiId, setConfettiId] = useState(0);
  const [activeValue, setActiveValue] = useState(null);
  const [selectedChip, setSelectedChip] = useState(null); // tap-to-place
  const [wrongChip, setWrongChip] = useState(null);
  const [solved, setSolved] = useState(false); // brief green-glow state
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);

  // Refs read synchronously so rapid input can't double-resolve a card.
  const resolvingRef = useRef(false);
  const cardMistakesRef = useRef(0);
  const flawlessRunRef = useRef(0);
  const bestFlawlessRef = useRef(0);
  const factorsRef = useRef([]);
  const fastestRef = useRef(null);
  const cardStartRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const startedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const wrongTimeoutRef = useRef(null);

  const card = cards[index];
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
        correct: TOTAL_CARDS,
        wrong: totalMistakes,
        perfect,
        bestFlawlessRun: bestFlawlessRef.current,
        fastestAnswerSeconds: fastestRef.current,
        durationSeconds,
        completed: true,
        factorsPracticed: factorsRef.current,
        playedAt: new Date().toISOString(),
      };

      // Local board: fastest clean-ish run wins (lower time is better).
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
    (correctValue) => {
      resolvingRef.current = true;
      setSolved(true);
      setSelectedChip(null);
      setMicroBurst((value) => value + 1);

      // Per-card timing → fastest answer.
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      const elapsed = (now - cardStartRef.current) / 1000;
      if (fastestRef.current == null || elapsed < fastestRef.current) {
        fastestRef.current = elapsed;
      }

      // Flawless-run tracking (consecutive cards solved with no wrong tries).
      if (cardMistakesRef.current === 0) {
        flawlessRunRef.current += 1;
        bestFlawlessRef.current = Math.max(bestFlawlessRef.current, flawlessRunRef.current);
      } else {
        flawlessRunRef.current = 0;
      }
      cardMistakesRef.current = 0;

      // Operands feed row mastery (push b only when distinct, mirroring the race).
      factorsRef.current.push(card.a);
      if (card.b !== card.a) {
        factorsRef.current.push(card.b);
      }

      window.setTimeout(() => {
        setSolved(false);
        resolvingRef.current = false;
        if (index + 1 >= TOTAL_CARDS) {
          finish(mistakes);
        } else {
          cardStartRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
          setIndex((value) => value + 1);
        }
      }, GLOW_MS);
    },
    [card, finish, index, mistakes],
  );

  const handleWrong = useCallback((chipIndex) => {
    cardMistakesRef.current += 1;
    setMistakes((value) => value + 1);
    setSelectedChip(null);
    setWrongChip(chipIndex);
    clearTimeout(wrongTimeoutRef.current);
    wrongTimeoutRef.current = window.setTimeout(() => setWrongChip(null), 450);
  }, []);

  const resolve = useCallback(
    (value, chipIndex) => {
      if (resolvingRef.current || done) {
        return;
      }
      if (value === card.correct) {
        handleCorrect(value);
      } else {
        handleWrong(chipIndex);
      }
    },
    [card, done, handleCorrect, handleWrong],
  );

  const onDragStart = useCallback((event) => {
    setActiveValue(event.active.data.current?.value ?? null);
  }, []);

  const onDragEnd = useCallback(
    (event) => {
      setActiveValue(null);
      const { active, over } = event;
      if (over?.id === 'card-slot') {
        resolve(active.data.current?.value, active.data.current?.index);
      }
    },
    [resolve],
  );

  // Tap-to-place fallback: tap a chip to select, tap the slot to place it.
  const onChipTap = useCallback(
    (value, chipIndex) => {
      if (resolvingRef.current || done) {
        return;
      }
      setSelectedChip((current) => (current === chipIndex ? null : chipIndex));
    },
    [done],
  );

  const onSlotTap = useCallback(() => {
    if (selectedChip == null || resolvingRef.current || done) {
      return;
    }
    const chip = card.options[selectedChip];
    resolve(chip, selectedChip);
  }, [card, done, resolve, selectedChip]);

  const replay = useCallback(() => {
    clearTimeout(wrongTimeoutRef.current);
    resolvingRef.current = false;
    cardMistakesRef.current = 0;
    flawlessRunRef.current = 0;
    bestFlawlessRef.current = 0;
    factorsRef.current = [];
    fastestRef.current = null;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    cardStartRef.current = now;
    startedAtRef.current = now;
    setCards(makeCards(settings));
    setIndex(0);
    setMistakes(0);
    setMicroBurst(0);
    setConfettiId(0);
    setSelectedChip(null);
    setWrongChip(null);
    setSolved(false);
    setDone(false);
    setResult(null);
  }, [settings]);

  const status = (
    <div className={styles.progress}>
      <div className={styles.progressLabel}>
        <span>Karte {Math.min(index + 1, TOTAL_CARDS)} / {TOTAL_CARDS}</span>
        <span>{mistakes} Fehler</span>
      </div>
      <div className={styles.starBar} aria-hidden="true">
        {Array.from({ length: TOTAL_CARDS }, (_, i) => (
          <span key={i} className={i < index || (done && i < TOTAL_CARDS) ? styles.starOn : styles.starOff}>
            ★
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <MiniGameShell title="Antwort-Karten" icon="🃏" accent="#247fc3" onExit={onExit} status={status}>
      {confettiId > 0 && <ConfettiBurst key={confettiId} pieces={confettiPieces} />}

      {done ? (
        <div className={styles.doneCard} role="status">
          <h3>Geschafft! 🎉</h3>
          <p className={styles.doneStat}>
            10 Karten in <strong>{result?.durationSeconds.toFixed(1)} s</strong>
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
            <div className={`${styles.card} ${solved ? styles.cardSolved : ''}`}>
              <span className={styles.cardTask}>
                {card.a} × {card.b} =
              </span>
              <DroppableZone
                id="card-slot"
                className={`${styles.slot} ${selectedChip != null ? styles.slotReady : ''}`}
                onTap={onSlotTap}
              >
                {solved ? card.correct : selectedChip != null ? '?' : '▢'}
              </DroppableZone>
            </div>

            <div className={styles.hint} aria-live="polite">
              {selectedChip != null ? 'Tippe das Feld oben.' : 'Zieh die richtige Zahl nach oben.'}
            </div>

            <div className={styles.chips}>
              {card.options.map((value, chipIndex) => (
                <DraggableChip
                  key={`${index}-${chipIndex}`}
                  index={chipIndex}
                  value={value}
                  selected={selectedChip === chipIndex}
                  className={`${styles.chip} ${wrongChip === chipIndex ? styles.chipWrong : ''}`}
                  onTap={onChipTap}
                />
              ))}
            </div>

            <div className={styles.microLayer}>
              {microBurst > 0 && <MicroReward key={microBurst} origin={{ x: 50, y: 30 }} />}
            </div>
          </div>

          <DragOverlay>
            {activeValue != null ? <div className="mg-chip mg-chip--overlay">{activeValue}</div> : null}
          </DragOverlay>
        </DndContext>
      )}
    </MiniGameShell>
  );
}
