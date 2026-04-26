import React, { useEffect, useMemo, useRef, useState } from 'react';

const CHECKPOINTS = [14, 28, 42, 56, 70, 84, 96];
const MIN_SPEED = 2.2;
const BASE_SPEED = 5.2;
const MAX_SPEED = 11.5;
const FINISH_PROGRESS = 100;

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function makeQuestion() {
  const a = randomInt(1, 10);
  const b = randomInt(1, 10);
  const correct = a * b;
  const options = new Set([correct]);

  while (options.size < 4) {
    const drift = randomInt(-14, 14);
    const nearby = correct + drift;
    const tableLike = randomInt(1, 10) * randomInt(1, 10);
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
  const [phase, setPhase] = useState('ready');
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(BASE_SPEED);
  const [checkpointIndex, setCheckpointIndex] = useState(0);
  const [question, setQuestion] = useState(() => makeQuestion());
  const [runnerState, setRunnerState] = useState('standing');
  const [feedback, setFeedback] = useState('Bereit?');
  const [wrongAnswers, setWrongAnswers] = useState([]);
  const [answerStartedAt, setAnswerStartedAt] = useState(null);
  const [finishTime, setFinishTime] = useState(null);
  const [startedAt, setStartedAt] = useState(null);

  const animationRef = useRef(null);
  const lastFrameRef = useRef(null);
  const timeoutRef = useRef(null);

  const nextCheckpoint = CHECKPOINTS[checkpointIndex] ?? FINISH_PROGRESS;
  const coveredMeters = Math.round(progress * 5);
  const totalSeconds = useMemo(() => {
    const end = finishTime ?? performance.now();
    return startedAt ? Math.max(0, (end - startedAt) / 1000) : 0;
  }, [finishTime, startedAt, phase, progress]);

  useEffect(() => {
    if (phase !== 'running') {
      cancelAnimationFrame(animationRef.current);
      lastFrameRef.current = null;
      return undefined;
    }

    const tick = (now) => {
      if (!lastFrameRef.current) {
        lastFrameRef.current = now;
      }

      const deltaSeconds = Math.min(0.05, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      setProgress((current) => {
        const next = clamp(current + speed * deltaSeconds, 0, FINISH_PROGRESS);
        const stopAt = CHECKPOINTS[checkpointIndex];

        if (stopAt && next >= stopAt) {
          setPhase('quiz');
          setRunnerState('braking');
          setQuestion(makeQuestion());
          setWrongAnswers([]);
          setAnswerStartedAt(performance.now());
          setFeedback('Wähle die richtige Antwort.');
          return stopAt;
        }

        if (next >= FINISH_PROGRESS) {
          setPhase('finished');
          setRunnerState('cheering');
          setFinishTime(performance.now());
          setFeedback('Ziel erreicht!');
          return FINISH_PROGRESS;
        }

        return next;
      });

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationRef.current);
  }, [phase, speed, checkpointIndex]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  function startGame() {
    clearTimeout(timeoutRef.current);
    setPhase('running');
    setProgress(0);
    setSpeed(BASE_SPEED);
    setCheckpointIndex(0);
    setQuestion(makeQuestion());
    setWrongAnswers([]);
    setRunnerState('running');
    setFeedback('Los gehts!');
    setStartedAt(performance.now());
    setFinishTime(null);
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
      continueRunning(clamp(speed + boost, MIN_SPEED, MAX_SPEED));
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
  const timeLabel = phase === 'finished' ? `${totalSeconds.toFixed(1)} s` : startedAt ? `${totalSeconds.toFixed(1)} s` : '0.0 s';

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
              <p>Kleines Einmaleins im Laufmodus</p>
            </div>
          </div>
          <div className="status-row">
            <StatusPill label="Tempo" value={speedLabel} />
            <StatusPill label="Strecke" value={`${coveredMeters} m`} />
            <StatusPill label="Zeit" value={timeLabel} />
          </div>
        </header>

        <div className="track-wrap">
          <div className="finish-flag" aria-hidden="true">
            Ziel
          </div>
          <div className="track">
            <div className="track-progress" style={{ width: progressLabel }} />
            {CHECKPOINTS.map((checkpoint, index) => (
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
          <button className="primary-action" type="button" onClick={startGame}>
            {phase === 'ready' ? 'Start' : 'Neu starten'}
          </button>
        </footer>
      </section>

      {isQuizOpen && (
        <section className="quiz-panel" aria-label="Matheaufgabe">
          <div className="quiz-card">
            <div className="quiz-meta">
              <span>Stopp {checkpointIndex + 1} von {CHECKPOINTS.length}</span>
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
                  onClick={() => chooseAnswer(option)}
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
          <div className="start-card">
            <h2>Tippe schnell, laufe schneller.</h2>
            <p>Der Läufer stoppt an den Markierungen. Richtige Antworten geben Tempo, falsche Antworten bremsen.</p>
            <button className="primary-action primary-action--large" type="button" onClick={startGame}>
              Spiel starten
            </button>
          </div>
        </section>
      )}

      {phase === 'finished' && (
        <section className="finish-panel" aria-label="Ziel erreicht">
          <div className="finish-card">
            <h2>Geschafft!</h2>
            <p>Du bist die Strecke in {totalSeconds.toFixed(1)} Sekunden gelaufen.</p>
            <button className="primary-action primary-action--large" type="button" onClick={startGame}>
              Noch eine Runde
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
