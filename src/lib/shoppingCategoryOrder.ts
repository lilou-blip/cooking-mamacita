import { INGREDIENT_CATEGORIES } from "./constants";

const STORAGE_KEY = "mamacita:shopping-category-order";

/** Ordre des rayons pour la liste de courses, personnalisable pour coller au plan du magasin de
 * l'utilisateur — persisté localement (préférence d'appareil, pas de données à synchroniser). */
export function getCategoryOrder(): string[] {
  const known = INGREDIENT_CATEGORIES.map((c) => c.value);
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(saved) && saved.every((v) => typeof v === "string")) {
      const knownSet = new Set(known);
      const filtered = saved.filter((v): v is string => knownSet.has(v));
      // Ajoute toute catégorie pas encore présente dans l'ordre sauvegardé (ex: après une mise à jour de l'app).
      const missing = known.filter((v) => !filtered.includes(v));
      return [...filtered, ...missing];
    }
  } catch {
    // JSON invalide ou localStorage indisponible : retombe sur l'ordre par défaut ci-dessous.
  }
  return known;
}

export function saveCategoryOrder(order: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}

export function swapCategories(order: string[], a: string, b: string): string[] {
  const iA = order.indexOf(a);
  const iB = order.indexOf(b);
  if (iA === -1 || iB === -1) return order;
  const next = [...order];
  [next[iA], next[iB]] = [next[iB], next[iA]];
  return next;
}
