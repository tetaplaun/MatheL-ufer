import React, { useEffect, useMemo, useRef, useState } from 'react';

const DIFFICULTY_OPTIONS = [
  { id: 'small', label: 'Kleines Einmaleins', maxFactor: 10, description: 'bis 10 × 10' },
  { id: 'large', label: 'Großes Einmaleins', maxFactor: 20, description: 'bis 20 × 20' },
];

const ROUTE_OPTIONS = [
  { id: 'short', label: 'Kurz', meters: 300, stops: 5 },
  { id: 'medium', label: 'Mittel', meters: 500, stops: 7 },
  { id: 'long', label: 'Lang', meters: 800, stops: 10 },
];

const ANSWER_COUNT_OPTIONS = [4, 6, 8];

const DEFAULT_SETTINGS = {
  difficulty: 'small',
  skipEasyRows: false,
  skipTenRow: false,
  routeLength: 'medium',
  answerCount: 4,
};

const MIN_SPEED = 2.2;
const BASE_SPEED = 5.2;
const MAX_SPEED = 11.5;
const FINISH_PROGRESS = 100;
const LEADERBOARD_KEY = 'mathelaeufer-leaderboard';
const LAST_PLAYER_NAME_KEY = 'mathelaeufer-last-player-name';
const MAX_LEADERBOARD_ENTRIES = 100;
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const SUPABASE_LEADERBOARD_TABLE = 'leaderboard_entries';
const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const formatSeconds = (seconds) => `${seconds.toFixed(1)} s`;
const makeCheckpoints = (stops) =>
  Array.from({ length: stops }, (_, index) => Math.round(((index + 1) / (stops + 1)) * FINISH_PROGRESS));
const makeFactorPool = (settings, maxFactor) => {
  const minFactor = settings.skipEasyRows ? 3 : 1;
  return Array.from({ length: maxFactor - minFactor + 1 }, (_, index) => minFactor + index).filter(
    (factor) => !(settings.skipTenRow && factor === 10),
  );
};
const pickFactor = (factors) => factors[randomInt(0, factors.length - 1)];
const makeSettingsKey = (settings) =>
  [
    settings.difficulty,
    settings.skipEasyRows ? 'ohne-1-2' : 'mit-1-2',
    settings.skipTenRow ? 'ohne-10' : 'mit-10',
    settings.routeLength,
    `${settings.answerCount}-antworten`,
  ].join('|');
const formatFactorRange = (settings, maxFactor) => {
  const minFactor = settings.skipEasyRows ? 3 : 1;
  const effectiveMax = settings.skipTenRow && maxFactor === 10 ? 9 : maxFactor;
  const suffix = settings.skipTenRow && maxFactor > 10 ? ' ohne 10er' : '';
  return `${minFactor}er bis ${effectiveMax}er Reihe${suffix}`;
};
const compareLeaderboardEntries = (a, b) =>
  a.totalSeconds - b.totalSeconds || a.mistakes - b.mistakes || a.averageAnswerSeconds - b.averageAnswerSeconds;
const makeLeaderboardScoreKey = (entry) => `${Math.round(entry.totalSeconds * 10)}|${entry.mistakes}`;
const addLeaderboardRanks = (entries) => {
  let lastScoreKey = '';
  let currentRank = 0;

  return entries.map((entry, index) => {
    const scoreKey = makeLeaderboardScoreKey(entry);

    if (scoreKey !== lastScoreKey) {
      currentRank = index + 1;
      lastScoreKey = scoreKey;
    }

    return {
      ...entry,
      rank: currentRank,
    };
  });
};
const persistLocalLeaderboard = (entries) => {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
  } catch {
    // The in-memory list still updates if browser storage is unavailable.
  }
};
const loadLeaderboard = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const loadLastPlayerName = () => {
  try {
    return localStorage.getItem(LAST_PLAYER_NAME_KEY) ?? '';
  } catch {
    return '';
  }
};
const supabaseHeaders = () => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
});
const mapSupabaseEntry = (row) => ({
  id: row.id,
  name: row.player_name,
  date: row.created_at,
  settingsKey: row.settings_key,
  difficultyLabel: row.difficulty_label,
  factorRangeLabel: row.factor_range_label,
  routeLabel: row.route_label,
  routeMeters: Number(row.route_meters) || 0,
  stops: Number(row.stops) || 0,
  answerCount: Number(row.answer_count) || 0,
  totalSeconds: Number(row.total_seconds) || 0,
  mistakes: Number(row.mistakes) || 0,
  averageAnswerSeconds: Number(row.average_answer_seconds) || 0,
  fastestAnswerSeconds: Number(row.fastest_answer_seconds) || 0,
  topSpeed: Number(row.top_speed) || 0,
});
const mapEntryToSupabase = (entry) => ({
  player_name: entry.name,
  settings_key: entry.settingsKey,
  difficulty_label: entry.difficultyLabel,
  factor_range_label: entry.factorRangeLabel,
  route_label: entry.routeLabel,
  route_meters: entry.routeMeters,
  stops: entry.stops,
  answer_count: entry.answerCount,
  total_seconds: entry.totalSeconds,
  mistakes: entry.mistakes,
  average_answer_seconds: entry.averageAnswerSeconds,
  fastest_answer_seconds: entry.fastestAnswerSeconds,
  top_speed: entry.topSpeed,
});
const loadSupabaseLeaderboard = async (settingsKey) => {
  const params = new URLSearchParams({
    select:
      'id,player_name,settings_key,difficulty_label,factor_range_label,route_label,route_meters,stops,answer_count,total_seconds,mistakes,average_answer_seconds,fastest_answer_seconds,top_speed,created_at',
    settings_key: `eq.${settingsKey}`,
    order: 'total_seconds.asc,mistakes.asc,average_answer_seconds.asc',
    limit: '10',
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_LEADERBOARD_TABLE}?${params.toString()}`, {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    throw new Error('Supabase leaderboard could not be loaded.');
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows.map(mapSupabaseEntry) : [];
};
const saveSupabaseLeaderboardEntry = async (entry) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_LEADERBOARD_TABLE}`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(mapEntryToSupabase(entry)),
  });

  if (!response.ok) {
    throw new Error('Supabase leaderboard entry could not be saved.');
  }

  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? mapSupabaseEntry(rows[0]) : entry;
};

function makeQuestion(settings) {
  const difficulty = DIFFICULTY_OPTIONS.find((option) => option.id === settings.difficulty) ?? DIFFICULTY_OPTIONS[0];
  const maxFactor = difficulty.maxFactor;
  const factors = makeFactorPool(settings, maxFactor);
  const a = pickFactor(factors);
  const b = pickFactor(factors);
  const correct = a * b;
  const options = new Set([correct]);

  while (options.size < settings.answerCount) {
    const drift = randomInt(-(maxFactor + 4), maxFactor + 4);
    const nearby = correct + drift;
    const tableLike = pickFactor(factors) * pickFactor(factors);
    const candidate = Math.random() > 0.45 ? nearby : tableLike;

    if (candidate > 0 && candidate !== correct) {
      options.add(candidate);
    }
  }

  return {
    a,
    b,
    correct,
    options: [...options].sort(() => Math.random() - 0.5),
  };
}

function Runner({ progress, state }) {
  const isCheering = state === 'cheering';

  return (
    <div
      className={`runner runner--${state}`}
      style={{ left: `clamp(18px, ${progress}%, calc(100% - 86px))` }}
      aria-label={`Läufer ${state}`}
    >
      <svg viewBox="0 0 96 112" role="img" aria-hidden="true">
        <g className="runner-shadow">
          <ellipse cx="48" cy="103" rx="27" ry="6" />
        </g>
        <g className="runner-body">
          <circle className="skin" cx="48" cy="22" r="15" />
          <path className="hair" d="M34 19c4-13 25-14 30 0-9-5-19-6-30 0Z" />
          <circle className="eye" cx="43" cy="21" r="2.1" />
          <circle className="eye" cx="54" cy="21" r="2.1" />
          <path className="mouth mouth-smile" d="M42 29c4 5 10 5 14 0" />
          <path className="mouth mouth-sad" d="M42 31c4-4 10-4 14 0" />
          <path className="torso" d="M35 42c7-8 20-8 27 0l-4 31H39L35 42Z" />
          <path className="bib" d="M43 47h11l2 15H41l2-15Z" />
          <path className="arm arm-left" d={isCheering ? 'M37 48 25 25' : 'M37 48 22 62'} />
          <path className="arm arm-right" d={isCheering ? 'M59 48 73 24' : 'M59 48 77 56'} />
          <path className="leg leg-left" d="M43 72 29 93" />
          <path className="leg leg-right" d="M55 72 71 92" />
          <circle className="shoe" cx="28" cy="94" r="5" />
          <circle className="shoe" cx="72" cy="93" r="5" />
          <path className="spark spark-left" d="M26 33 14 27M27 40l-14 2" />
          <path className="spark spark-right" d="M69 34 82 27M70 41l13 4" />
        </g>
      </svg>
    </div>
  );
}

function StatusPill({ label, value }) {
  return (
    <div className="status-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function App() {
  const [gameSettings, setGameSettings] = useState(DEFAULT_SETTINGS);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [leaderboardEntries, setLeaderboardEntries] = useState(() => loadLeaderboard());
  const [leaderboardStatus, setLeaderboardStatus] = useState(SUPABASE_ENABLED ? 'loading' : 'local');
  const [leaderboardError, setLeaderboardError] = useState('');
  const [playerName, setPlayerName] = useState(() => loadLastPlayerName());
  const [savedRaceId, setSavedRaceId] = useState(null);
  const [isSavingLeaderboard, setIsSavingLeaderboard] = useState(false);
  const [phase, setPhase] = useState('ready');
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

  const animationRef = useRef(null);
  const timeoutRef = useRef(null);
  const runTimeoutRef = useRef(null);

  const selectedDifficulty = DIFFICULTY_OPTIONS.find((option) => option.id === gameSettings.difficulty) ?? DIFFICULTY_OPTIONS[0];
  const routeConfig = ROUTE_OPTIONS.find((option) => option.id === gameSettings.routeLength) ?? ROUTE_OPTIONS[1];
  const checkpoints = useMemo(() => makeCheckpoints(routeConfig.stops), [routeConfig.stops]);
  const factorRangeLabel = formatFactorRange(gameSettings, selectedDifficulty.maxFactor);
  const settingsKey = makeSettingsKey(gameSettings);
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
  const currentLeaderboard = useMemo(
    () =>
      addLeaderboardRanks(
        leaderboardEntries
          .filter((entry) => entry.settingsKey === settingsKey)
          .sort(compareLeaderboardEntries)
          .slice(0, 10),
      ),
    [leaderboardEntries, settingsKey],
  );

  useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setLeaderboardStatus('local');
      return undefined;
    }

    let isCurrent = true;
    setLeaderboardStatus('loading');
    setLeaderboardError('');

    loadSupabaseLeaderboard(settingsKey)
      .then((remoteEntries) => {
        if (!isCurrent) {
          return;
        }

        setLeaderboardEntries((entries) => {
          const nextEntries = [...entries.filter((entry) => entry.settingsKey !== settingsKey), ...remoteEntries]
            .sort(compareLeaderboardEntries)
            .slice(0, MAX_LEADERBOARD_ENTRIES);
          persistLocalLeaderboard(nextEntries);
          return nextEntries;
        });
        setLeaderboardStatus('online');
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }

        setLeaderboardStatus('error');
        setLeaderboardError('Supabase nicht erreichbar. Lokale Rangliste wird angezeigt.');
      });

    return () => {
      isCurrent = false;
    };
  }, [settingsKey]);

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
      const nextEntries = [...entries, savedEntry].sort(compareLeaderboardEntries).slice(0, MAX_LEADERBOARD_ENTRIES);
      persistLocalLeaderboard(nextEntries);
      return nextEntries;
    });
    try {
      localStorage.setItem(LAST_PLAYER_NAME_KEY, entryName);
    } catch {
      // Keeping the current field value is enough if browser storage is unavailable.
    }
    setPlayerName(entryName);
    setSavedRaceId(finishTime);
    setIsSavingLeaderboard(false);
  }

  function resetToReady() {
    clearTimeout(timeoutRef.current);
    clearTimeout(runTimeoutRef.current);
    cancelAnimationFrame(animationRef.current);
    setIsRulesOpen(false);
    setIsLeaderboardOpen(false);
    setRunDurationMs(0);
    setPhase('ready');
    setProgress(0);
    setSpeed(BASE_SPEED);
    setCheckpointIndex(0);
    setQuestion(makeQuestion(gameSettings));
    setWrongAnswers([]);
    setRunnerState('standing');
    setFeedback('Bereit?');
    setStartedAt(null);
    setFinishTime(null);
    setAnswerStats([]);
    setClockTick(0);
    setSavedRaceId(null);
  }

  function startGame() {
    clearTimeout(timeoutRef.current);
    clearTimeout(runTimeoutRef.current);
    cancelAnimationFrame(animationRef.current);
    setIsRulesOpen(false);
    setIsLeaderboardOpen(false);
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
  const progressLabel = `${Math.round(progress)}%`;
  const speedLabel = `${speed.toFixed(1)} m/s`;
  const timeLabel = phase === 'finished' ? formatSeconds(totalSeconds) : startedAt ? formatSeconds(totalSeconds) : '0.0 s';
  const hasSavedCurrentRace = finishTime !== null && savedRaceId === finishTime;
  const leaderboardStatusText =
    leaderboardStatus === 'loading'
      ? 'Online-Rangliste wird geladen.'
      : leaderboardStatus === 'online'
        ? 'Online-Rangliste über Supabase.'
        : leaderboardStatus === 'error'
          ? leaderboardError
          : 'Lokale Rangliste im Browser.';

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
            <span className="brand-mark">×</span>
            <div>
              <h1>MatheLäufer</h1>
              <p>{selectedDifficulty.label} im Laufmodus</p>
            </div>
          </div>
          <div className="status-row">
            <StatusPill label="Tempo" value={speedLabel} />
            <StatusPill label="Strecke" value={`${coveredMeters}/${routeConfig.meters} m`} />
            <StatusPill label="Zeit" value={timeLabel} />
          </div>
        </header>

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

        <footer className="control-strip">
          <div className="feedback" aria-live="polite">
            {feedback}
          </div>
          <button className="primary-action" type="button" onClick={phase === 'ready' ? startGame : resetToReady}>
            {phase === 'ready' ? 'Start' : 'Runde einstellen'}
          </button>
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
            <div className="setup-panel" aria-label="Rundeneinstellungen">
              <div className="setup-group">
                <span className="setup-label">Schwierigkeit</span>
                <div className="segmented-control" role="group" aria-label="Schwierigkeit wählen">
                  {DIFFICULTY_OPTIONS.map((option) => (
                    <button
                      className={`segment-button ${gameSettings.difficulty === option.id ? 'segment-button--active' : ''}`}
                      key={option.id}
                      type="button"
                      onClick={() => updateSetting('difficulty', option.id)}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="checkbox-row">
                <input
                  checked={gameSettings.skipEasyRows}
                  type="checkbox"
                  onChange={(event) => updateSetting('skipEasyRows', event.target.checked)}
                />
                <span>1er- und 2er-Reihe weglassen</span>
              </label>

              <label className="checkbox-row">
                <input
                  checked={gameSettings.skipTenRow}
                  type="checkbox"
                  onChange={(event) => updateSetting('skipTenRow', event.target.checked)}
                />
                <span>10er-Reihe weglassen</span>
              </label>

              <div className="setup-group">
                <span className="setup-label">Streckenlänge</span>
                <div className="segmented-control segmented-control--routes" role="group" aria-label="Streckenlänge wählen">
                  {ROUTE_OPTIONS.map((option) => (
                    <button
                      className={`segment-button ${gameSettings.routeLength === option.id ? 'segment-button--active' : ''}`}
                      key={option.id}
                      type="button"
                      onClick={() => updateSetting('routeLength', option.id)}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.meters} m · {option.stops} Stopps</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="setup-group">
                <span className="setup-label">Antwortmöglichkeiten</span>
                <div className="segmented-control segmented-control--answers" role="group" aria-label="Anzahl Antwortmöglichkeiten wählen">
                  {ANSWER_COUNT_OPTIONS.map((count) => (
                    <button
                      className={`segment-button ${gameSettings.answerCount === count ? 'segment-button--active' : ''}`}
                      key={count}
                      type="button"
                      onClick={() => updateSetting('answerCount', count)}
                    >
                      <strong>{count}</strong>
                      <span>Antworten</span>
                    </button>
                  ))}
                </div>
              </div>

              <p className="settings-preview">
                {factorRangeLabel}, {routeConfig.meters} m, {routeConfig.stops} Aufgaben, {gameSettings.answerCount} Antworten
              </p>
            </div>
            <div className="start-actions">
              <button className="primary-action primary-action--large" type="button" onClick={startGame}>
                Spiel starten
              </button>
              <button className="secondary-action secondary-action--large" type="button" onClick={() => setIsLeaderboardOpen(true)}>
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

      {phase === 'ready' && isLeaderboardOpen && (
        <section className="leaderboard-panel" aria-label="Rangliste" aria-modal="true" role="dialog">
          <div className="leaderboard-card">
            <div className="leaderboard-header">
              <div>
                <h2>Rangliste</h2>
                <p>{factorRangeLabel}, {routeConfig.meters} m, {gameSettings.answerCount} Antworten</p>
              </div>
              <button
                aria-label="Rangliste schließen"
                className="rules-close-button"
                type="button"
                onClick={() => setIsLeaderboardOpen(false)}
              >
                ×
              </button>
            </div>
            <p className={`leaderboard-status leaderboard-status--${leaderboardStatus}`} aria-live="polite">
              {leaderboardStatusText}
            </p>
            {currentLeaderboard.length > 0 ? (
              <ol className="leaderboard-list">
                {currentLeaderboard.map((entry) => (
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
            <button className="primary-action" type="button" onClick={() => setIsLeaderboardOpen(false)}>
              Schließen
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
                Neue Runde einstellen
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
              <h3>Rangliste für diese Einstellung</h3>
              <p className={`leaderboard-status leaderboard-status--${leaderboardStatus}`} aria-live="polite">
                {leaderboardStatusText}
              </p>
              {currentLeaderboard.length > 0 ? (
                <ol className="leaderboard-list">
                  {currentLeaderboard.map((entry) => (
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
