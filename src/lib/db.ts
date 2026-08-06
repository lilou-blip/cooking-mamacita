import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { ingredientFamily, ingredientMatchesStaple } from "./ingredientMatching";
import { createUnitConverter } from "./unitConversion";

function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export type TagCategory = "type" | "regime" | "gout" | "saison" | "temperature";

export interface Tag {
  id: number;
  category: TagCategory;
  name: string;
}

export interface RecipeIngredientView {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  quantity: number | null;
  unit_id: number | null;
  unit_name: string | null;
  unit_abbreviation: string | null;
  position: number;
  note: string | null;
}

export interface RecipeStep {
  id: number;
  step_number: number;
  instruction: string;
}

export interface Recipe {
  id: number;
  title: string;
  photo_path: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number;
  notes: string | null;
  source: string | null;
  created_at: string;
}

export interface RecipeFull extends Recipe {
  tags: Tag[];
  ingredients: RecipeIngredientView[];
  steps: RecipeStep[];
}

export async function listRecipes(): Promise<Recipe[]> {
  return unwrap(await supabase.from("recipes").select("*").order("created_at", { ascending: false }));
}

export interface RecipeCard extends Recipe {
  tags: Tag[];
  made_count: number;
  ingredient_names: string[];
}

export async function listRecipesWithTags(): Promise<RecipeCard[]> {
  const recipes = unwrap<Recipe[]>(await supabase.from("recipes").select("*").order("created_at", { ascending: false }));
  if (recipes.length === 0) return [];

  const tagRows = unwrap<{ recipe_id: number; tags: Tag | null }[]>(
    (await supabase.from("recipe_tags").select("recipe_id, tags(id, category, name)")) as never,
  );
  const tagsByRecipe = new Map<number, Tag[]>();
  for (const row of tagRows) {
    if (!row.tags) continue;
    const list = tagsByRecipe.get(row.recipe_id) ?? [];
    list.push(row.tags);
    tagsByRecipe.set(row.recipe_id, list);
  }

  const madeRows = unwrap<{ recipe_id: number }[]>(await supabase.from("consumption_log").select("recipe_id"));
  const madeByRecipe = new Map<number, number>();
  for (const row of madeRows) {
    madeByRecipe.set(row.recipe_id, (madeByRecipe.get(row.recipe_id) ?? 0) + 1);
  }

  const ingredientRows = unwrap<{ recipe_id: number; ingredients: { name: string } | null }[]>(
    (await supabase.from("recipe_ingredients").select("recipe_id, ingredients(name)")) as never,
  );
  const ingredientsByRecipe = new Map<number, string[]>();
  for (const row of ingredientRows) {
    if (!row.ingredients) continue;
    const list = ingredientsByRecipe.get(row.recipe_id) ?? [];
    list.push(row.ingredients.name);
    ingredientsByRecipe.set(row.recipe_id, list);
  }

  return recipes.map((r) => ({
    ...r,
    tags: tagsByRecipe.get(r.id) ?? [],
    made_count: madeByRecipe.get(r.id) ?? 0,
    ingredient_names: ingredientsByRecipe.get(r.id) ?? [],
  }));
}

export async function listAllTags(): Promise<Tag[]> {
  return unwrap(await supabase.from("tags").select("id, category, name").order("category").order("name"));
}

export type UnitType = "masse" | "volume" | "piece";

export interface Unit {
  id: number;
  name: string;
  abbreviation: string;
  unit_type: UnitType;
  factor_to_base: number;
}

export async function listUnits(): Promise<Unit[]> {
  return unwrap(
    await supabase.from("units").select("id, name, abbreviation, unit_type, factor_to_base").order("unit_type").order("name"),
  );
}

export interface Ingredient {
  id: number;
  name: string;
  category: string;
}

export async function listIngredients(): Promise<Ingredient[]> {
  return unwrap(await supabase.from("ingredients").select("id, name, category").order("name"));
}

export async function getRecipeById(id: number): Promise<RecipeFull | null> {
  const { data: recipe, error } = await supabase.from("recipes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!recipe) return null;

  const tagRows = unwrap<{ tags: Tag | null }[]>(
    (await supabase.from("recipe_tags").select("tags(id, category, name)").eq("recipe_id", id)) as never,
  );
  const tags = tagRows.map((r) => r.tags).filter((t): t is Tag => t != null);

  const ingredientRows = unwrap<
    {
      id: number;
      ingredient_id: number;
      quantity: number | null;
      unit_id: number | null;
      position: number;
      note: string | null;
      ingredients: { name: string } | null;
      units: { name: string; abbreviation: string } | null;
    }[]
  >(
    (await supabase
      .from("recipe_ingredients")
      .select("id, ingredient_id, quantity, unit_id, position, note, ingredients(name), units(name, abbreviation)")
      .eq("recipe_id", id)
      .order("position")) as never,
  );
  const ingredients: RecipeIngredientView[] = ingredientRows.map((r) => ({
    id: r.id,
    ingredient_id: r.ingredient_id,
    ingredient_name: r.ingredients?.name ?? "",
    quantity: r.quantity,
    unit_id: r.unit_id,
    unit_name: r.units?.name ?? null,
    unit_abbreviation: r.units?.abbreviation ?? null,
    position: r.position,
    note: r.note,
  }));

  const steps = unwrap<RecipeStep[]>(
    await supabase.from("recipe_steps").select("id, step_number, instruction").eq("recipe_id", id).order("step_number"),
  );

  return { ...recipe, tags, ingredients, steps };
}

async function findOrCreateIngredient(name: string, category = "autre"): Promise<number> {
  const { data: existing } = await supabase.from("ingredients").select("id").eq("name", name).maybeSingle();
  if (existing) return existing.id;
  const inserted = unwrap<{ id: number }>(
    await supabase.from("ingredients").insert({ name, category }).select("id").single(),
  );
  return inserted.id;
}

async function findUnitByAbbreviation(abbreviation: string): Promise<number | null> {
  const { data } = await supabase.from("units").select("id").eq("abbreviation", abbreviation).maybeSingle();
  return data?.id ?? null;
}

async function findTagId(category: TagCategory, name: string): Promise<number | null> {
  const { data } = await supabase.from("tags").select("id").eq("category", category).eq("name", name).maybeSingle();
  return data?.id ?? null;
}

export interface NewRecipeIngredient {
  name: string;
  category?: string;
  quantity: number | null;
  unit_abbreviation: string | null;
  note?: string | null;
}

export interface NewRecipe {
  title: string;
  photo_path?: string | null;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  servings: number;
  notes?: string | null;
  source?: string | null;
  tags: { category: TagCategory; name: string }[];
  ingredients: NewRecipeIngredient[];
  steps: string[];
}

async function writeRecipeRelations(recipeId: number, input: NewRecipe): Promise<void> {
  // Résout les tags en parallèle (lectures indépendantes, aucun risque de doublon en base), puis insère
  // toutes les lignes en un seul aller-retour au lieu d'un INSERT par tag.
  const tagIds = await Promise.all(input.tags.map((tag) => findTagId(tag.category, tag.name)));
  const validTagIds = tagIds.filter((id): id is number => id !== null);
  if (validTagIds.length > 0) {
    unwrap(await supabase.from("recipe_tags").insert(validTagIds.map((tagId) => ({ recipe_id: recipeId, tag_id: tagId }))));
  }

  // findOrCreateIngredient fait un SELECT puis un INSERT si absent : le paralléliser directement pour
  // chaque ligne de la recette risquerait une double création si le même ingrédient apparaît deux fois.
  // On résout donc chaque nom/unité UNIQUE une seule fois en parallèle, puis on réutilise le résultat.
  const uniqueIngredientKeys = new Map(input.ingredients.map((ing) => [`${ing.name}:${ing.category ?? "autre"}`, ing]));
  const uniqueUnitAbbrs = [...new Set(input.ingredients.map((ing) => ing.unit_abbreviation).filter((a): a is string => !!a))];

  const [ingredientEntries, unitEntries] = await Promise.all([
    Promise.all(
      [...uniqueIngredientKeys.entries()].map(async ([key, ing]) => {
        const id = await findOrCreateIngredient(ing.name, ing.category ?? "autre");
        return [key, id] as const;
      }),
    ),
    Promise.all(uniqueUnitAbbrs.map(async (abbr) => [abbr, await findUnitByAbbreviation(abbr)] as const)),
  ]);
  const ingredientIdByKey = new Map(ingredientEntries);
  const unitIdByAbbr = new Map(unitEntries);

  if (input.ingredients.length > 0) {
    const rows = input.ingredients.map((ing, position) => ({
      recipe_id: recipeId,
      ingredient_id: ingredientIdByKey.get(`${ing.name}:${ing.category ?? "autre"}`),
      quantity: ing.quantity,
      unit_id: ing.unit_abbreviation ? unitIdByAbbr.get(ing.unit_abbreviation) ?? null : null,
      position,
      note: ing.note ?? null,
    }));
    unwrap(await supabase.from("recipe_ingredients").insert(rows));
  }

  if (input.steps.length > 0) {
    const rows = input.steps.map((instruction, i) => ({ recipe_id: recipeId, step_number: i + 1, instruction }));
    unwrap(await supabase.from("recipe_steps").insert(rows));
  }
}

export async function createRecipe(input: NewRecipe): Promise<number> {
  const inserted = unwrap<{ id: number }>(
    await supabase
      .from("recipes")
      .insert({
        title: input.title,
        photo_path: input.photo_path ?? null,
        prep_time_minutes: input.prep_time_minutes ?? null,
        cook_time_minutes: input.cook_time_minutes ?? null,
        servings: input.servings,
        notes: input.notes ?? null,
        source: input.source ?? null,
      })
      .select("id")
      .single(),
  );

  await writeRecipeRelations(inserted.id, input);

  return inserted.id;
}

export async function updateRecipe(id: number, input: NewRecipe): Promise<void> {
  unwrap(
    await supabase
      .from("recipes")
      .update({
        title: input.title,
        photo_path: input.photo_path ?? null,
        prep_time_minutes: input.prep_time_minutes ?? null,
        cook_time_minutes: input.cook_time_minutes ?? null,
        servings: input.servings,
        notes: input.notes ?? null,
        source: input.source ?? null,
      })
      .eq("id", id),
  );

  await Promise.all([
    supabase.from("recipe_tags").delete().eq("recipe_id", id),
    supabase.from("recipe_ingredients").delete().eq("recipe_id", id),
    supabase.from("recipe_steps").delete().eq("recipe_id", id),
  ]);

  await writeRecipeRelations(id, input);
}

export async function deleteRecipe(id: number): Promise<void> {
  unwrap(await supabase.from("recipes").delete().eq("id", id));
}

export interface Profile {
  id: number;
  name: string;
  color: string;
  relation: string | null;
  avatar: string | null;
  dietary_notes: string | null;
  age: number | null;
  is_guest: boolean;
}

export async function listProfiles(): Promise<Profile[]> {
  return unwrap(
    await supabase
      .from("consumer_profiles")
      .select("id, name, color, relation, avatar, dietary_notes, age, is_guest")
      .order("created_at"),
  );
}

export async function createProfile(input: {
  name: string;
  color: string;
  relation?: string | null;
  avatar?: string | null;
  dietary_notes?: string | null;
  age?: number | null;
  is_guest?: boolean;
}): Promise<number> {
  const inserted = unwrap<{ id: number }>(
    await supabase
      .from("consumer_profiles")
      .insert({
        name: input.name,
        color: input.color,
        relation: input.relation ?? null,
        avatar: input.avatar ?? null,
        dietary_notes: input.dietary_notes ?? null,
        age: input.age ?? null,
        is_guest: input.is_guest ?? false,
      })
      .select("id")
      .single(),
  );
  return inserted.id;
}

export async function updateProfile(
  id: number,
  input: {
    name: string;
    color: string;
    relation?: string | null;
    avatar?: string | null;
    dietary_notes?: string | null;
    age?: number | null;
    is_guest?: boolean;
  },
): Promise<void> {
  unwrap(
    await supabase
      .from("consumer_profiles")
      .update({
        name: input.name,
        color: input.color,
        relation: input.relation ?? null,
        avatar: input.avatar ?? null,
        dietary_notes: input.dietary_notes ?? null,
        age: input.age ?? null,
        is_guest: input.is_guest ?? false,
      })
      .eq("id", id),
  );
}

/** Supprime un profil et nettoie ses références (assignations garde-manger, associations de consommation). */
export async function deleteProfile(id: number): Promise<void> {
  await supabase.from("pantry_item_assignments").delete().eq("profile_id", id);
  await supabase.from("consumption_log_profiles").delete().eq("profile_id", id);
  await supabase.from("pantry_consumption_log").update({ profile_id: null }).eq("profile_id", id);
  await supabase.from("consumer_profiles").delete().eq("id", id);
}

export interface PantryAssignment {
  profile_id: number;
  profile_name: string;
  profile_color: string;
  quantity: number;
}

export interface StorageUnit {
  id: number;
  name: string;
  illustration: string | null;
  position: number;
}

export async function listStorageUnits(): Promise<StorageUnit[]> {
  return unwrap(await supabase.from("storage_units").select("id, name, illustration, position").order("position").order("id"));
}

export async function createStorageUnit(input: { name: string; illustration: string | null }): Promise<number> {
  const { data: maxRow } = await supabase
    .from("storage_units")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (maxRow?.position ?? -1) + 1;
  const inserted = unwrap<{ id: number }>(
    await supabase.from("storage_units").insert({ name: input.name, illustration: input.illustration, position }).select("id").single(),
  );
  return inserted.id;
}

export async function deleteStorageUnit(id: number): Promise<void> {
  await supabase.from("pantry_items").update({ storage_unit_id: null }).eq("storage_unit_id", id);
  await supabase.from("storage_units").delete().eq("id", id);
}

export interface PantryItem {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  ingredient_category: string;
  quantity: number;
  unit_id: number | null;
  unit_name: string | null;
  unit_abbreviation: string | null;
  added_at: string;
  expires_at: string | null;
  storage_unit_id: number | null;
  storage_unit_name: string | null;
  recipe_id: number | null;
  recipe_title: string | null;
  assignments: PantryAssignment[];
}

export async function listPantryItems(): Promise<PantryItem[]> {
  const rows = unwrap<
    {
      id: number;
      ingredient_id: number;
      unit_id: number | null;
      quantity: number;
      added_at: string;
      expires_at: string | null;
      storage_unit_id: number | null;
      recipe_id: number | null;
      ingredients: { name: string; category: string } | null;
      units: { name: string; abbreviation: string } | null;
      storage_units: { name: string } | null;
      recipes: { title: string } | null;
    }[]
  >(
    (await supabase
      .from("pantry_items")
      .select(
        "id, ingredient_id, unit_id, quantity, added_at, expires_at, storage_unit_id, recipe_id, ingredients(name, category), units(name, abbreviation), storage_units(name), recipes(title)",
      )
      .order("expires_at", { ascending: true, nullsFirst: false })
      .order("name", { foreignTable: "ingredients", ascending: true })) as never,
  );

  const items: Omit<PantryItem, "assignments">[] = rows.map((r) => ({
    id: r.id,
    ingredient_id: r.ingredient_id,
    ingredient_name: r.ingredients?.name ?? "",
    ingredient_category: r.ingredients?.category ?? "autre",
    quantity: r.quantity,
    unit_id: r.unit_id,
    unit_name: r.units?.name ?? null,
    unit_abbreviation: r.units?.abbreviation ?? null,
    added_at: r.added_at,
    expires_at: r.expires_at,
    storage_unit_id: r.storage_unit_id,
    storage_unit_name: r.storage_units?.name ?? null,
    recipe_id: r.recipe_id,
    recipe_title: r.recipes?.title ?? null,
  }));
  if (items.length === 0) return [];

  const assignRows = unwrap<
    { pantry_item_id: number; quantity: number; consumer_profiles: { id: number; name: string; color: string } | null }[]
  >((await supabase.from("pantry_item_assignments").select("pantry_item_id, quantity, consumer_profiles(id, name, color)")) as never);
  const byItem = new Map<number, PantryAssignment[]>();
  for (const row of assignRows) {
    if (!row.consumer_profiles) continue;
    const list = byItem.get(row.pantry_item_id) ?? [];
    list.push({
      profile_id: row.consumer_profiles.id,
      profile_name: row.consumer_profiles.name,
      profile_color: row.consumer_profiles.color,
      quantity: row.quantity,
    });
    byItem.set(row.pantry_item_id, list);
  }

  return items.map((item) => ({ ...item, assignments: byItem.get(item.id) ?? [] }));
}

export interface NewPantryItem {
  ingredient_name: string;
  ingredient_category?: string;
  quantity: number;
  unit_abbreviation: string | null;
  expires_at?: string | null;
  storage_unit_id?: number | null;
  /** Renseigné pour un reste de batch cooking : `quantity` représente alors un nombre de portions de cette
   * recette (pas un poids/volume), pour que les stats puissent redécomposer par catégorie plus tard. */
  recipe_id?: number | null;
  assignments: { profile_id: number; quantity: number }[];
}

export async function createPantryItem(input: NewPantryItem): Promise<number> {
  const ingredientId = await findOrCreateIngredient(input.ingredient_name, input.ingredient_category ?? "autre");
  const unitId = input.unit_abbreviation ? await findUnitByAbbreviation(input.unit_abbreviation) : null;

  const inserted = unwrap<{ id: number }>(
    await supabase
      .from("pantry_items")
      .insert({
        ingredient_id: ingredientId,
        unit_id: unitId,
        quantity: input.quantity,
        expires_at: input.expires_at ?? null,
        storage_unit_id: input.storage_unit_id ?? null,
        recipe_id: input.recipe_id ?? null,
      })
      .select("id")
      .single(),
  );
  const pantryItemId = inserted.id;

  const assignmentRows = input.assignments
    .filter((a) => a.quantity > 0)
    .map((a) => ({ pantry_item_id: pantryItemId, profile_id: a.profile_id, quantity: a.quantity }));
  if (assignmentRows.length > 0) {
    unwrap(await supabase.from("pantry_item_assignments").insert(assignmentRows));
  }

  return pantryItemId;
}

export async function deletePantryItem(id: number): Promise<void> {
  unwrap(await supabase.from("pantry_items").delete().eq("id", id));
}

/** Ajuste rapidement la quantité d'un article (+1/-1...) sans passer par le formulaire de consommation. Supprime l'article si la quantité tombe à 0. */
export async function adjustPantryItemQuantity(id: number, delta: number): Promise<void> {
  const { data } = await supabase.from("pantry_items").select("quantity").eq("id", id).maybeSingle();
  const current = data?.quantity ?? 0;
  const next = Math.round((current + delta) * 100) / 100;
  if (next <= 0) {
    await supabase.from("pantry_items").delete().eq("id", id);
  } else {
    await supabase.from("pantry_items").update({ quantity: next }).eq("id", id);
  }
}

/** Réduit la quantité d'un article du garde-manger et journalise qui l'a consommé. Supprime la ligne si elle atteint 0. */
export async function consumePantryItem(id: number, quantityConsumed: number, profileId?: number | null): Promise<void> {
  const { data: item } = await supabase
    .from("pantry_items")
    .select("quantity, ingredient_id, unit_id, expires_at, recipe_id")
    .eq("id", id)
    .maybeSingle();
  if (!item) return;

  const remaining = Math.round((item.quantity - quantityConsumed) * 100) / 100;
  if (remaining <= 0) {
    await supabase.from("pantry_items").delete().eq("id", id);
  } else {
    await supabase.from("pantry_items").update({ quantity: remaining }).eq("id", id);
  }

  await supabase.from("pantry_consumption_log").insert({
    ingredient_id: item.ingredient_id,
    profile_id: profileId ?? null,
    quantity: quantityConsumed,
    unit_id: item.unit_id,
    recipe_id: item.recipe_id ?? null,
  });

  // Aliment consommé alors qu'il était proche de la péremption (ou déjà périmé) : gaspillage évité, on le journalise pour les stats éco.
  if (item.expires_at) {
    const daysLeft = (new Date(item.expires_at).getTime() - Date.now()) / 86_400_000;
    if (daysLeft <= 3) {
      await supabase.from("pantry_waste_avoided_log").insert({
        ingredient_id: item.ingredient_id,
        quantity: quantityConsumed,
        unit_id: item.unit_id,
      });
    }
  }
}

/** Déduit du garde-manger les ingrédients d'une recette, en piochant d'abord dans les articles qui expirent le plus tôt. */
async function deductRecipeFromPantry(ingredients: RecipeIngredientView[], scale: number): Promise<void> {
  const relevant = ingredients.filter((ing) => ing.quantity != null);

  // Lecture : une requête par ingrédient, mais indépendantes les unes des autres -> en parallèle.
  const pantryRowsByIngredient = await Promise.all(
    relevant.map(async (ing) => {
      let query = supabase
        .from("pantry_items")
        .select("id, quantity")
        .eq("ingredient_id", ing.ingredient_id)
        .order("expires_at", { ascending: true, nullsFirst: false });
      query = ing.unit_id == null ? query.is("unit_id", null) : query.eq("unit_id", ing.unit_id);
      return unwrap<{ id: number; quantity: number }[]>(await query);
    }),
  );

  // Calcul pur (aucun accès DB) : détermine, pour chaque article pioché, s'il faut le supprimer ou juste
  // décrémenter sa quantité. Chaque article n'est touché qu'une fois, donc l'écriture peut être parallélisée.
  const mutations: { id: number; remaining: number }[] = [];
  relevant.forEach((ing, i) => {
    let needed = ing.quantity! * scale;
    for (const row of pantryRowsByIngredient[i]) {
      if (needed <= 0) break;
      const take = Math.min(row.quantity, needed);
      needed -= take;
      mutations.push({ id: row.id, remaining: Math.round((row.quantity - take) * 100) / 100 });
    }
  });

  await Promise.all(
    mutations.map((m) =>
      m.remaining <= 0
        ? supabase.from("pantry_items").delete().eq("id", m.id)
        : supabase.from("pantry_items").update({ quantity: m.remaining }).eq("id", m.id),
    ),
  );
}

export async function countRecipeMade(recipeId: number): Promise<number> {
  const { count, error } = await supabase
    .from("consumption_log")
    .select("id", { count: "exact", head: true })
    .eq("recipe_id", recipeId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Marque une recette comme faite: journalise la consommation (liée aux profils) et déduit le garde-manger. */
export async function markRecipeMade(recipeId: number, servings: number, profileIds: number[] = []): Promise<void> {
  const recipe = await getRecipeById(recipeId);
  if (!recipe) throw new Error("Recette introuvable");

  const inserted = unwrap<{ id: number }>(
    await supabase.from("consumption_log").insert({ recipe_id: recipeId, servings }).select("id").single(),
  );
  const logId = inserted.id;

  if (profileIds.length > 0) {
    unwrap(
      await supabase
        .from("consumption_log_profiles")
        .insert(profileIds.map((profileId) => ({ consumption_log_id: logId, profile_id: profileId }))),
    );
  }

  const scale = recipe.servings > 0 ? servings / recipe.servings : 1;
  await deductRecipeFromPantry(recipe.ingredients, scale);
}

export type MenuType = "semaine" | "evenement";

export interface Menu {
  id: number;
  name: string;
  menu_type: MenuType;
  event_date: string | null;
  servings_target: number | null;
  notes: string | null;
  created_at: string;
}

export async function listMenus(): Promise<Menu[]> {
  return unwrap(
    await supabase
      .from("menus")
      .select("*")
      .order("event_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
  );
}

export async function createMenu(input: {
  name: string;
  menu_type?: MenuType;
  event_date?: string | null;
  servings_target?: number | null;
  notes?: string | null;
}): Promise<number> {
  const inserted = unwrap<{ id: number }>(
    await supabase
      .from("menus")
      .insert({
        name: input.name,
        menu_type: input.menu_type ?? "evenement",
        event_date: input.event_date ?? null,
        servings_target: input.servings_target ?? null,
        notes: input.notes ?? null,
      })
      .select("id")
      .single(),
  );
  return inserted.id;
}

export async function deleteMenu(id: number): Promise<void> {
  unwrap(await supabase.from("menus").delete().eq("id", id));
}

export type MealSlot = "petit_dejeuner" | "dejeuner" | "gouter" | "diner";

export interface MenuRecipeRow {
  menu_recipe_id: number;
  recipe_id: number;
  title: string;
  photo_path: string | null;
  servings: number;
  made: boolean;
  day_of_week: number | null;
  meal_slot: MealSlot | null;
}

export interface MenuFull extends Menu {
  recipes: MenuRecipeRow[];
}

export async function getMenuById(id: number): Promise<MenuFull | null> {
  const { data: menu, error } = await supabase.from("menus").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!menu) return null;

  const rows = unwrap<
    {
      id: number;
      recipe_id: number;
      servings: number;
      made: boolean;
      day_of_week: number | null;
      meal_slot: MealSlot | null;
      recipes: { title: string; photo_path: string | null } | null;
    }[]
  >(
    (await supabase
      .from("menu_recipes")
      .select("id, recipe_id, servings, made, day_of_week, meal_slot, recipes(title, photo_path)")
      .eq("menu_id", id)
      .order("id")) as never,
  );

  const recipes: MenuRecipeRow[] = rows.map((r) => ({
    menu_recipe_id: r.id,
    recipe_id: r.recipe_id,
    title: r.recipes?.title ?? "",
    photo_path: r.recipes?.photo_path ?? null,
    servings: r.servings,
    made: r.made,
    day_of_week: r.day_of_week,
    meal_slot: r.meal_slot,
  }));

  return { ...menu, recipes };
}

export async function updateMenuRecipeMade(menuRecipeId: number, made: boolean): Promise<void> {
  unwrap(await supabase.from("menu_recipes").update({ made }).eq("id", menuRecipeId));
}

export async function addRecipeToMenu(
  menuId: number,
  recipeId: number,
  servings: number,
  dayOfWeek?: number | null,
  mealSlot?: MealSlot | null,
): Promise<void> {
  unwrap(
    await supabase.from("menu_recipes").insert({
      menu_id: menuId,
      recipe_id: recipeId,
      servings,
      day_of_week: dayOfWeek ?? null,
      meal_slot: mealSlot ?? null,
    }),
  );
}

export async function removeMenuRecipe(menuRecipeId: number): Promise<void> {
  unwrap(await supabase.from("menu_recipes").delete().eq("id", menuRecipeId));
}

export interface ShoppingList {
  id: number;
  menu_id: number | null;
  name: string;
  created_at: string;
}

export interface ShoppingListItem {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  quantity: number | null;
  unit_id: number | null;
  unit_abbreviation: string | null;
  price: number | null;
  price_is_estimate: boolean;
  checked: boolean;
  is_suggested: boolean;
}

export interface ShoppingListFull extends ShoppingList {
  items: ShoppingListItem[];
}

/** Renvoie l'unique liste de courses "libre" (sans menu associé), utilisée depuis la table, en la créant si besoin. */
export async function getOrCreateStandaloneShoppingList(): Promise<number> {
  const { data: existing } = await supabase
    .from("shopping_lists")
    .select("id")
    .is("menu_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const inserted = unwrap<{ id: number }>(
    await supabase.from("shopping_lists").insert({ menu_id: null, name: "Liste de courses" }).select("id").single(),
  );
  return inserted.id;
}

export interface ShoppingListSummary extends ShoppingList {
  item_count: number;
  checked_count: number;
}

/** Liste toutes les listes de courses libres (pas celles générées automatiquement pour un menu). */
export async function listShoppingLists(): Promise<ShoppingListSummary[]> {
  const lists = unwrap<ShoppingList[]>(
    await supabase.from("shopping_lists").select("*").is("menu_id", null).order("created_at", { ascending: false }),
  );
  if (lists.length === 0) return [];

  const items = unwrap<{ shopping_list_id: number; checked: boolean }[]>(
    await supabase
      .from("shopping_list_items")
      .select("shopping_list_id, checked")
      .in(
        "shopping_list_id",
        lists.map((l) => l.id),
      ),
  );
  const countsByList = new Map<number, { item_count: number; checked_count: number }>();
  for (const item of items) {
    const counts = countsByList.get(item.shopping_list_id) ?? { item_count: 0, checked_count: 0 };
    counts.item_count += 1;
    if (item.checked) counts.checked_count += 1;
    countsByList.set(item.shopping_list_id, counts);
  }

  return lists.map((l) => ({ ...l, ...(countsByList.get(l.id) ?? { item_count: 0, checked_count: 0 }) }));
}

export async function createShoppingList(name: string): Promise<number> {
  const inserted = unwrap<{ id: number }>(
    await supabase.from("shopping_lists").insert({ menu_id: null, name }).select("id").single(),
  );
  return inserted.id;
}

export async function renameShoppingList(id: number, name: string): Promise<void> {
  unwrap(await supabase.from("shopping_lists").update({ name }).eq("id", id));
}

export async function deleteShoppingList(id: number): Promise<void> {
  unwrap(await supabase.from("shopping_lists").delete().eq("id", id));
}

export interface BatchIngredientPreviewRow {
  ingredient_name: string;
  quantity: number;
  unit_abbreviation: string | null;
  have_enough: boolean;
}

/** Ingrédients combinés nécessaires pour une séance de batch cooking (plusieurs recettes, chacune à un
 * nombre de portions donné), comparés à ce qu'il y a déjà au garde-manger — sans créer de liste de courses,
 * juste un aperçu pour la séance en cours. */
export async function previewBatchIngredients(
  items: { recipeId: number; servings: number }[],
): Promise<BatchIngredientPreviewRow[]> {
  const recipes = await Promise.all(items.map((i) => getRecipeById(i.recipeId)));
  const units = await listUnits();
  const { unitById, unitTypeOf, toBase } = createUnitConverter(units);

  const needed = new Map<
    string,
    { ingredientName: string; baseQuantity: number; displayUnitId: number | null; displayQuantity: number }
  >();
  items.forEach((item, i) => {
    const recipe = recipes[i];
    if (!recipe || item.servings <= 0) return;
    const scale = recipe.servings > 0 ? item.servings / recipe.servings : 1;
    for (const ing of recipe.ingredients) {
      if (ing.quantity == null) continue;
      const scaledQty = ing.quantity * scale;
      const baseQty = toBase(scaledQty, ing.unit_id);
      const key = `${ing.ingredient_id}:${unitTypeOf(ing.unit_id)}`;
      const existing = needed.get(key);
      if (existing) {
        existing.baseQuantity += baseQty;
        if (existing.displayUnitId === ing.unit_id) existing.displayQuantity += scaledQty;
      } else {
        needed.set(key, {
          ingredientName: ing.ingredient_name,
          baseQuantity: baseQty,
          displayUnitId: ing.unit_id,
          displayQuantity: scaledQty,
        });
      }
    }
  });

  const pantryRows = unwrap<{ ingredient_id: number; unit_id: number | null; quantity: number }[]>(
    await supabase.from("pantry_items").select("ingredient_id, unit_id, quantity"),
  );
  const pantryBaseByKey = new Map<string, number>();
  for (const row of pantryRows) {
    const baseQty = toBase(row.quantity, row.unit_id);
    const key = `${row.ingredient_id}:${unitTypeOf(row.unit_id)}`;
    pantryBaseByKey.set(key, (pantryBaseByKey.get(key) ?? 0) + baseQty);
  }

  const result: BatchIngredientPreviewRow[] = [];
  for (const [key, entry] of needed.entries()) {
    const unit = entry.displayUnitId != null ? unitById.get(entry.displayUnitId) : undefined;
    result.push({
      ingredient_name: entry.ingredientName,
      quantity: Math.round(entry.displayQuantity * 100) / 100,
      unit_abbreviation: unit?.abbreviation ?? null,
      have_enough: (pantryBaseByKey.get(key) ?? 0) >= entry.baseQuantity,
    });
  }
  return result.sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name));
}

/** Produits de base qu'on veut se voir suggérer dès qu'il en reste peu, même s'ils ne sont pas requis par le menu. */
const STAPLE_DEFAULTS: { name: string; category: string; quantity: number; unitAbbr: string | null }[] = [
  { name: "oeufs", category: "proteines", quantity: 6, unitAbbr: null },
  { name: "farine", category: "epicerie", quantity: 1, unitAbbr: "kg" },
  { name: "sucre", category: "sucreries", quantity: 1, unitAbbr: "kg" },
  { name: "huile", category: "matieres_grasses", quantity: 1, unitAbbr: "l" },
  { name: "lait", category: "laitages", quantity: 1, unitAbbr: "l" },
  { name: "beurre", category: "matieres_grasses", quantity: 250, unitAbbr: "g" },
];

export async function generateShoppingListForMenu(menuId: number): Promise<number> {
  const menu = await getMenuById(menuId);
  if (!menu) throw new Error("Menu introuvable");

  const recipes = await Promise.all(menu.recipes.map((menuRecipe) => getRecipeById(menuRecipe.recipe_id)));
  const units = await listUnits();
  const { unitById, unitTypeOf, toBase } = createUnitConverter(units);
  const unitAbbrToId = new Map(units.map((u) => [u.abbreviation, u.id]));

  // Regroupé par ingrédient ET par type d'unité (masse/volume/pièce) : on ne compare jamais des grammes à des millilitres.
  const needed = new Map<
    string,
    { ingredientId: number; baseQuantity: number; displayUnitId: number | null; displayQuantity: number }
  >();
  menu.recipes.forEach((menuRecipe, i) => {
    const recipe = recipes[i];
    if (!recipe) return;
    const scale = recipe.servings > 0 ? menuRecipe.servings / recipe.servings : 1;
    for (const ing of recipe.ingredients) {
      if (ing.quantity == null) continue;
      const scaledQty = ing.quantity * scale;
      const baseQty = toBase(scaledQty, ing.unit_id);
      const key = `${ing.ingredient_id}:${unitTypeOf(ing.unit_id)}`;
      const existing = needed.get(key);
      if (existing) {
        existing.baseQuantity += baseQty;
        if (existing.displayUnitId === ing.unit_id) existing.displayQuantity += scaledQty;
      } else {
        needed.set(key, { ingredientId: ing.ingredient_id, baseQuantity: baseQty, displayUnitId: ing.unit_id, displayQuantity: scaledQty });
      }
    }
  });

  const pantryRows = unwrap<{ ingredient_id: number; unit_id: number | null; quantity: number }[]>(
    await supabase.from("pantry_items").select("ingredient_id, unit_id, quantity"),
  );
  const pantryBaseByKey = new Map<string, number>();
  for (const row of pantryRows) {
    const baseQty = toBase(row.quantity, row.unit_id);
    const key = `${row.ingredient_id}:${unitTypeOf(row.unit_id)}`;
    pantryBaseByKey.set(key, (pantryBaseByKey.get(key) ?? 0) + baseQty);
  }

  const insertedList = unwrap<{ id: number }>(
    await supabase.from("shopping_lists").insert({ menu_id: menuId, name: `Courses – ${menu.name}` }).select("id").single(),
  );
  const shoppingListId = insertedList.id;

  const addedIngredientIds = new Set<number>();

  // Calcul pur : détermine quelles lignes manquent, sans toucher la DB.
  const missingRows: { ingredientId: number; quantity: number; unitId: number | null }[] = [];
  for (const [key, entry] of needed.entries()) {
    const inPantryBase = pantryBaseByKey.get(key) ?? 0;
    if (inPantryBase >= entry.baseQuantity) continue; // déjà assez en stock (même type d'unité, converti pour comparer)

    const unit = entry.displayUnitId != null ? unitById.get(entry.displayUnitId) : undefined;
    const missingBase = entry.baseQuantity - inPantryBase;
    const missingDisplay = unit ? missingBase / unit.factor_to_base : missingBase;

    missingRows.push({
      ingredientId: entry.ingredientId,
      quantity: Math.round(missingDisplay * 100) / 100,
      unitId: entry.displayUnitId,
    });
    addedIngredientIds.add(entry.ingredientId);
  }

  if (missingRows.length > 0) {
    unwrap(
      await supabase
        .from("shopping_list_items")
        .insert(missingRows.map((r) => ({ shopping_list_id: shoppingListId, ingredient_id: r.ingredientId, quantity: r.quantity, unit_id: r.unitId }))),
    );
  }

  // Suggestions : produits de base bientôt épuisés (toutes variantes confondues : "beurre"/"beurre mou", "oeuf"/"oeufs"...),
  // même s'ils ne sont pas requis par les recettes du menu. On suggère toujours le produit "propre" avec une quantité réaliste.
  const allIngredients = await listIngredients();
  const stapleTodo = STAPLE_DEFAULTS.filter((staple) => {
    const matchingIds = allIngredients.filter((ing) => ingredientMatchesStaple(ing.name, staple.name)).map((ing) => ing.id);
    if (matchingIds.some((id) => addedIngredientIds.has(id))) return false; // déjà dans la liste via une recette

    const stockBase = matchingIds.reduce((sum, id) => {
      const type = staple.unitAbbr ? (unitById.get(unitAbbrToId.get(staple.unitAbbr) ?? -1)?.unit_type ?? "piece") : "piece";
      return sum + (pantryBaseByKey.get(`${id}:${type}`) ?? 0);
    }, 0);
    const threshold = staple.unitAbbr == null ? 2 : 150;
    return stockBase <= threshold;
  });

  // Les noms des produits de base sont tous distincts entre eux -> aucune collision possible, sûr à paralléliser.
  const staplesToInsert = await Promise.all(
    stapleTodo.map(async (staple) => ({
      canonicalId: await findOrCreateIngredient(staple.name, staple.category),
      unitId: staple.unitAbbr ? unitAbbrToId.get(staple.unitAbbr) ?? null : null,
      quantity: staple.quantity,
    })),
  );

  if (staplesToInsert.length > 0) {
    unwrap(
      await supabase.from("shopping_list_items").insert(
        staplesToInsert.map((s) => ({
          shopping_list_id: shoppingListId,
          ingredient_id: s.canonicalId,
          quantity: s.quantity,
          unit_id: s.unitId,
          is_suggested: true,
        })),
      ),
    );
  }

  await mergeDuplicateShoppingListItems(shoppingListId);

  return shoppingListId;
}

/** Fusionne les articles en double d'une liste de courses (ex: "2 œufs" + "1 œuf" -> "3 œufs", "beurre mou" + "beurre" -> "beurre"). */
export async function mergeDuplicateShoppingListItems(shoppingListId: number): Promise<void> {
  const units = await listUnits();
  const { unitById, unitTypeOf, toBase } = createUnitConverter(units);

  const rows = unwrap<
    { id: number; ingredient_id: number; quantity: number | null; unit_id: number | null; is_suggested: boolean; ingredients: { name: string } | null }[]
  >(
    (await supabase
      .from("shopping_list_items")
      .select("id, ingredient_id, quantity, unit_id, is_suggested, ingredients(name)")
      .eq("shopping_list_id", shoppingListId)) as never,
  );
  const flatRows = rows.map((r) => ({ ...r, ingredient_name: r.ingredients?.name ?? "" }));

  const groups = new Map<string, typeof flatRows>();
  for (const row of flatRows) {
    const key = `${ingredientFamily(row.ingredient_name)}:${unitTypeOf(row.unit_id)}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  // Chaque groupe (et, à l'intérieur d'un groupe, l'UPDATE de la ligne conservée et les DELETE des autres)
  // touche des lignes distinctes : tout peut s'exécuter en parallèle plutôt que groupe par groupe.
  const writes: PromiseLike<unknown>[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Garde le nom le plus "propre" (le plus court, ex: "beurre" plutôt que "beurre mou") comme article restant.
    const displayRow = [...group].sort((a, b) => a.ingredient_name.length - b.ingredient_name.length)[0];
    const displayUnit = displayRow.unit_id != null ? unitById.get(displayRow.unit_id) : undefined;

    let totalBase = 0;
    let hasQuantity = false;
    for (const row of group) {
      if (row.quantity != null) {
        hasQuantity = true;
        totalBase += toBase(row.quantity, row.unit_id);
      }
    }
    const mergedQuantity = hasQuantity ? (displayUnit ? totalBase / displayUnit.factor_to_base : totalBase) : null;
    const isSuggested = group.some((r) => r.is_suggested);

    writes.push(
      supabase
        .from("shopping_list_items")
        .update({
          ingredient_id: displayRow.ingredient_id,
          quantity: mergedQuantity != null ? Math.round(mergedQuantity * 100) / 100 : null,
          unit_id: displayRow.unit_id,
          is_suggested: isSuggested,
          price: null,
          price_is_estimate: false,
        })
        .eq("id", displayRow.id),
    );
    for (const row of group) {
      if (row.id !== displayRow.id) {
        writes.push(supabase.from("shopping_list_items").delete().eq("id", row.id));
      }
    }
  }
  await Promise.all(writes);
}

export async function getShoppingListById(id: number): Promise<ShoppingListFull | null> {
  const { data: list, error } = await supabase.from("shopping_lists").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!list) return null;

  const rows = unwrap<
    {
      id: number;
      ingredient_id: number;
      quantity: number | null;
      unit_id: number | null;
      price: number | null;
      price_is_estimate: boolean;
      checked: boolean;
      is_suggested: boolean;
      ingredients: { name: string } | null;
      units: { abbreviation: string } | null;
    }[]
  >(
    (await supabase
      .from("shopping_list_items")
      .select("id, ingredient_id, quantity, unit_id, price, price_is_estimate, checked, is_suggested, ingredients(name), units(abbreviation)")
      .eq("shopping_list_id", id)
      .order("name", { foreignTable: "ingredients" })) as never,
  );

  const items: ShoppingListItem[] = rows.map((r) => ({
    id: r.id,
    ingredient_id: r.ingredient_id,
    ingredient_name: r.ingredients?.name ?? "",
    quantity: r.quantity,
    unit_id: r.unit_id,
    unit_abbreviation: r.units?.abbreviation ?? null,
    price: r.price,
    price_is_estimate: r.price_is_estimate,
    checked: r.checked,
    is_suggested: r.is_suggested,
  }));

  return { ...list, items };
}

export async function updateShoppingListItem(
  id: number,
  patch: { price?: number | null; priceIsEstimate?: boolean; checked?: boolean },
): Promise<void> {
  if (patch.price !== undefined) {
    unwrap(
      await supabase.from("shopping_list_items").update({ price: patch.price, price_is_estimate: !!patch.priceIsEstimate }).eq("id", id),
    );
  }
  if (patch.checked !== undefined) {
    unwrap(await supabase.from("shopping_list_items").update({ checked: patch.checked }).eq("id", id));
  }
}

/** Ajoute un article saisi manuellement (pas dérivé d'une recette) à une liste de courses existante. */
export async function addShoppingListItem(
  shoppingListId: number,
  input: { ingredient_name: string; ingredient_category?: string; quantity: number | null; unit_abbreviation: string | null },
): Promise<number> {
  const ingredientId = await findOrCreateIngredient(input.ingredient_name, input.ingredient_category ?? "autre");
  const unitId = input.unit_abbreviation ? await findUnitByAbbreviation(input.unit_abbreviation) : null;
  const inserted = unwrap<{ id: number }>(
    await supabase
      .from("shopping_list_items")
      .insert({ shopping_list_id: shoppingListId, ingredient_id: ingredientId, quantity: input.quantity, unit_id: unitId })
      .select("id")
      .single(),
  );
  await mergeDuplicateShoppingListItems(shoppingListId);
  return inserted.id;
}

export async function deleteShoppingListItem(id: number): Promise<void> {
  unwrap(await supabase.from("shopping_list_items").delete().eq("id", id));
}

export interface TopRecipeStat {
  recipe_id: number;
  title: string;
  count: number;
}

async function getGuestProfileIds(): Promise<Set<number>> {
  return new Set((await listProfiles()).filter((p) => p.is_guest).map((p) => p.id));
}

/** Repas (consumption_log) attribués UNIQUEMENT à un ou plusieurs profils invités — à exclure de la vue
 * "Tous" (partagé avec au moins une personne du foyer, un repas reste compté normalement). */
async function getGuestOnlyLogIds(guestProfileIds: Set<number>): Promise<Set<number>> {
  if (guestProfileIds.size === 0) return new Set();
  const attributions = unwrap<{ consumption_log_id: number; profile_id: number }[]>(
    await supabase.from("consumption_log_profiles").select("consumption_log_id, profile_id"),
  );
  const profilesByLog = new Map<number, number[]>();
  for (const a of attributions) {
    const list = profilesByLog.get(a.consumption_log_id) ?? [];
    list.push(a.profile_id);
    profilesByLog.set(a.consumption_log_id, list);
  }
  const excluded = new Set<number>();
  for (const [logId, profIds] of profilesByLog.entries()) {
    if (profIds.length > 0 && profIds.every((p) => guestProfileIds.has(p))) excluded.add(logId);
  }
  return excluded;
}

export async function getTopMadeRecipes(limit = 5, profileId?: number | null): Promise<TopRecipeStat[]> {
  let logIds: number[] | null = null;
  let excludedLogIds = new Set<number>();
  if (profileId != null) {
    const rows = unwrap<{ consumption_log_id: number }[]>(
      await supabase.from("consumption_log_profiles").select("consumption_log_id").eq("profile_id", profileId),
    );
    logIds = rows.map((r) => r.consumption_log_id);
    if (logIds.length === 0) return [];
  } else {
    excludedLogIds = await getGuestOnlyLogIds(await getGuestProfileIds());
  }

  let query = supabase.from("consumption_log").select("id, recipe_id, recipes(title)");
  if (logIds) query = query.in("id", logIds);
  const rows = unwrap<{ id: number; recipe_id: number; recipes: { title: string } | null }[]>(await (query as never));

  const counts = new Map<number, { title: string; count: number }>();
  for (const row of rows) {
    if (excludedLogIds.has(row.id)) continue;
    const entry = counts.get(row.recipe_id) ?? { title: row.recipes?.title ?? "", count: 0 };
    entry.count += 1;
    counts.set(row.recipe_id, entry);
  }

  return [...counts.entries()]
    .map(([recipe_id, { title, count }]) => ({ recipe_id, title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface CategoryStat {
  category: string;
  count: number;
}

/** Ingrédients (avec quantité) d'un ensemble de recettes, pour redécomposer une conso par catégorie. */
async function loadRecipeIngredientProfiles(
  recipeIds: number[],
): Promise<Map<number, { baseServings: number; ingredients: { quantity: number | null; unit_id: number | null; category: string }[] }>> {
  const [ingredientRows, recipeRows] = await Promise.all([
    supabase
      .from("recipe_ingredients")
      .select("recipe_id, quantity, unit_id, ingredients(category)")
      .in("recipe_id", recipeIds)
      .then((r) => unwrap<{ recipe_id: number; quantity: number | null; unit_id: number | null; ingredients: { category: string } | null }[]>(r as never)),
    supabase
      .from("recipes")
      .select("id, servings")
      .in("id", recipeIds)
      .then((r) => unwrap<{ id: number; servings: number }[]>(r)),
  ]);

  const result = new Map<number, { baseServings: number; ingredients: { quantity: number | null; unit_id: number | null; category: string }[] }>();
  for (const recipe of recipeRows) result.set(recipe.id, { baseServings: recipe.servings, ingredients: [] });
  for (const row of ingredientRows) {
    if (!row.ingredients) continue;
    const entry = result.get(row.recipe_id);
    if (entry) entry.ingredients.push({ quantity: row.quantity, unit_id: row.unit_id, category: row.ingredients.category });
  }
  return result;
}

/**
 * Répartition par catégorie, pondérée par quantité réelle (convertie en base g/ml, ~50g pour les
 * ingrédients à la pièce faute de connaître leur poids exact) plutôt qu'un simple comptage d'occurrences
 * — 10g de beurre ne doit pas peser autant que 1kg dans les stats.
 *
 * Quand profileId est omis (vue "Tous"), les consommations attribuées UNIQUEMENT à un profil marqué
 * "invité" sont exclues : ce profil sert de fourre-tout pour les repas avec des invités et ne doit pas
 * gonfler les stats du foyer. Sélectionner directement le profil invité, lui, montre bien ses données.
 */
export async function getConsumptionByCategory(profileId?: number | null): Promise<CategoryStat[]> {
  const { unitTypeOf, toBase } = createUnitConverter(await listUnits());
  const weights = new Map<string, number>();
  const add = (category: string, quantity: number, unitId: number | null) => {
    const base = toBase(quantity, unitId);
    const weighted = unitTypeOf(unitId) === "piece" ? base * 50 : base;
    weights.set(category, (weights.get(category) ?? 0) + weighted);
  };

  const guestProfileIds = profileId == null ? await getGuestProfileIds() : new Set<number>();

  // --- Garde-manger consommé directement (pas via une recette "faite") ---
  let pantryQuery = supabase
    .from("pantry_consumption_log")
    .select("quantity, unit_id, profile_id, recipe_id, ingredients(category)");
  if (profileId != null) pantryQuery = pantryQuery.eq("profile_id", profileId);
  const pantryRows = unwrap<
    { quantity: number; unit_id: number | null; profile_id: number | null; recipe_id: number | null; ingredients: { category: string } | null }[]
  >(await (pantryQuery as never));

  const directRows = pantryRows.filter((r) => r.recipe_id == null);
  const dishRows = pantryRows.filter((r) => r.recipe_id != null);

  for (const row of directRows) {
    if (profileId == null && row.profile_id != null && guestProfileIds.has(row.profile_id)) continue;
    if (row.ingredients) add(row.ingredients.category, row.quantity, row.unit_id);
  }

  // --- Restes de plats composites (batch cooking) : redécomposés via les ingrédients de la recette
  //     d'origine, au prorata des portions réellement consommées (quantity = portions ici, pas un poids). ---
  if (dishRows.length > 0) {
    const dishRecipeIds = [...new Set(dishRows.map((r) => r.recipe_id!))];
    const profiles = await loadRecipeIngredientProfiles(dishRecipeIds);
    for (const row of dishRows) {
      if (profileId == null && row.profile_id != null && guestProfileIds.has(row.profile_id)) continue;
      const profile = profiles.get(row.recipe_id!);
      if (!profile || profile.baseServings <= 0) continue;
      const scale = row.quantity / profile.baseServings;
      for (const ing of profile.ingredients) {
        if (ing.quantity == null) continue;
        add(ing.category, ing.quantity * scale, ing.unit_id);
      }
    }
  }

  // --- Recettes marquées "faites" ---
  let logIds: number[] | null = null;
  let excludedLogIds = new Set<number>();
  if (profileId != null) {
    const rows = unwrap<{ consumption_log_id: number }[]>(
      await supabase.from("consumption_log_profiles").select("consumption_log_id").eq("profile_id", profileId),
    );
    logIds = rows.map((r) => r.consumption_log_id);
  } else {
    excludedLogIds = await getGuestOnlyLogIds(guestProfileIds);
  }

  let logQuery = supabase.from("consumption_log").select("id, recipe_id, servings");
  if (logIds) logQuery = logQuery.in("id", logIds);
  const logRowsRaw = unwrap<{ id: number; recipe_id: number; servings: number }[]>(await logQuery);
  const logRows = logRowsRaw.filter((r) => !excludedLogIds.has(r.id));

  if (logRows.length > 0) {
    const uniqueRecipeIds = [...new Set(logRows.map((r) => r.recipe_id))];
    const profiles = await loadRecipeIngredientProfiles(uniqueRecipeIds);
    for (const log of logRows) {
      const profile = profiles.get(log.recipe_id);
      if (!profile) continue;
      const scale = profile.baseServings > 0 ? log.servings / profile.baseServings : 1;
      for (const ing of profile.ingredients) {
        if (ing.quantity == null) continue;
        add(ing.category, ing.quantity * scale, ing.unit_id);
      }
    }
  }

  return [...weights.entries()]
    .map(([category, weight]) => ({ category, count: Math.round(weight) }))
    .sort((a, b) => b.count - a.count);
}

export interface ProfileStat {
  profile_id: number;
  profile_name: string;
  profile_color: string;
  count: number;
}

/** Vue "Tous" uniquement (pas de paramètre profileId : cette section n'est affichée que là) — un profil
 * invité ne doit donc jamais y apparaître, cf. getGuestOnlyLogIds. */
export async function getConsumptionByProfile(): Promise<ProfileStat[]> {
  const [pantryRows, logProfileRows, profiles] = await Promise.all([
    supabase
      .from("pantry_consumption_log")
      .select("profile_id")
      .not("profile_id", "is", null)
      .then((r) => unwrap<{ profile_id: number }[]>(r)),
    supabase.from("consumption_log_profiles").select("profile_id").then((r) => unwrap<{ profile_id: number }[]>(r)),
    listProfiles(),
  ]);

  const guestProfileIds = new Set(profiles.filter((p) => p.is_guest).map((p) => p.id));

  const counts = new Map<number, number>();
  for (const row of pantryRows) {
    if (guestProfileIds.has(row.profile_id)) continue;
    counts.set(row.profile_id, (counts.get(row.profile_id) ?? 0) + 1);
  }
  for (const row of logProfileRows) {
    if (guestProfileIds.has(row.profile_id)) continue;
    counts.set(row.profile_id, (counts.get(row.profile_id) ?? 0) + 1);
  }

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  return [...counts.entries()]
    .filter(([id]) => profileById.has(id))
    .map(([id, count]) => {
      const p = profileById.get(id)!;
      return { profile_id: id, profile_name: p.name, profile_color: p.color, count };
    })
    .sort((a, b) => b.count - a.count);
}

export interface WasteAvoidedItem {
  ingredient_name: string;
  quantity: number;
  unit_abbreviation: string | null;
  consumed_at: string;
}

/** Aliments consommés à temps (proches de la péremption ou déjà périmés), donc sauvés du gaspillage. */
export async function getWasteAvoidedItems(): Promise<WasteAvoidedItem[]> {
  const rows = unwrap<{ quantity: number; consumed_at: string; ingredients: { name: string } | null; units: { abbreviation: string } | null }[]>(
    (await supabase
      .from("pantry_waste_avoided_log")
      .select("quantity, consumed_at, ingredients(name), units(abbreviation)")
      .order("consumed_at", { ascending: false })) as never,
  );

  return rows.map((r) => ({
    ingredient_name: r.ingredients?.name ?? "",
    quantity: r.quantity,
    unit_abbreviation: r.units?.abbreviation ?? null,
    consumed_at: r.consumed_at,
  }));
}

export interface ShoppingBudgetPoint {
  shopping_list_id: number;
  name: string;
  created_at: string;
  total_price: number;
}

/** Évolution du budget courses estimé au fil des listes de courses générées/remplies. */
export async function getShoppingBudgetTrend(): Promise<ShoppingBudgetPoint[]> {
  const lists = unwrap<{ id: number; name: string; created_at: string }[]>(
    await supabase.from("shopping_lists").select("id, name, created_at").order("created_at", { ascending: true }),
  );
  if (lists.length === 0) return [];

  const items = unwrap<{ shopping_list_id: number; price: number | null }[]>(
    await supabase.from("shopping_list_items").select("shopping_list_id, price"),
  );
  const totalByList = new Map<number, number>();
  for (const item of items) {
    if (item.price == null) continue;
    totalByList.set(item.shopping_list_id, (totalByList.get(item.shopping_list_id) ?? 0) + item.price);
  }

  return lists
    .map((l) => ({ shopping_list_id: l.id, name: l.name, created_at: l.created_at, total_price: totalByList.get(l.id) ?? 0 }))
    .filter((p) => p.total_price > 0);
}
