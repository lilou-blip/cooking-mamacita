import { invoke } from "@tauri-apps/api/core";
import { listAllTags, listRecipesWithTags, listUnits, type Tag, type TagCategory, type Unit } from "./db";
import { INGREDIENT_CATEGORIES, TAG_CATEGORY_LABELS, TAG_CATEGORY_ORDER } from "./constants";

const MODEL = "llama3.2";

async function callOllamaJson(systemPrompt: string, userMessage: string): Promise<unknown> {
  const content = await invoke<string>("ollama_chat", { systemPrompt, userMessage, model: MODEL });
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("L'IA n'a pas renvoyé un JSON valide. Réessaie.");
  }
}

export interface RecipeDraft {
  title: string;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  notes: string | null;
  tags: { category: TagCategory; name: string }[];
  ingredients: { name: string; category: string; quantity: number | null; unit_abbreviation: string | null }[];
  steps: string[];
}

function buildSystemPrompt(tags: Tag[], units: Unit[]): string {
  const tagsByCategory = TAG_CATEGORY_ORDER.map((cat) => {
    const names = tags
      .filter((t) => t.category === cat)
      .map((t) => t.name)
      .join(", ");
    return `- ${TAG_CATEGORY_LABELS[cat]} (category: "${cat}"): ${names}`;
  }).join("\n");

  const unitList = units.map((u) => u.abbreviation).join(", ");
  const categoryList = INGREDIENT_CATEGORIES.map((c) => c.value).join(", ");

  return `Tu structures des recettes de cuisine à partir d'un texte libre en français.
Réponds UNIQUEMENT avec un objet JSON valide (pas de texte avant/après, pas de balises markdown), respectant exactement ce schéma :
{
  "title": string,
  "servings": nombre (par défaut 4 si inconnu),
  "prep_time_minutes": nombre ou null,
  "cook_time_minutes": nombre ou null,
  "notes": string ou null,
  "tags": [{"category": string, "name": string}],
  "ingredients": [{"name": string, "category": string, "quantity": nombre ou null, "unit_abbreviation": string ou null}],
  "steps": [string, ...]
}

Tags valides — utilise uniquement ces valeurs exactes de "category" et "name" (choisis seulement les plus pertinents, n'en invente pas d'autres) :
${tagsByCategory}

Catégories d'ingrédients valides (utilise uniquement ces valeurs pour "category") : ${categoryList}
Unités valides (utilise uniquement ces abréviations exactes pour "unit_abbreviation", ou null si non applicable) : ${unitList}`;
}

function normalizeDraft(raw: unknown, tags: Tag[], units: Unit[]): RecipeDraft {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const validTagKeys = new Set(tags.map((t) => `${t.category}:${t.name}`));
  const validUnitAbbrs = new Set(units.map((u) => u.abbreviation));
  const validCategories = new Set(INGREDIENT_CATEGORIES.map((c) => c.value));

  const tagsOut = Array.isArray(obj.tags)
    ? obj.tags
        .filter(
          (t): t is { category: string; name: string } =>
            !!t && typeof t === "object" && validTagKeys.has(`${(t as { category?: string }).category}:${(t as { name?: string }).name}`),
        )
        .map((t) => ({ category: t.category as TagCategory, name: t.name }))
    : [];

  const ingredientsOut = Array.isArray(obj.ingredients)
    ? (obj.ingredients as Record<string, unknown>[])
        .filter((i) => i && typeof i.name === "string" && i.name.trim())
        .map((i) => ({
          name: String(i.name).trim(),
          category: typeof i.category === "string" && validCategories.has(i.category) ? i.category : "autre",
          quantity: typeof i.quantity === "number" ? i.quantity : null,
          unit_abbreviation:
            typeof i.unit_abbreviation === "string" && validUnitAbbrs.has(i.unit_abbreviation)
              ? i.unit_abbreviation
              : null,
        }))
    : [];

  const stepsOut = Array.isArray(obj.steps)
    ? obj.steps.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  return {
    title: typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : "Recette importée",
    servings: typeof obj.servings === "number" && obj.servings > 0 ? Math.round(obj.servings) : 4,
    prep_time_minutes: typeof obj.prep_time_minutes === "number" ? obj.prep_time_minutes : null,
    cook_time_minutes: typeof obj.cook_time_minutes === "number" ? obj.cook_time_minutes : null,
    notes: typeof obj.notes === "string" && obj.notes.trim() ? obj.notes.trim() : null,
    tags: tagsOut,
    ingredients: ingredientsOut,
    steps: stepsOut,
  };
}

export async function structureRecipeFromText(rawText: string): Promise<RecipeDraft> {
  const [tags, units] = await Promise.all([listAllTags(), listUnits()]);
  const systemPrompt = buildSystemPrompt(tags, units);
  const parsed = await callOllamaJson(systemPrompt, rawText);
  return normalizeDraft(parsed, tags, units);
}

export interface MenuSuggestion {
  recipe_id: number;
  servings: number;
}

export async function suggestMenuRecipes(context: string, targetServings: number): Promise<MenuSuggestion[]> {
  const recipes = await listRecipesWithTags();
  if (recipes.length === 0) return [];

  const recipeList = recipes
    .map((r) => `${r.id} | ${r.title} | ${r.tags.map((t) => t.name).join(", ") || "sans tag"}`)
    .join("\n");

  const systemPrompt = `Tu proposes un menu en piochant UNIQUEMENT parmi les recettes déjà enregistrées dans le carnet de l'utilisateur, en fonction de son contexte.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant/après :
{ "suggestions": [{"recipe_id": nombre, "servings": nombre}] }

Choisis uniquement des "recipe_id" présents dans la liste ci-dessous. N'invente jamais de recette ni d'id.
Propose entre 1 et 6 recettes pertinentes par rapport au contexte (varie les types si le contexte s'y prête : entrée, plat, dessert, apéritif, boisson).
Nombre de personnes visé pour "servings" : ${targetServings}.

Recettes disponibles (id | titre | tags) :
${recipeList}`;

  const parsed = await callOllamaJson(systemPrompt, context || "Propose un menu équilibré et varié.");
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const validIds = new Set(recipes.map((r) => r.id));

  const suggestions = Array.isArray(obj.suggestions)
    ? (obj.suggestions as Record<string, unknown>[])
        .filter((s) => s && typeof s.recipe_id === "number" && validIds.has(s.recipe_id))
        .map((s) => ({
          recipe_id: s.recipe_id as number,
          servings: typeof s.servings === "number" && s.servings > 0 ? Math.round(s.servings) : targetServings,
        }))
    : [];

  return suggestions;
}

export interface PriceRange {
  low: number;
  high: number;
}

export async function estimatePriceRange(
  ingredientName: string,
  quantity: number | null,
  unit: string | null,
): Promise<PriceRange> {
  const systemPrompt = `Tu estimes le prix approximatif d'un ingrédient de cuisine en euros, pour un achat en supermarché en France.
Réponds UNIQUEMENT avec un objet JSON valide : {"low": nombre, "high": nombre}
"low" et "high" sont une fourchette de prix réaliste en euros pour la quantité demandée (pas juste 100g/1 unité).`;

  const qtyText = quantity != null ? `${quantity}${unit ? " " + unit : ""} de ` : "";
  const parsed = await callOllamaJson(systemPrompt, `${qtyText}${ingredientName}`);
  const obj = (parsed ?? {}) as Record<string, unknown>;

  const low = typeof obj.low === "number" && obj.low >= 0 ? obj.low : 0;
  const high = typeof obj.high === "number" && obj.high >= low ? obj.high : low + 1;

  return { low, high };
}
