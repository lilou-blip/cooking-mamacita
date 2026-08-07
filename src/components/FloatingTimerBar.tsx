import { useTimers } from "../lib/useTimers";
import { formatTimer } from "../lib/stepTimer";
import "./FloatingTimerBar.css";

/** Bandeau discret listant tous les minuteurs en cours, visible partout dans l'app (pas juste sur l'étape
 * où ils ont été lancés) — pour ne pas perdre de vue une cuisson en cours en changeant d'écran. */
export function FloatingTimerBar() {
  const { timers, toggleRunning, resetTimer } = useTimers();
  if (timers.length === 0) return null;

  return (
    <div className="floating-timers" role="status">
      {timers.map((t) => (
        <div key={t.id} className={`floating-timers__item${t.done ? " floating-timers__item--done" : ""}`}>
          <span className="floating-timers__label">{t.label}</span>
          <span className="floating-timers__clock">{t.done ? "✅" : formatTimer(t.remainingSeconds)}</span>
          {!t.done && (
            <button type="button" onClick={() => toggleRunning(t.id)} aria-label={t.running ? "Pause" : "Reprendre"}>
              {t.running ? "⏸" : "▶"}
            </button>
          )}
          <button type="button" onClick={() => resetTimer(t.id)} aria-label="Retirer ce minuteur">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
