import { useEffect, useMemo, useState, type ReactNode } from "react";
import { showNotification } from "./notifications";
import { alertTimerDone } from "./timerAlert";
import { TimerContext, type TimerContextValue, type TimerEntry } from "./timerTypes";

/**
 * Minuteurs partagés dans toute l'app (pas juste dans le composant qui les affiche) : démarrer un minuteur
 * sur une étape puis naviguer ailleurs (autre étape, autre écran) ne doit pas le faire disparaître — c'est
 * tout l'intérêt du bandeau multi-minuteurs flottant, qui lit le même état.
 */
export function TimerProvider({ children }: { children: ReactNode }) {
  const [timers, setTimers] = useState<Record<string, TimerEntry>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      setTimers((prev) => {
        let changed = false;
        const next: Record<string, TimerEntry> = {};
        for (const [id, t] of Object.entries(prev)) {
          if (t.running && !t.done) {
            const remaining = Math.max(0, t.remainingSeconds - 1);
            const done = remaining <= 0;
            if (done) {
              void showNotification(`⏱ ${t.label}`, { body: "C'est prêt !", tag: `timer-${id}` });
              alertTimerDone();
            }
            next[id] = { ...t, remainingSeconds: remaining, running: !done, done };
            changed = true;
          } else {
            next[id] = t;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const value = useMemo<TimerContextValue>(
    () => ({
      timers: Object.values(timers).sort((a, b) => a.remainingSeconds - b.remainingSeconds),
      getTimer: (id) => timers[id],
      startTimer: (id, label, seconds) => {
        setTimers((prev) => {
          if (prev[id]) return prev; // déjà démarré ailleurs : ne pas écraser sa progression
          return { ...prev, [id]: { id, label, totalSeconds: seconds, remainingSeconds: seconds, running: true, done: false } };
        });
      },
      toggleRunning: (id) => {
        setTimers((prev) => {
          const t = prev[id];
          if (!t || t.done) return prev;
          return { ...prev, [id]: { ...t, running: !t.running } };
        });
      },
      // Retire le minuteur (remise à zéro complète) : utilisé aussi bien pour "annuler en cours" que pour
      // "relancer depuis le début" une fois terminé, puisque dans les deux cas on repart du bouton de départ.
      resetTimer: (id) => {
        setTimers((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      },
      // "+1 minute" : utile pour rallonger sans tout recalculer, y compris pour redémarrer un minuteur déjà
      // terminé ("ah zut, il en faut encore un peu") plutôt que d'avoir à le relancer depuis zéro.
      addMinute: (id) => {
        setTimers((prev) => {
          const t = prev[id];
          if (!t) return prev;
          return {
            ...prev,
            [id]: { ...t, remainingSeconds: t.remainingSeconds + 60, totalSeconds: t.totalSeconds + 60, running: true, done: false },
          };
        });
      },
    }),
    [timers],
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}
