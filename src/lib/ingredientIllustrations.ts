const modules = import.meta.glob<{ default: string }>("../assets/ingredients/*.{png,jpg,jpeg,webp}", {
  eager: true,
});

/** "Pépites de chocolat" -> "pepites-de-chocolat" */
export function slugifyIngredientName(name: string): string {
  return name
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const illustrationsBySlug = new Map<string, string>();
for (const path in modules) {
  const fileName = path.split("/").pop() ?? "";
  const slug = slugifyIngredientName(fileName.replace(/\.[^.]+$/, ""));
  illustrationsBySlug.set(slug, modules[path].default);
}

const FILLER_WORDS = new Set(["de", "du", "des", "d", "la", "le", "les", "au", "aux", "en", "a", "et", "un", "une"]);

/** Mots significatifs d'un slug, sans les mots de liaison, avec un pluriel simple retiré ("pepites" -> "pepite"). */
function coreWords(slug: string): string[] {
  return slug
    .split("-")
    .filter((w) => w && !FILLER_WORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

/**
 * Renvoie l'URL de l'illustration correspondant à un ingrédient, si elle a été fournie dans src/assets/ingredients/.
 * À défaut de correspondance exacte, cherche l'illustration dont les mots significatifs sont tous présents dans le nom
 * de l'ingrédient (ex: "poudre de noisette" -> illustration "noisette", "pépites de chocolat" -> illustration
 * "pepite-chocolat"), en préférant la correspondance la plus spécifique (le plus de mots en commun).
 */
export function getIngredientIllustration(name: string): string | undefined {
  const slug = slugifyIngredientName(name);

  const exact = illustrationsBySlug.get(slug);
  if (exact) return exact;

  const ingredientWords = coreWords(slug);
  let bestScore = 0;
  let bestSrc: string | undefined;
  for (const [key, src] of illustrationsBySlug) {
    const keyWords = coreWords(key);
    if (keyWords.length > bestScore && keyWords.every((w) => ingredientWords.includes(w))) {
      bestScore = keyWords.length;
      bestSrc = src;
    }
  }
  return bestSrc;
}
