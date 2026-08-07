import { useEffect, useRef } from "react";

/** Empêche l'écran de s'éteindre tant que `active` est vrai (ex: en mode cuisine, mains occupées/sales).
 * Sans effet si l'API n'est pas supportée (Safari < 16.4) plutôt que de planter. */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Refusé (économie de batterie, onglet déjà caché...) : tant pis, pas bloquant.
      }
    }

    void acquire();

    // Le système relâche automatiquement le verrou quand l'onglet passe en arrière-plan : le redemander
    // au retour au premier plan tant que le mode cuisine est toujours actif.
    function onVisibilityChange() {
      if (document.visibilityState === "visible" && !sentinelRef.current) void acquire();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, [active]);
}
