/** Singularise grossièrement un mot français ("oeufs" -> "oeuf") pour faire matcher pluriels et singuliers. */
export function singularize(word: string): string {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

/** "beurre mou", "oeuf" et "oeufs" doivent tous matcher leur produit de base ("beurre", "oeufs"), même mal accordés ou qualifiés. */
export function ingredientMatchesStaple(ingredientName: string, stapleName: string): boolean {
  const words = ingredientName.trim().toLowerCase().split(/\s+/).map(singularize);
  return words.includes(singularize(stapleName.toLowerCase()));
}

/** Famille d'un nom d'ingrédient pour la fusion des doublons (premier mot, singularisé) : "beurre mou" et "oeufs" -> "beurre", "oeuf". */
export function ingredientFamily(ingredientName: string): string {
  const firstWord = ingredientName.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return singularize(firstWord);
}
