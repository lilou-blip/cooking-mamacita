const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Auto-fournies par la plateforme Supabase pour chaque Edge Function, pas besoin de les configurer.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Lecture avec la clé service_role : contourne volontairement RLS (accessible sans compte via un lien
 * de partage), donc ne JAMAIS relayer directement un id/token client sans être passé par recipe_shares
 * pour retrouver le recipe_id — cette fonction ne doit exposer que ce qu'elle construit elle-même. */
async function restGet(path: string): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`Erreur Supabase (${res.status})`);
  return res.json();
}

interface RecipeRow {
  title: string;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  notes: string | null;
}
interface IngredientRow {
  quantity: number | null;
  note: string | null;
  ingredients: { name: string } | null;
  units: { abbreviation: string } | null;
}
interface StepRow {
  step_number: number;
  instruction: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (typeof token !== "string" || !token) throw new Error("Lien de partage invalide.");

    const shares = (await restGet(`recipe_shares?token=eq.${encodeURIComponent(token)}&select=recipe_id`)) as {
      recipe_id: number;
    }[];
    const recipeId = shares[0]?.recipe_id;
    if (!recipeId) return jsonResponse({ error: "Cette recette n'est plus partagée." }, 404);

    const [recipes, ingredientRows, stepRows] = (await Promise.all([
      restGet(`recipes?id=eq.${recipeId}&select=title,servings,prep_time_minutes,cook_time_minutes,notes`),
      restGet(
        `recipe_ingredients?recipe_id=eq.${recipeId}&select=quantity,note,ingredients(name),units(abbreviation)&order=position`,
      ),
      restGet(`recipe_steps?recipe_id=eq.${recipeId}&select=step_number,instruction&order=step_number`),
    ])) as [RecipeRow[], IngredientRow[], StepRow[]];

    const recipe = recipes[0];
    if (!recipe) return jsonResponse({ error: "Recette introuvable." }, 404);

    return jsonResponse({
      title: recipe.title,
      servings: recipe.servings,
      prep_time_minutes: recipe.prep_time_minutes,
      cook_time_minutes: recipe.cook_time_minutes,
      notes: recipe.notes,
      ingredients: ingredientRows.map((r) => ({
        name: r.ingredients?.name ?? "",
        quantity: r.quantity,
        unit_abbreviation: r.units?.abbreviation ?? null,
        note: r.note,
      })),
      steps: stepRows.map((s) => ({ step_number: s.step_number, instruction: s.instruction })),
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
