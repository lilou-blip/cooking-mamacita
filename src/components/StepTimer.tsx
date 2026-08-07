import { useEffect, useState } from "react";
import { formatTimer } from "../lib/stepTimer";
import { showNotification } from "../lib/notifications";
import "./StepTimer.css";

interface StepTimerProps {
  seconds: number;
}

export function StepTimer({ seconds: initialSeconds }: StepTimerProps) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!running || remaining <= 0 || done) return;
    const id = setTimeout(() => {
      setRemaining((r) => {
        const next = Math.max(0, r - 1);
        if (next === 0) {
          setDone(true);
          void showNotification("Minuteur terminé ⏱", { body: "C'est prêt !", tag: "step-timer" });
        }
        return next;
      });
    }, 1000);
    return () => clearTimeout(id);
  }, [running, remaining, done]);

  function reset() {
    setRunning(false);
    setDone(false);
    setRemaining(initialSeconds);
  }

  if (done) {
    return (
      <div className="step-timer step-timer--done">
        <span>✅ Terminé !</span>
        <button type="button" onClick={reset} aria-label="Relancer le minuteur">
          ↺
        </button>
      </div>
    );
  }

  if (running || remaining !== initialSeconds) {
    return (
      <div className="step-timer step-timer--active">
        <span className="step-timer__clock">{formatTimer(remaining)}</span>
        <button type="button" onClick={() => setRunning((r) => !r)} aria-label={running ? "Pause" : "Reprendre"}>
          {running ? "⏸" : "▶"}
        </button>
        <button type="button" onClick={reset} aria-label="Réinitialiser le minuteur">
          ×
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="step-timer step-timer--start" onClick={() => setRunning(true)}>
      ⏱ {formatTimer(initialSeconds)}
    </button>
  );
}
