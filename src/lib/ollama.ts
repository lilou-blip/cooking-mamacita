import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { listAllTags, listPantryItems, listRecipesWithTags, listUnits, type Tag, type TagCategory, type Unit } from "./db";
import { INGREDIENT_CATEGORIES, TAG_CATEGORY_LABELS, TAG_CATEGORY_ORDER } from "./constants";

/** Les erreurs d'Edge Function de supabase-js n'exposent qu'un message générique ("non-2xx status code") ;
 * le vrai message qu'on a renvoyé nous-même est dans le corps de la réponse, accessible via error.context. */
async function describeFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === "string") return body.error;
    } catch {
      // pas de corps JSON exploitable, on retombe sur le message générique ci-dessous
    }
  }
  return error instanceof Error ? error.message : String(error);
}

async function callAiJson(systemPrompt: string, userMessage: string, numPredict = 400): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke<{ content: string }>("ai-proxy", {
    body: { systemPrompt, userMessage, numPredict },
  });
  if (error) throw new Error(`Impossible de contacter l'IA : ${await describeFunctionError(error)}`);
  try {
    return JSON.parse(data!.content);
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

Tags — utilise uniquement ces valeurs exactes de "category" et "name" (n'en invente pas d'autres) :
${tagsByCategory}
Choisis TOUJOURS au moins un tag de la catégorie "type" (entrée/plat/dessert/apéritif/boisson) qui correspond à la recette, plus les autres tags pertinents qui sont évidents (régime, goût, saison, température). Ne laisse jamais "tags" vide.

Catégories d'ingrédients — utilise uniquement ces valeurs exactes pour "category" : ${categoryList}
Attention aux pièges courants : le chocolat, le cacao, la farine, le sucre, la levure, la vanille, l'huile, les épices vont dans "epicerie" (ce sont des produits d'épicerie/de placard, pas des boissons). "boissons" ne sert QUE pour les liquides qu'on boit tels quels (eau, jus, soda, vin, café, thé infusé...). Le lait, la crème, le beurre, le fromage, le yaourt vont dans "laitages".

Unités — pour "unit_abbreviation", utilise UNIQUEMENT une de ces abréviations exactes, ou null : ${unitList}
Choisis toujours une unité de poids ou volume adaptée (g, kg, ml, cl, l, c. à c., c. à s.) pour tout ingrédient qui se mesure en poids ou en volume (farine, sucre, beurre, chocolat, lait, huile, crème...) — ne mets JAMAIS quantity sans unit_abbreviation pour ces ingrédients-là. N'utilise "pièce" que pour des ingrédients comptés un par un (œufs, gousses d'ail, tranches, fruits entiers...). N'invente jamais une unité qui n'est pas dans la liste ci-dessus (par exemple "unité" n'existe pas, utilise "pièce").`;
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

/** Récupère le texte brut (balises HTML retirées) d'une page web, pour l'import de recette par URL. */
export async function fetchRecipeTextFromUrl(url: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ text: string }>("fetch-page", { body: { url } });
  if (error) throw new Error(`Impossible de récupérer la page : ${await describeFunctionError(error)}`);
  return data!.text;
}

export async function structureRecipeFromText(rawText: string): Promise<RecipeDraft> {
  const [tags, units] = await Promise.all([listAllTags(), listUnits()]);
  const systemPrompt = buildSystemPrompt(tags, units);
  const parsed = await callAiJson(systemPrompt, rawText, 700);
  return normalizeDraft(parsed, tags, units);
}

/** Propose une recette "vide-frigo" inventée par l'IA en utilisant en priorité les aliments du garde-manger fournis (les plus proches de la péremption en premier). */
export async function generateVideFrigoRecipe(
  items: { name: string; daysLeft: number | null }[],
): Promise<RecipeDraft> {
  const [tags, units] = await Promise.all([listAllTags(), listUnits()]);
  const systemPrompt = buildSystemPrompt(tags, units);

  const ingredientList = items
    .slice(0, 6)
    .map((i) => `${i.name}${i.daysLeft != null ? ` (à utiliser dans ${Math.max(0, Math.round(i.daysLeft))} jour(s))` : ""}`)
    .join(", ");
  const userMessage = `Voici des ingrédients disponibles dans le garde-manger, à utiliser en priorité car proches de la péremption : ${ingredientList}.
Propose UNE recette simple et classique de cuisine familiale française (le genre de plat du quotidien : gratin, soupe, poêlée, quiche, omelette, salade composée, pâtes, riz sauté...), réalisable avec des techniques basiques.
Choisis SEULEMENT les ingrédients de la liste qui se marient bien ensemble dans un même plat cohérent — tu n'es pas obligé de tous les utiliser, ignore ceux qui ne conviendraient pas à la même recette (par exemple ne mélange pas un ingrédient sucré et un plat salé sauf si c'est un dessert). Complète avec des ingrédients de base courants (sel, poivre, huile, épices, oignon, ail...) si besoin.
Le résultat doit être un plat crédible que quelqu'un cuisinerait vraiment chez soi, pas une association improbable.`;

  const parsed = await callAiJson(systemPrompt, userMessage, 700);
  return normalizeDraft(parsed, tags, units);
}

export interface MenuSuggestion {
  recipe_id: number;
  servings: number;
}

export async function suggestMenuRecipes(context: string, targetServings: number): Promise<MenuSuggestion[]> {
  const [recipes, pantryItems] = await Promise.all([listRecipesWithTags(), listPantryItems()]);
  if (recipes.length === 0) return [];

  const pantryNames = new Set(pantryItems.map((i) => i.ingredient_name.trim().toLowerCase()));
  const soonNames = new Set(
    pantryItems
      .filter((i) => {
        if (!i.expires_at) return false;
        const days = (new Date(i.expires_at).getTime() - Date.now()) / 86_400_000;
        return days <= 5;
      })
      .map((i) => i.ingredient_name.trim().toLowerCase()),
  );

  const recipeList = recipes
    .map((r) => {
      const inStock = r.ingredient_names.filter((n) => pantryNames.has(n.trim().toLowerCase()));
      const soon = inStock.filter((n) => soonNames.has(n.trim().toLowerCase()));
      const stockNote =
        inStock.length > 0
          ? ` | déjà en stock : ${inStock.join(", ")}${soon.length > 0 ? ` (dont à utiliser bientôt : ${soon.join(", ")})` : ""}`
          : "";
      return `${r.id} | ${r.title} | ${r.tags.map((t) => t.name).join(", ") || "sans tag"}${stockNote}`;
    })
    .join("\n");

  const systemPrompt = `Tu proposes un menu en piochant UNIQUEMENT parmi les recettes déjà enregistrées dans le carnet de l'utilisateur, en fonction de son contexte.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant/après :
{ "suggestions": [{"recipe_id": nombre, "servings": nombre}] }

Choisis uniquement des "recipe_id" présents dans la liste ci-dessous. N'invente jamais de recette ni d'id.
Propose entre 1 et 6 recettes pertinentes par rapport au contexte (varie les types si le contexte s'y prête : entrée, plat, dessert, apéritif, boisson).
À qualité égale par rapport au contexte, privilégie les recettes qui utilisent des ingrédients déjà présents dans le garde-manger (colonne "déjà en stock"), en particulier ceux à utiliser bientôt, pour éviter les achats inutiles et le gaspillage. Ce n'est qu'un critère parmi d'autres : ne sacrifie pas la pertinence par rapport au contexte pour ça.
Nombre de personnes visé pour "servings" : ${targetServings}.

Recettes disponibles (id | titre | tags | ingrédients déjà en stock) :
${recipeList}`;

  const parsed = await callAiJson(systemPrompt, context || "Propose un menu équilibré et varié.", 300);
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
  const parsed = await callAiJson(systemPrompt, `${qtyText}${ingredientName}`, 50);
  const obj = (parsed ?? {}) as Record<string, unknown>;

  const low = typeof obj.low === "number" && obj.low >= 0 ? obj.low : 0;
  const high = typeof obj.high === "number" && obj.high >= low ? obj.high : low + 1;

  return { low, high };
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

/** Discute avec l'assistante Mamacita, en tenant compte du contexte de la page consultée et de l'historique de la conversation. */
export async function chatWithAssistant(
  context: string,
  history: AssistantMessage[],
  userMessage: string,
): Promise<string> {
  const systemPrompt = `Tu es Mamacita, l'assistante de cuisine intégrée à l'application locale "Cooking Mamacita". Tu es chaleureuse, familière et concise (2 à 4 phrases maximum).
Règle absolue : tutoie toujours l'utilisateur, ne dis jamais "vous".
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant/après : {"reply": string}

Contexte actuel de l'application :
${context}

Règle absolue : ne t'appuie QUE sur les faits listés ci-dessus (noms de recettes, ingrédients, chiffres...). N'invente JAMAIS un nom de recette, un ingrédient ou un chiffre qui n'y figure pas. Si tu n'as pas l'information nécessaire pour répondre précisément, dis-le simplement au lieu d'inventer.
Règle absolue : si l'utilisateur te salue, fait la conversation ou dit quelque chose qui n'a aucun rapport avec le contexte ci-dessus, réponds normalement et naturellement à ce qu'il te dit (comme le ferait une personne), sans forcer un lien avec le contexte et sans sortir une phrase toute faite sur les recettes ou les courses.`;

  const historyText = history.map((m) => `${m.role === "user" ? "Utilisateur" : "Toi"}: ${m.content}`).join("\n");
  const fullUserMessage = historyText ? `${historyText}\nUtilisateur: ${userMessage}` : userMessage;

  const parsed = await callAiJson(systemPrompt, fullUserMessage, 200);
  const obj = (parsed ?? {}) as Record<string, unknown>;

  return typeof obj.reply === "string" && obj.reply.trim()
    ? obj.reply.trim()
    : "Désolée, je n'ai pas bien compris — tu peux reformuler ?";
}
