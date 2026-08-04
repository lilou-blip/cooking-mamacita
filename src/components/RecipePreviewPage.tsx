import type { RecipeCard } from "../lib/db";
import { IngredientIllustrations } from "./IngredientIllustrations";
import "./BookPage.css";
import "./RecipePreviewPage.css";

interface RecipePreviewPageProps {
  recipe: RecipeCard | null;
  onOpen: () => void;
}

export function RecipePreviewPage({ recipe, onOpen }: RecipePreviewPageProps) {
  if (!recipe) {
    return (
      <div className="preview-page preview-page--empty">
        <p>Choisis une recette dans le sommaire, ou tourne la page pour commencer à parcourir ton carnet.</p>
      </div>
    );
  }

  return (
    <div className="preview-page">
      <header className="book-page__header">
        <div className="book-page__title-tag">
          <h1>{recipe.title}</h1>
        </div>
        {recipe.tags.length > 0 && (
          <ul className="book-page__tags">
            {recipe.tags.map((tag) => (
              <li key={tag.id} className="tag-pill">
                {tag.name}
              </li>
            ))}
          </ul>
        )}
      </header>

      <IngredientIllustrations className="preview-page__illustrations" ingredientNames={recipe.ingredient_names} />

      <div className="book-page__meta">
        {recipe.prep_time_minutes != null && <span>⏱ {recipe.prep_time_minutes} min prépa</span>}
        {recipe.cook_time_minutes != null && <span>🔥 {recipe.cook_time_minutes} min cuisson</span>}
        <span>🍽 {recipe.servings} pers.</span>
      </div>

      <button type="button" className="form-submit preview-page__open" onClick={onOpen}>
        Lire la recette →
      </button>
    </div>
  );
}
