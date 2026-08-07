import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  listAllTags,
  listPantryItems,
  listRecipesWithTags,
  listUnits,
  type NutritionEstimate,
  type Tag,
  type TagCategory,
  type Unit,
} from "./db";
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
Attention aux pièges courants :
- "matieres_grasses" : beurre, huiles (olive, tournesol, colza...), margarine, saindoux, graisse de canard.
- "sucreries" : sucre (blanc, roux, cassonade, glace, vanillé), miel, chocolat (noir/lait/blanc/pépites/cacao en poudre), confiture, pâte à tartiner, caramel, bonbons, sirop d'érable/agave.
- "laitages" : lait, crème (fraîche/liquide), fromage (râpé, blanc, et tous les fromages), yaourt — mais PAS le beurre, qui va dans "matieres_grasses".
- "epicerie" : le reste du placard sec et des condiments — farine, levure, bicarbonate, sel, poivre, épices, herbes séchées, vinaigre, moutarde, sauces, bouillon cube, extrait de vanille (sans sucre), fécule, fruits secs/oléagineux (amandes, noix, noisettes...).
- "boissons" ne sert QUE pour les liquides qu'on boit tels quels (eau, jus, soda, vin, bière, café, thé infusé...).

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

/** Recette photographiée (manuscrite, page d'un livre de cuisine, capture d'écran...) : même schéma que
 * structureRecipeFromText mais lue directement depuis l'image (Claude sait lire une écriture manuscrite). */
export async function structureRecipeFromImage(imageBase64: string, mediaType: string): Promise<RecipeDraft> {
  const [tags, units] = await Promise.all([listAllTags(), listUnits()]);
  const systemPrompt = `${buildSystemPrompt(tags, units)}
La recette t'est donnée en photo (manuscrite, page de livre de cuisine, capture d'écran...) : lis-la attentivement, y compris si l'écriture est manuscrite ou l'image légèrement inclinée/floue.`;

  const { data, error } = await supabase.functions.invoke<{ content: string }>("ai-proxy", {
    body: {
      systemPrompt,
      userMessage: "Voici la photo de la recette à structurer.",
      numPredict: 900,
      image: imageBase64,
      mediaType,
    },
  });
  if (error) throw new Error(`Impossible de lire la recette : ${await describeFunctionError(error)}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(data!.content);
  } catch {
    throw new Error("L'IA n'a pas renvoyé un JSON valide. Réessaie avec une photo plus nette.");
  }

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

/** Estimation nutritionnelle approximative d'une recette PAR PORTION (pas pour la recette entière) —
 * à partir de la liste d'ingrédients à l'échelle de base (recipe.servings), pour que le résultat reste
 * valable quel que soit le nombre de portions affiché ensuite sur la fiche. */
export async function estimateNutrition(
  recipeTitle: string,
  servings: number,
  ingredients: { name: string; quantity: number | null; unit: string | null }[],
): Promise<NutritionEstimate> {
  const systemPrompt = `Tu estimes la valeur nutritionnelle approximative d'une recette de cuisine familiale.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant/après : {"calories": nombre, "protein_g": nombre, "carbs_g": nombre, "fat_g": nombre}
Ces 4 valeurs sont PAR PORTION (divise le total de la recette par le nombre de portions indiqué), pas pour toute la recette. Sois cohérent : calories ≈ protein_g*4 + carbs_g*4 + fat_g*9 (à peu près). Donne des nombres entiers réalistes pour un plat familial, pas des valeurs extrêmes.`;

  const ingredientsText = ingredients
    .map((i) => `- ${i.quantity != null ? `${i.quantity}${i.unit ? " " + i.unit : ""} de ` : ""}${i.name}`)
    .join("\n");
  const userMessage = `Recette : ${recipeTitle} (${servings} portion(s) au total)\nIngrédients pour toute la recette :\n${ingredientsText}`;

  const parsed = await callAiJson(systemPrompt, userMessage, 100);
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && v >= 0 ? Math.round(v) : 0);

  return {
    calories: num(obj.calories),
    protein_g: num(obj.protein_g),
    carbs_g: num(obj.carbs_g),
    fat_g: num(obj.fat_g),
  };
}

export const PRICE_COMPARISON_RETAILERS = ["Carrefour", "E.Leclerc", "Auchan", "Intermarché", "Lidl", "Aldi"] as const;

export interface RetailerTotal {
  retailer: string;
  total: number;
}

/**
 * Comparateur de prix par enseigne, sur le total d'une liste de courses entière (pas produit par produit) —
 * un seul appel IA pour toute la liste, plus rapide et plus pertinent que comparer article par article.
 * Il ne s'agit PAS de prix scrapés en temps réel sur les sites des enseignes (trop fragile et à la limite de
 * leurs conditions d'utilisation pour être fiable) mais d'une estimation comparative par l'IA, qui reflète le
 * positionnement prix connu de chaque enseigne (Lidl/Aldi moins chers que Carrefour/Auchan en général, etc.).
 */
export async function estimateListTotalByRetailer(
  items: { name: string; quantity: number | null; unit: string | null }[],
): Promise<RetailerTotal[]> {
  if (items.length === 0) return [];

  const retailerList = PRICE_COMPARISON_RETAILERS.join(", ");
  const itemsText = items
    .map((i) => `- ${i.quantity != null ? `${i.quantity}${i.unit ? " " + i.unit : ""} de ` : ""}${i.name}`)
    .join("\n");

  const systemPrompt = `Tu estimes le coût total d'une liste de courses complète dans différentes enseignes de supermarché françaises, pour aider à savoir où faire ses courses reviendrait le moins cher.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant/après, respectant exactement ce schéma :
{"retailers": [{"name": string, "total": nombre}]}
Donne une ligne pour CHACUNE de ces enseignes, dans cet ordre : ${retailerList}.
"total" est le coût réaliste en euros de TOUTE la liste ci-dessous réunie, dans cette enseigne — pas un article isolé. Base-toi sur le positionnement tarifaire connu de chaque enseigne (les enseignes discount comme Lidl et Aldi reviennent en général moins cher sur un panier complet, Carrefour/Auchan/E.Leclerc/Intermarché sont proches les uns des autres). Varie les totaux entre enseignes plutôt que de mettre la même valeur partout.

Liste de courses :
${itemsText}`;

  const parsed = await callAiJson(systemPrompt, "Calcule le total de cette liste pour chaque enseigne.", 300);
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(obj.retailers) ? (obj.retailers as Record<string, unknown>[]) : [];

  const byName = new Map(
    rows
      .filter((r) => r && typeof r.name === "string" && typeof r.total === "number" && r.total >= 0)
      .map((r) => [String(r.name), r.total as number]),
  );

  return PRICE_COMPARISON_RETAILERS.filter((name) => byName.has(name)).map((name) => ({
    retailer: name,
    total: byName.get(name)!,
  }));
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
  const systemPrompt = `Tu es Mamacita, l'assistante de cuisine intégrée à l'application "Cooking Mamacita". Tu es chaleureuse, familière et concise (2 à 4 phrases maximum).
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

export interface ReceiptItem {
  name: string;
  quantity: number | null;
  price: number | null;
}

/** Envoie la photo d'un ticket de caisse à l'IA (Claude sait lire une image directement) pour en extraire les articles achetés. */
export async function scanReceipt(imageBase64: string, mediaType: string): Promise<ReceiptItem[]> {
  const systemPrompt = `Tu lis une photo de ticket de caisse de supermarché et tu en extrais les articles achetés.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant/après, respectant exactement ce schéma :
{"items": [{"name": string, "quantity": nombre ou null, "price": nombre ou null}]}

"name" est le nom du produit en français, simplifié et compréhensible pour quelqu'un qui range ses courses (pas le libellé de caisse abrégé, ex: "PDT ECOSSE 2KG" devient "pommes de terre").
"price" est le prix payé pour la ligne, en euros.
Ignore les lignes qui ne sont pas des articles achetés (total, sous-total, remises, moyen de paiement, numéro de ticket, TVA, adresse du magasin...).
Si la photo est illisible ou n'est manifestement pas un ticket de caisse, réponds {"items": []}.`;

  const { data, error } = await supabase.functions.invoke<{ content: string }>("ai-proxy", {
    body: {
      systemPrompt,
      userMessage: "Voici la photo du ticket de caisse.",
      numPredict: 1500,
      image: imageBase64,
      mediaType,
    },
  });
  if (error) throw new Error(`Impossible d'analyser le ticket : ${await describeFunctionError(error)}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(data!.content);
  } catch {
    throw new Error("L'IA n'a pas renvoyé un JSON valide. Réessaie avec une photo plus nette.");
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const items = Array.isArray(obj.items) ? (obj.items as Record<string, unknown>[]) : [];

  return items
    .filter((i) => i && typeof i === "object" && typeof i.name === "string" && i.name.trim())
    .map((i) => ({
      name: String(i.name).trim(),
      quantity: typeof i.quantity === "number" && i.quantity > 0 ? i.quantity : null,
      price: typeof i.price === "number" && i.price >= 0 ? i.price : null,
    }));
}

export interface BatchCookingPlan {
  plan: string[];
  storage: { title: string; advice: string }[];
}

/** Propose un ordre efficace pour cuisiner plusieurs recettes à la suite lors d'une séance de batch cooking
 * (fours/plaques mutualisés, préparations communes regroupées, temps d'attente d'une recette utilisés pour
 * avancer une autre...), plus un conseil de conservation par recette (frigo/congélation, durée). */
export async function suggestBatchCookingPlan(
  recipes: { title: string; ingredients: string[]; steps: string[] }[],
): Promise<BatchCookingPlan> {
  if (recipes.length === 0) return { plan: [], storage: [] };

  const systemPrompt = `Tu aides à organiser une séance de batch cooking : cuisiner plusieurs recettes à la suite le plus efficacement possible (fours/plaques utilisés en parallèle, préparations communes regroupées comme couper tous les oignons en une fois, temps d'attente/cuisson d'une recette utilisés pour avancer une autre...).
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant/après : {"plan": [string, ...], "storage": [{"title": string, "advice": string}, ...]}
"plan" : étapes concrètes et courtes (une phrase chacune), dans l'ordre à suivre pour cuisiner TOUTES les recettes ci-dessous ensemble. Entre 5 et 12 étapes, adapte le nombre à la complexité réelle.
"storage" : un objet par recette ci-dessous (reprends le titre EXACT fourni), avec un conseil de conservation court (une phrase : durée au frigo, possibilité et durée de congélation, précautions éventuelles).
Base-toi uniquement sur les recettes fournies, n'invente pas d'ingrédient ou d'étape qui n'y figure pas.`;

  const recipesText = recipes
    .map(
      (r, i) =>
        `### Recette ${i + 1} : ${r.title}\nIngrédients : ${r.ingredients.join(", ")}\nÉtapes :\n${r.steps
          .map((s, j) => `${j + 1}. ${s}`)
          .join("\n")}`,
    )
    .join("\n\n");

  const parsed = await callAiJson(systemPrompt, recipesText, 1100);
  const obj = (parsed ?? {}) as Record<string, unknown>;

  const planRaw = Array.isArray(obj.plan) ? obj.plan : [];
  const plan = planRaw.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());

  const storageRaw = Array.isArray(obj.storage) ? obj.storage : [];
  const storage = storageRaw
    .filter((s): s is Record<string, unknown> => s != null && typeof s === "object")
    .map((s) => ({
      title: typeof s.title === "string" ? s.title.trim() : "",
      advice: typeof s.advice === "string" ? s.advice.trim() : "",
    }))
    .filter((s) => s.title.length > 0 && s.advice.length > 0);

  return { plan, storage };
}
