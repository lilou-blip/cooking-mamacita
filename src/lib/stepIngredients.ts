const FILLER_WORDS = new Set(["de", "du", "des", "d", "la", "le", "les", "au", "aux", "en", "a", "et", "un", "une", "l"]);

/** Sous-ensemble de RecipeIngredientView suffisant pour le rappel contextuel — permet de réutiliser la même
 * fonction pour une recette seule (ingrédients tels quels) et pour un plan de batch cooking combinant
 * plusieurs recettes (liste d'ingrédients agrégée depuis plusieurs fiches à la volée). */
export interface MatchableIngredient {
  id: number | string;
  ingredient_name: string;
  quantity: number | null;
  unit_abbreviation: string | null;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase();
}

function significantWords(name: string): string[] {
  return normalize(name)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !FILLER_WORDS.has(w));
}

/**
 * Ingrédients de la recette mentionnés dans le texte d'une étape (au moins un mot significatif de leur nom
 * y apparaît) — un rappel contextuel simple sans appel IA ni changement de schéma, pour ne pas avoir à
 * remonter en haut de la recette pendant qu'on cuisine.
 */
export function matchIngredientsInStep<T extends MatchableIngredient>(instruction: string, ingredients: T[]): T[] {
  const stepWords = new Set(
    normalize(instruction)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/),
  );
  return ingredients.filter((ing) => significantWords(ing.ingredient_name).some((w) => stepWords.has(w)));
}
