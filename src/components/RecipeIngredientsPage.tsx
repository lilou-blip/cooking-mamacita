import { useState } from "react";
import type { RecipeFull, RecipeIngredientView } from "../lib/db";
import { SprigDoodle } from "./SprigDoodle";
import { IngredientIllustrations } from "./IngredientIllustrations";
import "./BookPage.css";

function formatQuantity(ing: RecipeIngredientView, scale: number): string {
  if (ing.quantity == null) return "";
  const qty = Math.round(ing.quantity * scale * 100) / 100;
  if (!ing.unit_abbreviation || ing.unit_abbreviation === "pièce") {
    return `${qty}`;
  }
  return `${qty} ${ing.unit_abbreviation}`;
}

interface RecipeIngredientsPageProps {
  recipe: RecipeFull;
  onEdit: () => void;
  onDelete: () => void;
}

export function RecipeIngredientsPage({ recipe, onEdit, onDelete }: RecipeIngredientsPageProps) {
  const [servings, setServings] = useState(recipe.servings);
  const scale = servings / recipe.servings;

  return (
    <>
      <SprigDoodle className="book-page__doodle book-page__doodle--tl" />

      <div className="book-page__page-actions">
        <button type="button" className="book-nav__action" onClick={onEdit}>
          Éditer
        </button>
        <button type="button" className="book-nav__action book-nav__action--danger" onClick={onDelete}>
          Supprimer
        </button>
      </div>

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

        <div className="book-page__meta">
          {recipe.prep_time_minutes != null && <span>⏱ {recipe.prep_time_minutes} min prépa</span>}
          {recipe.cook_time_minutes != null && <span>🔥 {recipe.cook_time_minutes} min cuisson</span>}
          <span className="book-page__servings">
            🍽
            <button
              type="button"
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              disabled={servings <= 1}
              aria-label="Moins de portions"
            >
              −
            </button>
            {servings} pers.
            <button type="button" onClick={() => setServings((s) => s + 1)} aria-label="Plus de portions">
              +
            </button>
          </span>
        </div>
      </header>

      <IngredientIllustrations ingredientNames={recipe.ingredients.map((ing) => ing.ingredient_name)} />

      <div className="book-page__ingredients">
        <h2>Ingrédients</h2>
        <ul>
          {recipe.ingredients.map((ing) => (
            <li key={ing.id}>
              <span className="book-page__ingredient-qty">{formatQuantity(ing, scale)}</span>
              <span>{ing.ingredient_name}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
