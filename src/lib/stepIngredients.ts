import type { RecipeIngredientView } from "./db";

const FILLER_WORDS = new Set(["de", "du", "des", "d", "la", "le", "les", "au", "aux", "en", "a", "et", "un", "une", "l"]);

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
export function matchIngredientsInStep(instruction: string, ingredients: RecipeIngredientView[]): RecipeIngredientView[] {
  const stepWords = new Set(
    normalize(instruction)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/),
  );
  return ingredients.filter((ing) => significantWords(ing.ingredient_name).some((w) => stepWords.has(w)));
}
