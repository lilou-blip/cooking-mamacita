import { useTimers } from "../lib/TimerContext";
import { formatTimer } from "../lib/stepTimer";
import "./StepTimer.css";

interface StepTimerProps {
  id: string;
  label: string;
  seconds: number;
}

export function StepTimer({ id, label, seconds }: StepTimerProps) {
  const { getTimer, startTimer, toggleRunning, resetTimer } = useTimers();
  const timer = getTimer(id);

  if (!timer) {
    return (
      <button type="button" className="step-timer step-timer--start" onClick={() => startTimer(id, label, seconds)}>
        ⏱ {formatTimer(seconds)}
      </button>
    );
  }

  if (timer.done) {
    return (
      <div className="step-timer step-timer--done">
        <span>✅ Terminé !</span>
        <button type="button" onClick={() => resetTimer(id)} aria-label="Relancer le minuteur">
          ↺
        </button>
      </div>
    );
  }

  return (
    <div className="step-timer step-timer--active">
      <span className="step-timer__clock">{formatTimer(timer.remainingSeconds)}</span>
      <button type="button" onClick={() => toggleRunning(id)} aria-label={timer.running ? "Pause" : "Reprendre"}>
        {timer.running ? "⏸" : "▶"}
      </button>
      <button type="button" onClick={() => resetTimer(id)} aria-label="Réinitialiser le minuteur">
        ×
      </button>
    </div>
  );
}
