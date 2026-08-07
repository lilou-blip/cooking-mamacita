import { useState } from "react";
import { useAsyncEffect } from "../lib/useAsyncEffect";
import { getRecipeById, type RecipeCard, type RecipeFull } from "../lib/db";
import { formatQuantityPrefix } from "../lib/formatQuantity";
import { LoadingScreen } from "./LoadingScreen";
import "./RecipeBookExport.css";

interface RecipeBookExportProps {
  recipes: RecipeCard[];
  onClose: () => void;
}

/** Fiche imprimable de tout le carnet : pas de nouvelle dépendance PDF, on s'appuie sur l'impression
 * native du navigateur (window.print → "Enregistrer en PDF"), avec une feuille de style @media print
 * dédiée pour une mise en page propre, une recette par page. */
export function RecipeBookExport({ recipes, onClose }: RecipeBookExportProps) {
  const [fullRecipes, setFullRecipes] = useState<RecipeFull[]>([]);

  const { loading, error } = useAsyncEffect(async () => {
    const details = await Promise.all(recipes.map((r) => getRecipeById(r.id)));
    setFullRecipes(details.filter((r): r is RecipeFull => r != null));
  }, [recipes]);

  if (loading) return <LoadingScreen message="Préparation du carnet à imprimer..." />;

  return (
    <div className="recipe-book-export">
      <div className="recipe-book-export__toolbar">
        <button type="button" className="form-cancel" onClick={onClose}>
          ← Fermer
        </button>
        <button type="button" className="form-submit" onClick={() => window.print()}>
          🖨️ Imprimer / Enregistrer en PDF
        </button>
      </div>

      {error && <p className="form-error">Erreur : {error}</p>}

      <div className="recipe-book-export__pages">
        <section className="recipe-book-export__cover">
          <h1>Mon carnet de recettes</h1>
          <p>{fullRecipes.length} recette{fullRecipes.length > 1 ? "s" : ""}</p>
        </section>

        {fullRecipes.map((recipe) => (
          <article key={recipe.id} className="recipe-book-export__recipe">
            <h2>{recipe.title}</h2>
            <p className="recipe-book-export__meta">
              {recipe.servings} portion{recipe.servings > 1 ? "s" : ""}
              {recipe.prep_time_minutes != null && ` · ${recipe.prep_time_minutes} min prépa`}
              {recipe.cook_time_minutes != null && ` · ${recipe.cook_time_minutes} min cuisson`}
            </p>
            {recipe.tags.length > 0 && (
              <p className="recipe-book-export__tags">{recipe.tags.map((t) => t.name).join(" · ")}</p>
            )}

            <div className="recipe-book-export__columns">
              <div>
                <h3>Ingrédients</h3>
                <ul>
                  {recipe.ingredients.map((ing) => (
                    <li key={ing.id}>
                      {formatQuantityPrefix(ing.quantity, ing.unit_abbreviation)}
                      {ing.ingredient_name}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Préparation</h3>
                <ol>
                  {[...recipe.steps]
                    .sort((a, b) => a.step_number - b.step_number)
                    .map((s) => (
                      <li key={s.id}>{s.instruction}</li>
                    ))}
                </ol>
              </div>
            </div>

            {recipe.notes && (
              <p className="recipe-book-export__notes">
                <strong>Notes : </strong>
                {recipe.notes}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
