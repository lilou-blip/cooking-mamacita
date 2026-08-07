import { supabase } from "./supabase";

export interface SharedRecipeIngredient {
  name: string;
  quantity: number | null;
  unit_abbreviation: string | null;
  note: string | null;
}

export interface SharedRecipeStep {
  step_number: number;
  instruction: string;
}

export interface SharedRecipe {
  title: string;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  notes: string | null;
  ingredients: SharedRecipeIngredient[];
  steps: SharedRecipeStep[];
}

/** Fonctionne sans être connecté : la fonction get-shared-recipe accepte les appels anonymes et fait sa
 * propre vérification via le token (pas de session utilisateur nécessaire côté client). */
export async function getSharedRecipe(token: string): Promise<SharedRecipe> {
  const { data, error } = await supabase.functions.invoke<SharedRecipe & { error?: string }>("get-shared-recipe", {
    body: { token },
  });
  if (error) throw new Error("Ce lien de recette n'est plus valide.");
  if (data?.error) throw new Error(data.error);
  return data as SharedRecipe;
}
