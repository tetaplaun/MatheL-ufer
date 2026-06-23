import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ANSWER_COUNT_OPTIONS,
  DEFAULT_SETTINGS,
  DIFFICULTY_OPTIONS,
  FINISH_PROGRESS,
  ROUTE_OPTIONS,
  clamp,
  formatFactorRange,
  formatSeconds,
  makeCheckpoints,
  makeQuestion,
  makeSettingsKey,
} from './lib/engine.js';
import { ConfettiBurst, makeConfettiPieces } from './components/ConfettiBurst.jsx';
import { DifficultyPanel } from './components/DifficultyPanel.jsx';
import { Runner } from './components/Runner.jsx';
import { StatusPill } from './components/StatusPill.jsx';
import {
  LEADERBOARD_LIMIT,
  SUPABASE_ENABLED,
  addLeaderboardRanks,
  compareLeaderboardEntries,
  loadLastPlayerName,
  loadLeaderboard,
  loadSupabaseLeaderboard,
  mergeLeaderboardEntries,
  persistLocalLeaderboard,
  saveLastPlayerName,
  saveSupabaseLeaderboardEntry,
} from './lib/leaderboard.js';

const MIN_SPEED = 2.2;
const BASE_SPEED = 5.2;
const MAX_SPEED = 11.5;

export default function App() {
  const [gameSettings, setGameSettings] = useState(DEFAULT_SETTINGS);
  const [leaderboardSettings, setLeaderboardSettings] = useState(DEFAULT_SETTINGS);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isLeaderboardSettingsOpen, setIsLeaderboardSettingsOpen] = useState(false);
  const [leaderboardEntries, setLeaderboardEntries] = useState(() => loadLeaderboard());
  const [leaderboardStatus, setLeaderboardStatus] = useState(SUPABASE_ENABLED ? 'loading' : 'local');
  const [leaderboardError, setLeaderboardError] = useState('');
  const [playerName, setPlayerName] = useState(() => loadLastPlayerName());
  const [savedRaceId, setSavedRaceId] = useState(null);
  const [isSavingLeaderboard, setIsSavingLeaderboard] = useState(false);
  const [phase, setPhase] = useState('home');
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(BASE_SPEED);
  const [checkpointIndex, setCheckpointIndex] = useState(0);
  const [question, setQuestion] = useState(() => makeQuestion(DEFAULT_SETTINGS));
  const [runnerState, setRunnerState] = useState('standing');
  const [feedback, setFeedback] = useState('Bereit?');
  const [wrongAnswers, setWrongAnswers] = useState([]);
  const [answerStartedAt, setAnswerStartedAt] = useState(null);
  const [finishTime, setFinishTime] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [answerStats, setAnswerStats] = useState([]);
  const [runDurationMs, setRunDurationMs] = useState(0);
  const [clockTick, setClockTick] = useState(0);
  const [confettiBurstId, setConfettiBurstId] = useState(0);
  const confettiPieces = useMemo(() => (confettiBurstId > 0 ? makeConfettiPieces() : []), [confettiBurstId]);

  const animationRef = useRef(null);
  const timeoutRef = useRef(null);
  const runTimeoutRef = useRef(null);

  const selectedDifficulty = DIFFICULTY_OPTIONS.find((option) => option.id === gameSettings.difficulty) ?? DIFFICULTY_OPTIONS[0];
  const routeConfig = ROUTE_OPTIONS.find((option) => option.id === gameSettings.routeLength) ?? ROUTE_OPTIONS[1];
  const leaderboardDifficulty =
    DIFFICULTY_OPTIONS.find((option) => option.id === leaderboardSettings.difficulty) ?? DIFFICULTY_OPTIONS[0];
  const leaderboardRouteConfig =
    ROUTE_OPTIONS.find((option) => option.id === leaderboardSettings.routeLength) ?? ROUTE_OPTIONS[1];
  const checkpoints = useMemo(() => makeCheckpoints(routeConfig.stops), [routeConfig.stops]);
  const factorRangeLabel = formatFactorRange(gameSettings, selectedDifficulty.maxFactor);
  const leaderboardFactorRangeLabel = formatFactorRange(leaderboardSettings, leaderboardDifficulty.maxFactor);
  const settingsKey = makeSettingsKey(gameSettings);
  const leaderboardSettingsKey = makeSettingsKey(leaderboardSettings);
  const nextCheckpoint = checkpoints[checkpointIndex] ?? FINISH_PROGRESS;
  const coveredMeters = Math.round((progress / FINISH_PROGRESS) * routeConfig.meters);
  const totalSeconds = useMemo(() => {
    const end = finishTime ?? performance.now();
    return startedAt ? Math.max(0, (end - startedAt) / 1000) : 0;
  }, [finishTime, startedAt, clockTick]);
  const raceSummary = useMemo(() => {
    const answered = answerStats.length;
    const totalMistakes = answerStats.reduce((sum, answer) => sum + answer.mistakes, 0);
    const totalAnswerSeconds = answerStats.reduce((sum, answer) => sum + answer.answerSeconds, 0);
    const fastestAnswer = answerStats.reduce(
      (fastest, answer) => Math.min(fastest, answer.answerSeconds),
      Number.POSITIVE_INFINITY,
    );
    const biggestBoost = answerStats.reduce((best, answer) => Math.max(best, answer.boost), 0);
    const topSpeed = answerStats.reduce((best, answer) => Math.max(best, answer.speedAfter), BASE_SPEED);

    return {
      answered,
      totalMistakes,
      averageAnswerSeconds: answered ? totalAnswerSeconds / answered : 0,
      fastestAnswerSeconds: Number.isFinite(fastestAnswer) ? fastestAnswer : 0,
      biggestBoost,
      topSpeed,
    };
  }, [answerStats]);
  const raceLeaderboard = useMemo(
    () =>
      addLeaderboardRanks(
        leaderboardEntries
          .filter((entry) => entry.settingsKey === settingsKey)
          .sort(compareLeaderboardEntries)
          .slice(0, LEADERBOARD_LIMIT),
      ),
    [leaderboardEntries, settingsKey],
  );
  const selectedLeaderboard = useMemo(
    () =>
      addLeaderboardRanks(
        leaderboardEntries
          .filter((entry) => entry.settingsKey === leaderboardSettingsKey)
          .sort(compareLeaderboardEntries)
          .slice(0, LEADERBOARD_LIMIT),
      ),
    [leaderboardEntries, leaderboardSettingsKey],
  );

  useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setLeaderboardStatus('local');
      return undefined;
    }

    let isCurrent = true;
    const fetchKeys = [...new Set([settingsKey, leaderboardSettingsKey])];
    setLeaderboardStatus('loading');
    setLeaderboardError('');

    Promise.allSettled(fetchKeys.map((key) => loadSupabaseLeaderboard(key).then((entries) => ({ key, entries }))))
      .then((results) => {
        if (!isCurrent) {
          return;
        }

        const loadedResults = results
          .filter((result) => result.status === 'fulfilled')
          .map((result) => result.value);

        if (loadedResults.length > 0) {
          setLeaderboardEntries((entries) => {
            const nextEntries = loadedResults.reduce(
              (nextEntries, result) => mergeLeaderboardEntries(nextEntries, result.key, result.entries),
              entries,
            );
            persistLocalLeaderboard(nextEntries);
            return nextEntries;
          });
        }

        if (results.some((result) => result.status === 'rejected')) {
          setLeaderboardStatus('error');
          setLeaderboardError('Supabase nicht erreichbar. Lokale Rangliste wird angezeigt.');
          return;
        }

        setLeaderboardStatus('online');
      });

    return () => {
      isCurrent = false;
    };
  }, [settingsKey, leaderboardSettingsKey]);

  useEffect(() => {
    if (phase !== 'running') {
      clearTimeout(runTimeoutRef.current);
      return undefined;
    }

    const stopAt = checkpoints[checkpointIndex] ?? FINISH_PROGRESS;
    const distance = Math.max(0, stopAt - progress);
    const durationMs = Math.max(320, (distance / speed) * 1000);

    clearTimeout(runTimeoutRef.current);
    cancelAnimationFrame(animationRef.current);
    setRunDurationMs(durationMs);
    animationRef.current = requestAnimationFrame(() => {
      setProgress(stopAt);
    });

    runTimeoutRef.current = setTimeout(() => {
      if (stopAt >= FINISH_PROGRESS) {
        setPhase('finished');
        setRunnerState('cheering');
        setFinishTime(performance.now());
        setFeedback('Ziel erreicht!');
        return;
      }

      setPhase('quiz');
      setRunnerState('braking');
      setQuestion(makeQuestion(gameSettings));
      setWrongAnswers([]);
      setAnswerStartedAt(performance.now());
      setFeedback('Wähle die richtige Antwort.');
    }, durationMs);

    return () => {
      clearTimeout(runTimeoutRef.current);
      cancelAnimationFrame(animationRef.current);
    };
  }, [phase, speed, checkpointIndex, checkpoints, gameSettings]);

  useEffect(() => {
    if (!startedAt || phase === 'ready' || phase === 'finished') {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setClockTick((tick) => tick + 1);
    }, 100);

    return () => clearInterval(intervalId);
  }, [startedAt, phase]);

  useEffect(
    () => () => {
      clearTimeout(timeoutRef.current);
      clearTimeout(runTimeoutRef.current);
      cancelAnimationFrame(animationRef.current);
    },
    [],
  );

  function updateSetting(key, value) {
    setGameSettings((settings) => ({
      ...settings,
      [key]: value,
    }));
  }

  function updateLeaderboardSetting(key, value) {
    setLeaderboardSettings((settings) => ({
      ...settings,
      [key]: value,
    }));
  }

  function openLeaderboard() {
    setIsRulesOpen(false);
    setLeaderboardSettings(gameSettings);
    setIsLeaderboardOpen(true);
    setIsLeaderboardSettingsOpen(false);
  }

  function closeLeaderboard() {
    setIsLeaderboardOpen(false);
    setIsLeaderboardSettingsOpen(false);
  }

  function openStartSettings() {
    setIsRulesOpen(false);
    closeLeaderboard();
    setPhase('ready');
    setFeedback('Wähle deine Runde.');
  }

  async function saveLeaderboardEntry(event) {
    event.preventDefault();

    if (phase !== 'finished' || !finishTime || savedRaceId === finishTime || isSavingLeaderboard) {
      return;
    }

    const entryName = playerName.trim().slice(0, 18) || 'Spieler';
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: entryName,
      date: new Date().toISOString(),
      settings: { ...gameSettings },
      settingsKey,
      difficultyLabel: selectedDifficulty.label,
      factorRangeLabel,
      routeLabel: routeConfig.label,
      routeMeters: routeConfig.meters,
      stops: routeConfig.stops,
      answerCount: gameSettings.answerCount,
      totalSeconds,
      mistakes: raceSummary.totalMistakes,
      averageAnswerSeconds: raceSummary.averageAnswerSeconds,
      fastestAnswerSeconds: raceSummary.fastestAnswerSeconds,
      topSpeed: raceSummary.topSpeed,
    };

    setIsSavingLeaderboard(true);
    setLeaderboardError('');

    let savedEntry = entry;
    try {
      if (SUPABASE_ENABLED) {
        savedEntry = await saveSupabaseLeaderboardEntry(entry);
        setLeaderboardStatus('online');
      } else {
        setLeaderboardStatus('local');
      }
    } catch {
      setLeaderboardStatus('error');
      setLeaderboardError('Konnte nicht in Supabase speichern. Der Eintrag bleibt lokal gespeichert.');
    }

    setLeaderboardEntries((entries) => {
      const settingEntries = [...entries.filter((entry) => entry.settingsKey === settingsKey), savedEntry];
      const nextEntries = mergeLeaderboardEntries(entries, settingsKey, settingEntries);
      persistLocalLeaderboard(nextEntries);
      return nextEntries;
    });
    saveLastPlayerName(entryName);
    setPlayerName(entryName);
    setSavedRaceId(finishTime);
    setIsSavingLeaderboard(false);
  }

  function resetToReady() {
    clearTimeout(timeoutRef.current);
    clearTimeout(runTimeoutRef.current);
    cancelAnimationFrame(animationRef.current);
    setIsRulesOpen(false);
    closeLeaderboard();
    setRunDurationMs(0);
    setPhase('ready');
    setProgress(0);
    setSpeed(BASE_SPEED);
    setCheckpointIndex(0);
    setQuestion(makeQuestion(gameSettings));
    setWrongAnswers([]);
    setRunnerState('standing');
    setFeedback('Wähle deine Runde.');
    setStartedAt(null);
    setFinishTime(null);
    setAnswerStats([]);
    setClockTick(0);
    setSavedRaceId(null);
    setConfettiBurstId(0);
  }

  function startGame() {
    clearTimeout(timeoutRef.current);
    clearTimeout(runTimeoutRef.current);
    cancelAnimationFrame(animationRef.current);
    setIsRulesOpen(false);
    closeLeaderboard();
    setRunDurationMs(0);
    setPhase('running');
    setProgress(0);
    setSpeed(BASE_SPEED);
    setCheckpointIndex(0);
    setQuestion(makeQuestion(gameSettings));
    setWrongAnswers([]);
    setRunnerState('running');
    setFeedback('Los gehts!');
    setStartedAt(performance.now());
    setFinishTime(null);
    setAnswerStats([]);
    setClockTick(0);
    setSavedRaceId(null);
    setConfettiBurstId(0);
  }

  function continueRunning(nextSpeed) {
    clearTimeout(timeoutRef.current);
    setCheckpointIndex((index) => index + 1);
    setPhase('celebrating');
    setRunnerState('cheering');
    setFeedback('Richtig!');
    setSpeed(nextSpeed);

    timeoutRef.current = setTimeout(() => {
      setRunnerState('running');
      setPhase('running');
      setFeedback('Weiterlaufen!');
    }, 650);
  }

  function chooseAnswer(answer) {
    if (phase !== 'quiz') {
      return;
    }

    if (answer === question.correct) {
      const elapsed = answerStartedAt ? (performance.now() - answerStartedAt) / 1000 : 6;
      const boost = elapsed < 2 ? 1.9 : elapsed < 5 ? 1 : 0.35;
      const nextSpeed = clamp(speed + boost, MIN_SPEED, MAX_SPEED);

      setAnswerStats((stats) => [
        ...stats,
        {
          id: `${checkpointIndex}-${question.a}-${question.b}`,
          checkpoint: checkpointIndex + 1,
          task: `${question.a} × ${question.b}`,
          correct: question.correct,
          selected: answer,
          mistakes: wrongAnswers.length,
          wrongAnswers,
          answerSeconds: elapsed,
          boost,
          speedBefore: speed,
          speedAfter: nextSpeed,
        },
      ]);
      setConfettiBurstId((id) => id + 1);
      continueRunning(nextSpeed);
      return;
    }

    clearTimeout(timeoutRef.current);
    setWrongAnswers((answers) => [...new Set([...answers, answer])]);
    setSpeed((currentSpeed) => clamp(currentSpeed - 1.15, MIN_SPEED, MAX_SPEED));
    setRunnerState('sad');
    setFeedback('Knapp daneben. Versuch es nochmal.');

    timeoutRef.current = setTimeout(() => {
      setRunnerState('standing');
      setFeedback('Du darfst nochmal tippen.');
    }, 650);
  }

  const isQuizOpen = phase === 'quiz';
  const isGameActive = phase === 'running' || phase === 'quiz' || phase === 'celebrating';
  const progressLabel = `${Math.round(progress)}%`;
  const speedLabel = `${speed.toFixed(1)} m/s`;
  const timeLabel = phase === 'finished' ? formatSeconds(totalSeconds) : startedAt ? formatSeconds(totalSeconds) : '0.0 s';
  const hasSavedCurrentRace = finishTime !== null && savedRaceId === finishTime;
  const leaderboardSummaryText = `${leaderboardDifficulty.label}, ${leaderboardFactorRangeLabel}, ${leaderboardRouteConfig.meters} m, ${leaderboardSettings.answerCount} Antworten`;
  const shouldShowLeaderboardStatus = leaderboardStatus === 'error' && leaderboardError;

  return (
    <main className="app-shell">
      <section className="game-stage" aria-label="MatheLäufer Spiel">
        <div className="skyline" aria-hidden="true">
          <span className="cloud cloud-1" />
          <span className="cloud cloud-2" />
          <span className="sun" />
        </div>

        <header className="hud" aria-label="Spielstand">
          <div className="brand-lockup">
            <div>
              <h1>MatheLäufer</h1>
              <p>{selectedDifficulty.label} im Laufmodus</p>
            </div>
          </div>
          {isGameActive && (
            <div className="status-row">
              <StatusPill label="Tempo" value={speedLabel} />
              <StatusPill label="Strecke" value={`${coveredMeters}/${routeConfig.meters} m`} />
              <StatusPill label="Zeit" value={timeLabel} />
            </div>
          )}
        </header>

        {confettiBurstId > 0 && <ConfettiBurst key={confettiBurstId} pieces={confettiPieces} />}

        <div className="track-wrap">
          <div className="finish-flag" aria-hidden="true">
            Ziel
          </div>
          <div className="track" style={{ '--run-duration': `${runDurationMs}ms` }}>
            <div className="track-progress" style={{ width: progressLabel }} />
            {checkpoints.map((checkpoint, index) => (
              <span
                key={checkpoint}
                className={`checkpoint ${index < checkpointIndex ? 'checkpoint--done' : ''}`}
                style={{ left: `${checkpoint}%` }}
                aria-hidden="true"
              />
            ))}
            <Runner progress={progress} state={runnerState} />
          </div>
          <div className="forest" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>

        {phase === 'home' && (
          <div className="home-start">
            <button className="primary-action home-start-button" type="button" onClick={openStartSettings}>
              Spiel starten
            </button>
            <button className="secondary-action home-start-button" type="button" onClick={openLeaderboard}>
              Rangliste
            </button>
          </div>
        )}

        <footer className="control-strip">
          <div className="feedback" aria-live="polite">
            {feedback}
          </div>
          {phase !== 'home' && phase !== 'ready' && phase !== 'finished' && (
            <button className="primary-action" type="button" onClick={resetToReady}>
              Neu starten
            </button>
          )}
        </footer>
      </section>

      {isQuizOpen && (
        <section className="quiz-panel" aria-label="Matheaufgabe">
          <div className="quiz-card">
            <div className="quiz-meta">
              <span>Stopp {checkpointIndex + 1} von {checkpoints.length}</span>
              <strong>{nextCheckpoint}% der Strecke</strong>
            </div>
            <h2>
              {question.a} × {question.b} = ?
            </h2>
            <div className="answer-grid">
              {question.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`answer-button ${wrongAnswers.includes(option) ? 'answer-button--wrong' : ''}`}
                  disabled={wrongAnswers.includes(option)}
                  onClick={(event) => {
                    event.currentTarget.blur();
                    chooseAnswer(option);
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {phase === 'ready' && (
        <section className="start-panel" aria-label="Startbildschirm">
          <div className="start-card start-card--setup">
            <div className="start-card-header">
              <div>
                <h2>Tippe schnell, laufe schneller.</h2>
                <p>Der Läufer stoppt an den Markierungen. Richtige Antworten geben Tempo, falsche Antworten bremsen.</p>
              </div>
              <button
                aria-label="Spielregeln anzeigen"
                className="help-button"
                type="button"
                onClick={() => setIsRulesOpen(true)}
              >
                ?
              </button>
            </div>
            <DifficultyPanel settings={gameSettings} onChange={updateSetting}>
              <p className="settings-preview">
                {factorRangeLabel}, {routeConfig.meters} m, {routeConfig.stops} Aufgaben, {gameSettings.answerCount} Antworten
              </p>
            </DifficultyPanel>
            <div className="start-actions">
              <button className="primary-action primary-action--large" type="button" onClick={startGame}>
                Spiel starten
              </button>
              <button className="secondary-action secondary-action--large" type="button" onClick={openLeaderboard}>
                Rangliste
              </button>
            </div>
          </div>
        </section>
      )}

      {phase === 'ready' && isRulesOpen && (
        <section className="rules-panel" aria-label="Spielregeln" aria-modal="true" role="dialog">
          <div className="rules-card">
            <div className="rules-header">
              <h2>Spielregeln</h2>
              <button
                aria-label="Spielregeln schließen"
                className="rules-close-button"
                type="button"
                onClick={() => setIsRulesOpen(false)}
              >
                ×
              </button>
            </div>
            <ol className="rules-list">
              <li>Wähle Schwierigkeit, Zahlenreihen und Streckenlänge aus.</li>
              <li>Der Läufer läuft automatisch bis zur nächsten Markierung.</li>
              <li>An jedem Stopp erscheint eine Einmaleins-Aufgabe mit 4, 6 oder 8 Antworten.</li>
              <li>Bei einer richtigen Antwort läuft der Läufer weiter.</li>
              <li>Schnelle richtige Antworten geben mehr Tempo.</li>
              <li>Falsche Antworten bremsen den Läufer, du darfst aber weiter raten.</li>
              <li>Am Ziel siehst du deine Rennzeit und eine Statistik zu allen Antworten.</li>
            </ol>
            <button className="primary-action" type="button" onClick={() => setIsRulesOpen(false)}>
              Verstanden
            </button>
          </div>
        </section>
      )}

      {(phase === 'home' || phase === 'ready') && isLeaderboardOpen && (
        <section className="leaderboard-panel" aria-label="Rangliste" aria-modal="true" role="dialog">
          <div className="leaderboard-card">
            <div className="leaderboard-header">
              <div>
                <h2>Top 100 Rangliste</h2>
              </div>
              <button
                aria-label="Rangliste schließen"
                className="rules-close-button"
                type="button"
                onClick={closeLeaderboard}
              >
                ×
              </button>
            </div>
            <div className="leaderboard-summary" aria-label="Gewählte Ranglistenoptionen">
              <span>{leaderboardSummaryText}</span>
              <button
                className="secondary-action leaderboard-change-button"
                type="button"
                onClick={() => setIsLeaderboardSettingsOpen(true)}
              >
                Optionen ändern
              </button>
            </div>
            {shouldShowLeaderboardStatus && (
              <p className="leaderboard-status leaderboard-status--error" aria-live="polite">
                {leaderboardError}
              </p>
            )}
            {selectedLeaderboard.length > 0 ? (
              <ol className="leaderboard-list">
                {selectedLeaderboard.map((entry) => (
                  <li className="leaderboard-row" key={entry.id}>
                    <span className="leaderboard-rank">{entry.rank}</span>
                    <strong>{entry.name}</strong>
                    <span>{formatSeconds(entry.totalSeconds)}</span>
                    <span>{entry.mistakes} Fehler</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-leaderboard">Für diese Einstellung gibt es noch keinen Eintrag.</p>
            )}
            <button className="primary-action" type="button" onClick={closeLeaderboard}>
              Schließen
            </button>
          </div>
        </section>
      )}

      {(phase === 'home' || phase === 'ready') && isLeaderboardOpen && isLeaderboardSettingsOpen && (
        <section
          className="leaderboard-settings-panel"
          aria-label="Ranglistenoptionen"
          aria-modal="true"
          role="dialog"
        >
          <div className="leaderboard-settings-card">
            <div className="leaderboard-header">
              <div>
                <h2>Rangliste wählen</h2>
                <p>{leaderboardSummaryText}</p>
              </div>
              <button
                aria-label="Ranglistenoptionen schließen"
                className="rules-close-button"
                type="button"
                onClick={() => setIsLeaderboardSettingsOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="leaderboard-filter" aria-label="Ranglistenmodus auswählen">
              <div className="setup-group">
                <span className="setup-label">Schwierigkeit</span>
                <div className="segmented-control" role="group" aria-label="Schwierigkeit für Rangliste wählen">
                  {DIFFICULTY_OPTIONS.map((option) => (
                    <button
                      className={`segment-button ${leaderboardSettings.difficulty === option.id ? 'segment-button--active' : ''}`}
                      key={option.id}
                      type="button"
                      onClick={() => updateLeaderboardSetting('difficulty', option.id)}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="checkbox-row">
                <input
                  checked={leaderboardSettings.skipEasyRows}
                  type="checkbox"
                  onChange={(event) => updateLeaderboardSetting('skipEasyRows', event.target.checked)}
                />
                <span>1er- und 2er-Reihe weglassen</span>
              </label>

              <label className="checkbox-row">
                <input
                  checked={leaderboardSettings.skipTenRow}
                  type="checkbox"
                  onChange={(event) => updateLeaderboardSetting('skipTenRow', event.target.checked)}
                />
                <span>10er-Reihe weglassen</span>
              </label>

              <div className="leaderboard-filter-grid">
                <div className="setup-group">
                  <span className="setup-label">Strecke</span>
                  <div
                    className="segmented-control segmented-control--routes"
                    role="group"
                    aria-label="Streckenlänge für Rangliste wählen"
                  >
                    {ROUTE_OPTIONS.map((option) => (
                      <button
                        className={`segment-button ${leaderboardSettings.routeLength === option.id ? 'segment-button--active' : ''}`}
                        key={option.id}
                        type="button"
                        onClick={() => updateLeaderboardSetting('routeLength', option.id)}
                      >
                        <strong>{option.label}</strong>
                        <span>{option.meters} m</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="setup-group">
                  <span className="setup-label">Antworten</span>
                  <div
                    className="segmented-control segmented-control--answers"
                    role="group"
                    aria-label="Antwortanzahl für Rangliste wählen"
                  >
                    {ANSWER_COUNT_OPTIONS.map((count) => (
                      <button
                        className={`segment-button ${leaderboardSettings.answerCount === count ? 'segment-button--active' : ''}`}
                        key={count}
                        type="button"
                        onClick={() => updateLeaderboardSetting('answerCount', count)}
                      >
                        <strong>{count}</strong>
                        <span>Antworten</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button className="primary-action" type="button" onClick={() => setIsLeaderboardSettingsOpen(false)}>
              Rangliste anzeigen
            </button>
          </div>
        </section>
      )}

      {phase === 'finished' && (
        <section className="finish-panel" aria-label="Ziel erreicht">
          <div className="finish-card finish-card--summary">
            <div className="finish-header">
              <div>
                <h2>Geschafft!</h2>
                <p>Du bist die Strecke in {formatSeconds(totalSeconds)} gelaufen.</p>
              </div>
              <button className="primary-action primary-action--large" type="button" onClick={resetToReady}>
                Neu starten
              </button>
            </div>

            <div className="summary-grid" aria-label="Rennstatistik">
              <div className="summary-item">
                <span>Modus</span>
                <strong>{factorRangeLabel}</strong>
              </div>
              <div className="summary-item">
                <span>Strecke</span>
                <strong>{routeConfig.meters} m</strong>
              </div>
              <div className="summary-item">
                <span>Aufgaben</span>
                <strong>{raceSummary.answered}/{checkpoints.length}</strong>
              </div>
              <div className="summary-item">
                <span>Antworten</span>
                <strong>{gameSettings.answerCount}</strong>
              </div>
              <div className="summary-item">
                <span>Fehlversuche</span>
                <strong>{raceSummary.totalMistakes}</strong>
              </div>
              <div className="summary-item">
                <span>Schnitt</span>
                <strong>{formatSeconds(raceSummary.averageAnswerSeconds)}</strong>
              </div>
              <div className="summary-item">
                <span>Schnellste</span>
                <strong>{formatSeconds(raceSummary.fastestAnswerSeconds)}</strong>
              </div>
              <div className="summary-item">
                <span>Bester Boost</span>
                <strong>+{raceSummary.biggestBoost.toFixed(1)}</strong>
              </div>
              <div className="summary-item">
                <span>Top-Tempo</span>
                <strong>{raceSummary.topSpeed.toFixed(1)} m/s</strong>
              </div>
            </div>

            <form className="leaderboard-save" onSubmit={saveLeaderboardEntry}>
              <label>
                <span>Name für Rangliste</span>
                <input
                  disabled={hasSavedCurrentRace || isSavingLeaderboard}
                  maxLength="18"
                  placeholder="Name"
                  type="text"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                />
              </label>
              <button className="secondary-action" disabled={hasSavedCurrentRace || isSavingLeaderboard} type="submit">
                {isSavingLeaderboard ? 'Speichert...' : hasSavedCurrentRace ? 'Gespeichert' : 'Eintragen'}
              </button>
            </form>

            <div className="leaderboard-preview" aria-label="Rangliste für diese Einstellung">
              <h3>Top 100 für diese Einstellung</h3>
              {shouldShowLeaderboardStatus && (
                <p className="leaderboard-status leaderboard-status--error" aria-live="polite">
                  {leaderboardError}
                </p>
              )}
              {raceLeaderboard.length > 0 ? (
                <ol className="leaderboard-list">
                  {raceLeaderboard.map((entry) => (
                    <li className="leaderboard-row" key={entry.id}>
                      <span className="leaderboard-rank">{entry.rank}</span>
                      <strong>{entry.name}</strong>
                      <span>{formatSeconds(entry.totalSeconds)}</span>
                      <span>{entry.mistakes} Fehler</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty-leaderboard">Speichere dein Rennen, um den ersten Eintrag anzulegen.</p>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
