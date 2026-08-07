import { useEffect, useState } from "react";
import { getSharedRecipe, type SharedRecipe, type SharedRecipeIngredient } from "../lib/sharedRecipe";
import { LoadingScreen } from "./LoadingScreen";
import tableBackground from "../assets/illustrations/table-background.webp";
import "./SharedRecipePage.css";

interface SharedRecipePageProps {
  token: string;
}

function formatQuantity(ing: SharedRecipeIngredient): string {
  if (ing.quantity == null) return "";
  const qty = Math.round(ing.quantity * 100) / 100;
  if (!ing.unit_abbreviation || ing.unit_abbreviation === "pièce") return `${qty}`;
  return `${qty} ${ing.unit_abbreviation}`;
}

export function SharedRecipePage({ token }: SharedRecipePageProps) {
  const [recipe, setRecipe] = useState<SharedRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setRecipe(await getSharedRecipe(token));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) return <LoadingScreen message="Ouverture de la recette..." />;

  return (
    <div className="shared-recipe" style={{ backgroundImage: `url(${tableBackground})` }}>
      <div className="shared-recipe__card">
        <p className="shared-recipe__badge">🍲 Cooking Mamacita</p>

        {error || !recipe ? (
          <p className="form-error">{error ?? "Recette introuvable."}</p>
        ) : (
          <>
            <h1>{recipe.title}</h1>
            <div className="shared-recipe__meta">
              {recipe.prep_time_minutes != null && <span>⏱ {recipe.prep_time_minutes} min prépa</span>}
              {recipe.cook_time_minutes != null && <span>🔥 {recipe.cook_time_minutes} min cuisson</span>}
              <span>🍽 {recipe.servings} pers.</span>
            </div>

            <h2>Ingrédients</h2>
            <ul className="shared-recipe__ingredients">
              {recipe.ingredients.map((ing, i) => (
                <li key={i}>
                  <span className="shared-recipe__qty">{formatQuantity(ing)}</span>
                  <span>
                    {ing.name}
                    {ing.note && <span className="shared-recipe__note"> ({ing.note})</span>}
                  </span>
                </li>
              ))}
            </ul>

            <h2>Préparation</h2>
            <ol className="shared-recipe__steps">
              {recipe.steps.map((s) => (
                <li key={s.step_number}>{s.instruction}</li>
              ))}
            </ol>

            {recipe.notes && (
              <div className="shared-recipe__notes">
                <h2>Notes</h2>
                <p>{recipe.notes}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
