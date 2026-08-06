import Database from "@tauri-apps/plugin-sql";
import { ingredientFamily, ingredientMatchesStaple } from "./ingredientMatching";
import { createUnitConverter } from "./unitConversion";

const DB_URL = "sqlite:cooking-mamacita.db";

let dbPromise: Promise<Database> | null = null;
function getDb(): Promise<Database> {
  if (!dbPromise) dbPromise = Database.load(DB_URL);
  return dbPromise;
}

/** Construit la clause `VALUES ($1, $2, ...), ($colCount+1, ...), ...` d'un INSERT multi-lignes. */
export function valuesPlaceholders(rowCount: number, colCount: number): string {
  return Array.from({ length: rowCount }, (_, i) => {
    const base = i * colCount;
    return `(${Array.from({ length: colCount }, (_, j) => `$${base + j + 1}`).join(", ")})`;
  }).join(", ");
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
  const db = await getDb();
  return db.select<Recipe[]>("SELECT * FROM recipes ORDER BY created_at DESC");
}

export interface RecipeCard extends Recipe {
  tags: Tag[];
  made_count: number;
  ingredient_names: string[];
}

export async function listRecipesWithTags(): Promise<RecipeCard[]> {
  const db = await getDb();
  const recipes = await db.select<Recipe[]>("SELECT * FROM recipes ORDER BY created_at DESC");
  if (recipes.length === 0) return [];

  const tagRows = await db.select<(Tag & { recipe_id: number })[]>(
    `SELECT rt.recipe_id, t.id, t.category, t.name
     FROM recipe_tags rt
     JOIN tags t ON t.id = rt.tag_id`,
  );
  const tagsByRecipe = new Map<number, Tag[]>();
  for (const row of tagRows) {
    const list = tagsByRecipe.get(row.recipe_id) ?? [];
    list.push({ id: row.id, category: row.category, name: row.name });
    tagsByRecipe.set(row.recipe_id, list);
  }

  const madeRows = await db.select<{ recipe_id: number; count: number }[]>(
    "SELECT recipe_id, COUNT(*) as count FROM consumption_log GROUP BY recipe_id",
  );
  const madeByRecipe = new Map<number, number>(madeRows.map((r) => [r.recipe_id, r.count]));

  const ingredientRows = await db.select<{ recipe_id: number; name: string }[]>(
    `SELECT ri.recipe_id, i.name
     FROM recipe_ingredients ri
     JOIN ingredients i ON i.id = ri.ingredient_id`,
  );
  const ingredientsByRecipe = new Map<number, string[]>();
  for (const row of ingredientRows) {
    const list = ingredientsByRecipe.get(row.recipe_id) ?? [];
    list.push(row.name);
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
  const db = await getDb();
  return db.select<Tag[]>("SELECT id, category, name FROM tags ORDER BY category, name");
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
  const db = await getDb();
  return db.select<Unit[]>(
    "SELECT id, name, abbreviation, unit_type, factor_to_base FROM units ORDER BY unit_type, name",
  );
}

export interface Ingredient {
  id: number;
  name: string;
  category: string;
}

export async function listIngredients(): Promise<Ingredient[]> {
  const db = await getDb();
  return db.select<Ingredient[]>("SELECT id, name, category FROM ingredients ORDER BY name");
}

export async function getRecipeById(id: number): Promise<RecipeFull | null> {
  const db = await getDb();

  const recipes = await db.select<Recipe[]>("SELECT * FROM recipes WHERE id = $1", [id]);
  const recipe = recipes[0];
  if (!recipe) return null;

  const tags = await db.select<Tag[]>(
    `SELECT t.id, t.category, t.name
     FROM tags t
     JOIN recipe_tags rt ON rt.tag_id = t.id
     WHERE rt.recipe_id = $1`,
    [id],
  );

  const ingredients = await db.select<RecipeIngredientView[]>(
    `SELECT ri.id, ri.ingredient_id, i.name as ingredient_name, ri.quantity,
            ri.unit_id, u.name as unit_name, u.abbreviation as unit_abbreviation,
            ri.position, ri.note
     FROM recipe_ingredients ri
     JOIN ingredients i ON i.id = ri.ingredient_id
     LEFT JOIN units u ON u.id = ri.unit_id
     WHERE ri.recipe_id = $1
     ORDER BY ri.position`,
    [id],
  );

  const steps = await db.select<RecipeStep[]>(
    "SELECT id, step_number, instruction FROM recipe_steps WHERE recipe_id = $1 ORDER BY step_number",
    [id],
  );

  return { ...recipe, tags, ingredients, steps };
}

async function findOrCreateIngredient(name: string, category = "autre"): Promise<number> {
  const db = await getDb();
  const existing = await db.select<{ id: number }[]>("SELECT id FROM ingredients WHERE name = $1", [name]);
  if (existing[0]) return existing[0].id;
  const result = await db.execute("INSERT INTO ingredients (name, category) VALUES ($1, $2)", [name, category]);
  return result.lastInsertId as number;
}

async function findUnitByAbbreviation(abbreviation: string): Promise<number | null> {
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>("SELECT id FROM units WHERE abbreviation = $1", [abbreviation]);
  return rows[0]?.id ?? null;
}

async function findTagId(category: TagCategory, name: string): Promise<number | null> {
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM tags WHERE category = $1 AND name = $2",
    [category, name],
  );
  return rows[0]?.id ?? null;
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

async function writeRecipeRelations(db: Database, recipeId: number, input: NewRecipe): Promise<void> {
  // Résout les tags en parallèle (lectures indépendantes, aucun risque de doublon en base), puis insère
  // toutes les lignes en un seul aller-retour au lieu d'un INSERT par tag.
  const tagIds = await Promise.all(input.tags.map((tag) => findTagId(tag.category, tag.name)));
  const validTagIds = tagIds.filter((id): id is number => id !== null);
  if (validTagIds.length > 0) {
    await db.execute(
      `INSERT INTO recipe_tags (recipe_id, tag_id) VALUES ${valuesPlaceholders(validTagIds.length, 2)}`,
      validTagIds.flatMap((tagId) => [recipeId, tagId]),
    );
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
    const params = input.ingredients.flatMap((ing, position) => [
      recipeId,
      ingredientIdByKey.get(`${ing.name}:${ing.category ?? "autre"}`),
      ing.quantity,
      ing.unit_abbreviation ? unitIdByAbbr.get(ing.unit_abbreviation) ?? null : null,
      position,
      ing.note ?? null,
    ]);
    await db.execute(
      `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, position, note)
       VALUES ${valuesPlaceholders(input.ingredients.length, 6)}`,
      params,
    );
  }

  if (input.steps.length > 0) {
    const params = input.steps.flatMap((instruction, i) => [recipeId, i + 1, instruction]);
    await db.execute(
      `INSERT INTO recipe_steps (recipe_id, step_number, instruction) VALUES ${valuesPlaceholders(input.steps.length, 3)}`,
      params,
    );
  }
}

export async function createRecipe(input: NewRecipe): Promise<number> {
  const db = await getDb();

  const result = await db.execute(
    `INSERT INTO recipes (title, photo_path, prep_time_minutes, cook_time_minutes, servings, notes, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.title,
      input.photo_path ?? null,
      input.prep_time_minutes ?? null,
      input.cook_time_minutes ?? null,
      input.servings,
      input.notes ?? null,
      input.source ?? null,
    ],
  );
  const recipeId = result.lastInsertId as number;

  await writeRecipeRelations(db, recipeId, input);

  return recipeId;
}

export async function updateRecipe(id: number, input: NewRecipe): Promise<void> {
  const db = await getDb();

  await db.execute(
    `UPDATE recipes SET title = $1, photo_path = $2, prep_time_minutes = $3, cook_time_minutes = $4,
     servings = $5, notes = $6, source = $7 WHERE id = $8`,
    [
      input.title,
      input.photo_path ?? null,
      input.prep_time_minutes ?? null,
      input.cook_time_minutes ?? null,
      input.servings,
      input.notes ?? null,
      input.source ?? null,
      id,
    ],
  );

  await db.execute("DELETE FROM recipe_tags WHERE recipe_id = $1", [id]);
  await db.execute("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [id]);
  await db.execute("DELETE FROM recipe_steps WHERE recipe_id = $1", [id]);

  await writeRecipeRelations(db, id, input);
}

export async function deleteRecipe(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM recipes WHERE id = $1", [id]);
}

export interface Profile {
  id: number;
  name: string;
  color: string;
  relation: string | null;
  avatar: string | null;
  dietary_notes: string | null;
}

export async function listProfiles(): Promise<Profile[]> {
  const db = await getDb();
  return db.select<Profile[]>(
    "SELECT id, name, color, relation, avatar, dietary_notes FROM consumer_profiles ORDER BY created_at",
  );
}

export async function createProfile(input: {
  name: string;
  color: string;
  relation?: string | null;
  avatar?: string | null;
  dietary_notes?: string | null;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO consumer_profiles (name, color, relation, avatar, dietary_notes) VALUES ($1, $2, $3, $4, $5)",
    [input.name, input.color, input.relation ?? null, input.avatar ?? null, input.dietary_notes ?? null],
  );
  return result.lastInsertId as number;
}

export async function updateProfile(
  id: number,
  input: { name: string; color: string; relation?: string | null; avatar?: string | null; dietary_notes?: string | null },
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE consumer_profiles SET name = $1, color = $2, relation = $3, avatar = $4, dietary_notes = $5 WHERE id = $6",
    [input.name, input.color, input.relation ?? null, input.avatar ?? null, input.dietary_notes ?? null, id],
  );
}

/** Supprime un profil et nettoie ses références (assignations garde-manger, associations de consommation). */
export async function deleteProfile(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM pantry_item_assignments WHERE profile_id = $1", [id]);
  await db.execute("DELETE FROM consumption_log_profiles WHERE profile_id = $1", [id]);
  await db.execute("UPDATE pantry_consumption_log SET profile_id = NULL WHERE profile_id = $1", [id]);
  await db.execute("DELETE FROM consumer_profiles WHERE id = $1", [id]);
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
  const db = await getDb();
  return db.select<StorageUnit[]>("SELECT id, name, illustration, position FROM storage_units ORDER BY position, id");
}

export async function createStorageUnit(input: { name: string; illustration: string | null }): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ max_position: number | null }[]>("SELECT MAX(position) as max_position FROM storage_units");
  const position = (rows[0]?.max_position ?? -1) + 1;
  const result = await db.execute(
    "INSERT INTO storage_units (name, illustration, position) VALUES ($1, $2, $3)",
    [input.name, input.illustration, position],
  );
  return result.lastInsertId as number;
}

export async function deleteStorageUnit(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE pantry_items SET storage_unit_id = NULL WHERE storage_unit_id = $1", [id]);
  await db.execute("DELETE FROM storage_units WHERE id = $1", [id]);
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
  assignments: PantryAssignment[];
}

export async function listPantryItems(): Promise<PantryItem[]> {
  const db = await getDb();
  const items = await db.select<Omit<PantryItem, "assignments">[]>(
    `SELECT p.id, p.ingredient_id, i.name as ingredient_name, i.category as ingredient_category, p.quantity,
            p.unit_id, u.name as unit_name, u.abbreviation as unit_abbreviation,
            p.added_at, p.expires_at, p.storage_unit_id, su.name as storage_unit_name
     FROM pantry_items p
     JOIN ingredients i ON i.id = p.ingredient_id
     LEFT JOIN units u ON u.id = p.unit_id
     LEFT JOIN storage_units su ON su.id = p.storage_unit_id
     ORDER BY (p.expires_at IS NULL), p.expires_at ASC, i.name ASC`,
  );
  if (items.length === 0) return [];

  const assignRows = await db.select<(PantryAssignment & { pantry_item_id: number })[]>(
    `SELECT a.pantry_item_id, a.quantity, pr.id as profile_id, pr.name as profile_name, pr.color as profile_color
     FROM pantry_item_assignments a
     JOIN consumer_profiles pr ON pr.id = a.profile_id`,
  );
  const byItem = new Map<number, PantryAssignment[]>();
  for (const row of assignRows) {
    const list = byItem.get(row.pantry_item_id) ?? [];
    list.push({
      profile_id: row.profile_id,
      profile_name: row.profile_name,
      profile_color: row.profile_color,
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
  assignments: { profile_id: number; quantity: number }[];
}

export async function createPantryItem(input: NewPantryItem): Promise<number> {
  const db = await getDb();
  const ingredientId = await findOrCreateIngredient(input.ingredient_name, input.ingredient_category ?? "autre");
  const unitId = input.unit_abbreviation ? await findUnitByAbbreviation(input.unit_abbreviation) : null;

  const result = await db.execute(
    "INSERT INTO pantry_items (ingredient_id, unit_id, quantity, expires_at, storage_unit_id) VALUES ($1, $2, $3, $4, $5)",
    [ingredientId, unitId, input.quantity, input.expires_at ?? null, input.storage_unit_id ?? null],
  );
  const pantryItemId = result.lastInsertId as number;

  for (const assignment of input.assignments) {
    if (assignment.quantity > 0) {
      await db.execute(
        "INSERT INTO pantry_item_assignments (pantry_item_id, profile_id, quantity) VALUES ($1, $2, $3)",
        [pantryItemId, assignment.profile_id, assignment.quantity],
      );
    }
  }

  return pantryItemId;
}

export async function deletePantryItem(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM pantry_items WHERE id = $1", [id]);
}

/** Ajuste rapidement la quantité d'un article (+1/-1...) sans passer par le formulaire de consommation. Supprime l'article si la quantité tombe à 0. */
export async function adjustPantryItemQuantity(id: number, delta: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ quantity: number }[]>("SELECT quantity FROM pantry_items WHERE id = $1", [id]);
  const current = rows[0]?.quantity ?? 0;
  const next = Math.round((current + delta) * 100) / 100;
  if (next <= 0) {
    await db.execute("DELETE FROM pantry_items WHERE id = $1", [id]);
  } else {
    await db.execute("UPDATE pantry_items SET quantity = $1 WHERE id = $2", [next, id]);
  }
}

/** Réduit la quantité d'un article du garde-manger et journalise qui l'a consommé. Supprime la ligne si elle atteint 0. */
export async function consumePantryItem(
  id: number,
  quantityConsumed: number,
  profileId?: number | null,
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ quantity: number; ingredient_id: number; unit_id: number | null; expires_at: string | null }[]>(
    "SELECT quantity, ingredient_id, unit_id, expires_at FROM pantry_items WHERE id = $1",
    [id],
  );
  const item = rows[0];
  if (!item) return;

  const remaining = Math.round((item.quantity - quantityConsumed) * 100) / 100;
  if (remaining <= 0) {
    await db.execute("DELETE FROM pantry_items WHERE id = $1", [id]);
  } else {
    await db.execute("UPDATE pantry_items SET quantity = $1 WHERE id = $2", [remaining, id]);
  }

  await db.execute(
    "INSERT INTO pantry_consumption_log (ingredient_id, profile_id, quantity, unit_id) VALUES ($1, $2, $3, $4)",
    [item.ingredient_id, profileId ?? null, quantityConsumed, item.unit_id],
  );

  // Aliment consommé alors qu'il était proche de la péremption (ou déjà périmé) : gaspillage évité, on le journalise pour les stats éco.
  if (item.expires_at) {
    const daysLeft = (new Date(item.expires_at).getTime() - Date.now()) / 86_400_000;
    if (daysLeft <= 3) {
      await db.execute(
        "INSERT INTO pantry_waste_avoided_log (ingredient_id, quantity, unit_id) VALUES ($1, $2, $3)",
        [item.ingredient_id, quantityConsumed, item.unit_id],
      );
    }
  }
}

/** Déduit du garde-manger les ingrédients d'une recette, en piochant d'abord dans les articles qui expirent le plus tôt. */
async function deductRecipeFromPantry(db: Database, ingredients: RecipeIngredientView[], scale: number): Promise<void> {
  const relevant = ingredients.filter((ing) => ing.quantity != null);

  // Lecture : une requête par ingrédient, mais indépendantes les unes des autres -> en parallèle.
  const pantryRowsByIngredient = await Promise.all(
    relevant.map((ing) =>
      db.select<{ id: number; quantity: number }[]>(
        `SELECT id, quantity FROM pantry_items
         WHERE ingredient_id = $1 AND unit_id IS $2
         ORDER BY (expires_at IS NULL), expires_at ASC`,
        [ing.ingredient_id, ing.unit_id],
      ),
    ),
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
        ? db.execute("DELETE FROM pantry_items WHERE id = $1", [m.id])
        : db.execute("UPDATE pantry_items SET quantity = $1 WHERE id = $2", [m.remaining, m.id]),
    ),
  );
}

export async function countRecipeMade(recipeId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM consumption_log WHERE recipe_id = $1",
    [recipeId],
  );
  return rows[0]?.count ?? 0;
}

/** Marque une recette comme faite: journalise la consommation (liée aux profils) et déduit le garde-manger. */
export async function markRecipeMade(recipeId: number, servings: number, profileIds: number[] = []): Promise<void> {
  const db = await getDb();
  const recipe = await getRecipeById(recipeId);
  if (!recipe) throw new Error("Recette introuvable");

  const result = await db.execute("INSERT INTO consumption_log (recipe_id, servings) VALUES ($1, $2)", [
    recipeId,
    servings,
  ]);
  const logId = result.lastInsertId as number;

  if (profileIds.length > 0) {
    await db.execute(
      `INSERT INTO consumption_log_profiles (consumption_log_id, profile_id) VALUES ${valuesPlaceholders(profileIds.length, 2)}`,
      profileIds.flatMap((profileId) => [logId, profileId]),
    );
  }

  const scale = recipe.servings > 0 ? servings / recipe.servings : 1;
  await deductRecipeFromPantry(db, recipe.ingredients, scale);
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
  const db = await getDb();
  return db.select<Menu[]>(
    "SELECT * FROM menus ORDER BY (event_date IS NULL), event_date ASC, created_at DESC",
  );
}

export async function createMenu(input: {
  name: string;
  menu_type?: MenuType;
  event_date?: string | null;
  servings_target?: number | null;
  notes?: string | null;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO menus (name, menu_type, event_date, servings_target, notes) VALUES ($1, $2, $3, $4, $5)",
    [
      input.name,
      input.menu_type ?? "evenement",
      input.event_date ?? null,
      input.servings_target ?? null,
      input.notes ?? null,
    ],
  );
  return result.lastInsertId as number;
}

export async function deleteMenu(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM menus WHERE id = $1", [id]);
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
  const db = await getDb();
  const menus = await db.select<Menu[]>("SELECT * FROM menus WHERE id = $1", [id]);
  const menu = menus[0];
  if (!menu) return null;

  const rawRecipes = await db.select<(Omit<MenuRecipeRow, "made"> & { made: number })[]>(
    `SELECT mr.id as menu_recipe_id, mr.recipe_id, r.title, r.photo_path, mr.servings, mr.made,
            mr.day_of_week, mr.meal_slot
     FROM menu_recipes mr
     JOIN recipes r ON r.id = mr.recipe_id
     WHERE mr.menu_id = $1
     ORDER BY mr.id`,
    [id],
  );
  const recipes: MenuRecipeRow[] = rawRecipes.map((r) => ({ ...r, made: !!r.made }));

  return { ...menu, recipes };
}

export async function updateMenuRecipeMade(menuRecipeId: number, made: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE menu_recipes SET made = $1 WHERE id = $2", [made ? 1 : 0, menuRecipeId]);
}

export async function addRecipeToMenu(
  menuId: number,
  recipeId: number,
  servings: number,
  dayOfWeek?: number | null,
  mealSlot?: MealSlot | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO menu_recipes (menu_id, recipe_id, servings, day_of_week, meal_slot) VALUES ($1, $2, $3, $4, $5)",
    [menuId, recipeId, servings, dayOfWeek ?? null, mealSlot ?? null],
  );
}

export async function removeMenuRecipe(menuRecipeId: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM menu_recipes WHERE id = $1", [menuRecipeId]);
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
  const db = await getDb();
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM shopping_lists WHERE menu_id IS NULL ORDER BY created_at ASC LIMIT 1",
  );
  if (existing[0]) return existing[0].id;

  const result = await db.execute("INSERT INTO shopping_lists (menu_id, name) VALUES (NULL, $1)", ["Liste de courses"]);
  return result.lastInsertId as number;
}

/** Produits de base qu'on veut se voir suggérer dès qu'il en reste peu, même s'ils ne sont pas requis par le menu. */
const STAPLE_DEFAULTS: { name: string; category: string; quantity: number; unitAbbr: string | null }[] = [
  { name: "oeufs", category: "proteines", quantity: 6, unitAbbr: null },
  { name: "farine", category: "epicerie", quantity: 1, unitAbbr: "kg" },
  { name: "sucre", category: "epicerie", quantity: 1, unitAbbr: "kg" },
  { name: "huile", category: "epicerie", quantity: 1, unitAbbr: "l" },
  { name: "lait", category: "laitages", quantity: 1, unitAbbr: "l" },
  { name: "beurre", category: "laitages", quantity: 250, unitAbbr: "g" },
];

export async function generateShoppingListForMenu(menuId: number): Promise<number> {
  const db = await getDb();
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

  const pantryRows = await db.select<{ ingredient_id: number; unit_id: number | null; total: number }[]>(
    "SELECT ingredient_id, unit_id, SUM(quantity) as total FROM pantry_items GROUP BY ingredient_id, unit_id",
  );
  const pantryBaseByKey = new Map<string, number>();
  for (const row of pantryRows) {
    const baseQty = toBase(row.total, row.unit_id);
    const key = `${row.ingredient_id}:${unitTypeOf(row.unit_id)}`;
    pantryBaseByKey.set(key, (pantryBaseByKey.get(key) ?? 0) + baseQty);
  }

  const result = await db.execute("INSERT INTO shopping_lists (menu_id, name) VALUES ($1, $2)", [
    menuId,
    `Courses – ${menu.name}`,
  ]);
  const shoppingListId = result.lastInsertId as number;

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
    await db.execute(
      `INSERT INTO shopping_list_items (shopping_list_id, ingredient_id, quantity, unit_id) VALUES ${valuesPlaceholders(missingRows.length, 4)}`,
      missingRows.flatMap((r) => [shoppingListId, r.ingredientId, r.quantity, r.unitId]),
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
    await db.execute(
      `INSERT INTO shopping_list_items (shopping_list_id, ingredient_id, quantity, unit_id, is_suggested)
       VALUES ${valuesPlaceholders(staplesToInsert.length, 5)}`,
      staplesToInsert.flatMap((s) => [shoppingListId, s.canonicalId, s.quantity, s.unitId, 1]),
    );
  }

  await mergeDuplicateShoppingListItems(shoppingListId);

  return shoppingListId;
}

/** Fusionne les articles en double d'une liste de courses (ex: "2 œufs" + "1 œuf" -> "3 œufs", "beurre mou" + "beurre" -> "beurre"). */
export async function mergeDuplicateShoppingListItems(shoppingListId: number): Promise<void> {
  const db = await getDb();
  const units = await listUnits();
  const { unitById, unitTypeOf, toBase } = createUnitConverter(units);

  const rows = await db.select<
    { id: number; ingredient_id: number; ingredient_name: string; quantity: number | null; unit_id: number | null; is_suggested: number }[]
  >(
    `SELECT sli.id, sli.ingredient_id, i.name as ingredient_name, sli.quantity, sli.unit_id, sli.is_suggested
     FROM shopping_list_items sli JOIN ingredients i ON i.id = sli.ingredient_id
     WHERE sli.shopping_list_id = $1`,
    [shoppingListId],
  );

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${ingredientFamily(row.ingredient_name)}:${unitTypeOf(row.unit_id)}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  // Chaque groupe (et, à l'intérieur d'un groupe, l'UPDATE de la ligne conservée et les DELETE des autres)
  // touche des lignes distinctes : tout peut s'exécuter en parallèle plutôt que groupe par groupe.
  const writes: Promise<unknown>[] = [];
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
    const isSuggested = group.some((r) => r.is_suggested) ? 1 : 0;

    writes.push(
      db.execute(
        "UPDATE shopping_list_items SET ingredient_id = $1, quantity = $2, unit_id = $3, is_suggested = $4, price = NULL, price_is_estimate = 0 WHERE id = $5",
        [
          displayRow.ingredient_id,
          mergedQuantity != null ? Math.round(mergedQuantity * 100) / 100 : null,
          displayRow.unit_id,
          isSuggested,
          displayRow.id,
        ],
      ),
    );
    for (const row of group) {
      if (row.id !== displayRow.id) {
        writes.push(db.execute("DELETE FROM shopping_list_items WHERE id = $1", [row.id]));
      }
    }
  }
  await Promise.all(writes);
}

export async function getShoppingListById(id: number): Promise<ShoppingListFull | null> {
  const db = await getDb();
  const lists = await db.select<ShoppingList[]>("SELECT * FROM shopping_lists WHERE id = $1", [id]);
  const list = lists[0];
  if (!list) return null;

  const rawItems = await db.select<
    {
      id: number;
      ingredient_id: number;
      ingredient_name: string;
      quantity: number | null;
      unit_id: number | null;
      unit_abbreviation: string | null;
      price: number | null;
      price_is_estimate: number;
      checked: number;
      is_suggested: number;
    }[]
  >(
    `SELECT sli.id, sli.ingredient_id, i.name as ingredient_name, sli.quantity,
            sli.unit_id, u.abbreviation as unit_abbreviation, sli.price, sli.price_is_estimate, sli.checked,
            sli.is_suggested
     FROM shopping_list_items sli
     JOIN ingredients i ON i.id = sli.ingredient_id
     LEFT JOIN units u ON u.id = sli.unit_id
     WHERE sli.shopping_list_id = $1
     ORDER BY i.name`,
    [id],
  );

  const items: ShoppingListItem[] = rawItems.map((r) => ({
    ...r,
    price_is_estimate: !!r.price_is_estimate,
    checked: !!r.checked,
    is_suggested: !!r.is_suggested,
  }));

  return { ...list, items };
}

export async function updateShoppingListItem(
  id: number,
  patch: { price?: number | null; priceIsEstimate?: boolean; checked?: boolean },
): Promise<void> {
  const db = await getDb();
  if (patch.price !== undefined) {
    await db.execute("UPDATE shopping_list_items SET price = $1, price_is_estimate = $2 WHERE id = $3", [
      patch.price,
      patch.priceIsEstimate ? 1 : 0,
      id,
    ]);
  }
  if (patch.checked !== undefined) {
    await db.execute("UPDATE shopping_list_items SET checked = $1 WHERE id = $2", [patch.checked ? 1 : 0, id]);
  }
}

/** Ajoute un article saisi manuellement (pas dérivé d'une recette) à une liste de courses existante. */
export async function addShoppingListItem(
  shoppingListId: number,
  input: { ingredient_name: string; ingredient_category?: string; quantity: number | null; unit_abbreviation: string | null },
): Promise<number> {
  const db = await getDb();
  const ingredientId = await findOrCreateIngredient(input.ingredient_name, input.ingredient_category ?? "autre");
  const unitId = input.unit_abbreviation ? await findUnitByAbbreviation(input.unit_abbreviation) : null;
  const result = await db.execute(
    "INSERT INTO shopping_list_items (shopping_list_id, ingredient_id, quantity, unit_id) VALUES ($1, $2, $3, $4)",
    [shoppingListId, ingredientId, input.quantity, unitId],
  );
  await mergeDuplicateShoppingListItems(shoppingListId);
  return result.lastInsertId as number;
}

export async function deleteShoppingListItem(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM shopping_list_items WHERE id = $1", [id]);
}

export interface TopRecipeStat {
  recipe_id: number;
  title: string;
  count: number;
}

export async function getTopMadeRecipes(limit = 5, profileId?: number | null): Promise<TopRecipeStat[]> {
  const db = await getDb();
  if (profileId != null) {
    return db.select<TopRecipeStat[]>(
      `SELECT r.id as recipe_id, r.title, COUNT(*) as count
       FROM consumption_log cl
       JOIN recipes r ON r.id = cl.recipe_id
       JOIN consumption_log_profiles clp ON clp.consumption_log_id = cl.id
       WHERE clp.profile_id = $1
       GROUP BY r.id
       ORDER BY count DESC
       LIMIT $2`,
      [profileId, limit],
    );
  }
  return db.select<TopRecipeStat[]>(
    `SELECT r.id as recipe_id, r.title, COUNT(*) as count
     FROM consumption_log cl
     JOIN recipes r ON r.id = cl.recipe_id
     GROUP BY r.id
     ORDER BY count DESC
     LIMIT $1`,
    [limit],
  );
}

export interface CategoryStat {
  category: string;
  count: number;
}

/**
 * Répartition (en nombre d'occurrences, pas en quantité — les unités ne sont pas comparables entre elles)
 * des catégories d'ingrédients consommés, via le garde-manger et les recettes faites.
 */
export async function getConsumptionByCategory(profileId?: number | null): Promise<CategoryStat[]> {
  const db = await getDb();
  if (profileId != null) {
    return db.select<CategoryStat[]>(
      `SELECT category, COUNT(*) as count FROM (
         SELECT i.category as category
         FROM pantry_consumption_log pcl
         JOIN ingredients i ON i.id = pcl.ingredient_id
         WHERE pcl.profile_id = $1

         UNION ALL

         SELECT i.category as category
         FROM consumption_log cl
         JOIN consumption_log_profiles clp ON clp.consumption_log_id = cl.id
         JOIN recipe_ingredients ri ON ri.recipe_id = cl.recipe_id
         JOIN ingredients i ON i.id = ri.ingredient_id
         WHERE clp.profile_id = $1
       )
       GROUP BY category
       ORDER BY count DESC`,
      [profileId],
    );
  }
  return db.select<CategoryStat[]>(
    `SELECT category, COUNT(*) as count FROM (
       SELECT i.category as category
       FROM pantry_consumption_log pcl
       JOIN ingredients i ON i.id = pcl.ingredient_id

       UNION ALL

       SELECT i.category as category
       FROM consumption_log cl
       JOIN recipe_ingredients ri ON ri.recipe_id = cl.recipe_id
       JOIN ingredients i ON i.id = ri.ingredient_id
     )
     GROUP BY category
     ORDER BY count DESC`,
  );
}

export interface ProfileStat {
  profile_id: number;
  profile_name: string;
  profile_color: string;
  count: number;
}

export async function getConsumptionByProfile(): Promise<ProfileStat[]> {
  const db = await getDb();
  return db.select<ProfileStat[]>(
    `SELECT pr.id as profile_id, pr.name as profile_name, pr.color as profile_color, COUNT(*) as count
     FROM (
       SELECT profile_id FROM pantry_consumption_log WHERE profile_id IS NOT NULL
       UNION ALL
       SELECT profile_id FROM consumption_log_profiles
     ) combined
     JOIN consumer_profiles pr ON pr.id = combined.profile_id
     GROUP BY pr.id
     ORDER BY count DESC`,
  );
}

export interface WasteAvoidedItem {
  ingredient_name: string;
  quantity: number;
  unit_abbreviation: string | null;
  consumed_at: string;
}

/** Aliments consommés à temps (proches de la péremption ou déjà périmés), donc sauvés du gaspillage. */
export async function getWasteAvoidedItems(): Promise<WasteAvoidedItem[]> {
  const db = await getDb();
  return db.select<WasteAvoidedItem[]>(
    `SELECT i.name as ingredient_name, w.quantity, u.abbreviation as unit_abbreviation, w.consumed_at
     FROM pantry_waste_avoided_log w
     JOIN ingredients i ON i.id = w.ingredient_id
     LEFT JOIN units u ON u.id = w.unit_id
     ORDER BY w.consumed_at DESC`,
  );
}

export interface ShoppingBudgetPoint {
  shopping_list_id: number;
  name: string;
  created_at: string;
  total_price: number;
}

/** Évolution du budget courses estimé au fil des listes de courses générées/remplies. */
export async function getShoppingBudgetTrend(): Promise<ShoppingBudgetPoint[]> {
  const db = await getDb();
  return db.select<ShoppingBudgetPoint[]>(
    `SELECT sl.id as shopping_list_id, sl.name, sl.created_at, COALESCE(SUM(sli.price), 0) as total_price
     FROM shopping_lists sl
     LEFT JOIN shopping_list_items sli ON sli.shopping_list_id = sl.id
     GROUP BY sl.id
     HAVING total_price > 0
     ORDER BY sl.created_at ASC`,
  );
}
