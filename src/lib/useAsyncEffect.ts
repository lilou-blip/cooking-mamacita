import { useEffect, useState, type DependencyList } from "react";

/**
 * Lance `load` au montage, en suivant loading/error de façon uniforme. Sans ça, un rejet non intercepté
 * dans un des nombreux "useEffect(() => { (async () => {...})() }, [])" du projet laisse le composant
 * bloqué sur son écran de chargement pour toujours (setLoading(false) n'étant jamais atteint) — vécu une
 * première fois sur AuthGate, retrouvé ensuite à l'identique sur chaque écran qui charge ses données au
 * montage.
 *
 * `loading`/`error` ne sont PAS remis à zéro si `deps` change après le montage initial (ce que fait cette
 * lib volontairement, pour ne pas remettre un setState synchrone en tête d'effet) : tous les appelants
 * actuels passent des deps référentiellement stables (tableau vide, ou callback issu d'un useCallback([])),
 * donc l'effet ne se relance jamais en pratique. Un futur appelant avec des deps qui changent réellement
 * verrait l'ancien loading/error persister brièvement pendant le nouveau chargement.
 */
export function useAsyncEffect(load: () => Promise<void>, deps: DependencyList): { loading: boolean; error: string | null } {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { loading, error };
}
