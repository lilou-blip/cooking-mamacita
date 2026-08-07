import { useEffect, useState } from "react";
import {
  addShoppingListItem,
  getMissingIngredientsForRecipe,
  getOrCreateRecipeShareToken,
  getOrCreateStandaloneShoppingList,
  type MissingIngredient,
  type RecipeFull,
  type RecipeIngredientView,
} from "../lib/db";
import { estimatePriceRange } from "../lib/ollama";
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
  const [cost, setCost] = useState<{ low: number; high: number } | null>(null);
  const [estimatingCost, setEstimatingCost] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [missing, setMissing] = useState<MissingIngredient[] | null>(null);
  const [addingToList, setAddingToList] = useState(false);
  const [addedToList, setAddedToList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMissingIngredientsForRecipe(recipe.id, servings).then((result) => {
      if (!cancelled) setMissing(result);
    });
    return () => {
      cancelled = true;
    };
  }, [recipe.id, servings]);

  async function handleAddMissingToList() {
    if (!missing || missing.length === 0) return;
    setAddingToList(true);
    setListError(null);
    try {
      const listId = await getOrCreateStandaloneShoppingList();
      // Chaque ingrédient est indépendant : si l'un échoue (ingrédient/unité introuvable, conflit...), les
      // autres doivent quand même être ajoutés plutôt que de tout bloquer silencieusement.
      const failures: string[] = [];
      for (const m of missing) {
        try {
          await addShoppingListItem(listId, {
            ingredient_name: m.ingredient_name,
            quantity: m.quantity,
            unit_abbreviation: m.unit_abbreviation,
          });
        } catch (err) {
          console.error(`Échec ajout "${m.ingredient_name}" à la liste de courses :`, err);
          failures.push(m.ingredient_name);
        }
      }
      if (failures.length > 0) {
        setListError(`Pas pu ajouter : ${failures.join(", ")}. Le reste a bien été ajouté.`);
      } else {
        setAddedToList(true);
        setTimeout(() => setAddedToList(false), 2500);
      }
    } finally {
      setAddingToList(false);
    }
  }

  async function handleShare() {
    setShareStatus("loading");
    try {
      const token = await getOrCreateRecipeShareToken(recipe.id);
      const url = `${window.location.origin}/share/${token}`;
      if (navigator.share) {
        await navigator.share({ title: recipe.title, text: `Recette : ${recipe.title}`, url });
        setShareStatus("idle");
      } else {
        await navigator.clipboard.writeText(url);
        setShareStatus("copied");
        setTimeout(() => setShareStatus("idle"), 2000);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setShareStatus("idle");
      } else {
        setShareStatus("error");
        setTimeout(() => setShareStatus("idle"), 3000);
      }
    }
  }

  function changeServings(next: number) {
    setServings(next);
    setCost(null);
  }

  async function handleEstimateCost() {
    setEstimatingCost(true);
    try {
      let low = 0;
      let high = 0;
      for (const ing of recipe.ingredients) {
        const range = await estimatePriceRange(
          ing.ingredient_name,
          ing.quantity != null ? ing.quantity * scale : null,
          ing.unit_abbreviation,
        );
        low += range.low;
        high += range.high;
      }
      setCost({ low: Math.round(low * 100) / 100, high: Math.round(high * 100) / 100 });
    } finally {
      setEstimatingCost(false);
    }
  }

  return (
    <>
      <SprigDoodle className="book-page__doodle book-page__doodle--tl" />

      <div className="book-page__page-actions">
        <button type="button" className="book-nav__action" onClick={onEdit}>
          Éditer
        </button>
        <button type="button" className="book-nav__action" onClick={handleShare} disabled={shareStatus === "loading"}>
          {shareStatus === "copied" ? "Lien copié !" : shareStatus === "error" ? "Erreur" : "Partager"}
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
              onClick={() => changeServings(Math.max(1, servings - 1))}
              disabled={servings <= 1}
              aria-label="Moins de portions"
            >
              −
            </button>
            {servings} pers.
            <button type="button" onClick={() => changeServings(servings + 1)} aria-label="Plus de portions">
              +
            </button>
          </span>
        </div>
      </header>

      <IngredientIllustrations ingredientNames={recipe.ingredients.map((ing) => ing.ingredient_name)} />

      <div className="book-page__ingredients">
        <div className="book-page__ingredients-header">
          <h2>Ingrédients</h2>
          {cost ? (
            <span className="book-page__cost">
              💰 ~{cost.low === cost.high ? `${cost.low}` : `${cost.low}-${cost.high}`}€
            </span>
          ) : (
            <button type="button" className="book-page__cost-btn" onClick={handleEstimateCost} disabled={estimatingCost}>
              {estimatingCost ? "Mamacita calcule..." : "💰 Estimer le coût"}
            </button>
          )}
        </div>
        {missing && missing.length > 0 && (
          <div className="book-page__missing">
            <p>
              ⚠️ Il te manque :{" "}
              {missing
                .map((m) => `${m.quantity}${m.unit_abbreviation ? ` ${m.unit_abbreviation}` : ""} ${m.ingredient_name}`)
                .join(", ")}
            </p>
            <button
              type="button"
              className="book-page__missing-add"
              onClick={handleAddMissingToList}
              disabled={addingToList}
            >
              {addedToList ? "Ajouté !" : addingToList ? "Ajout..." : "🛒 Ajouter à la liste de courses"}
            </button>
            {listError && <p className="book-page__missing-error">{listError}</p>}
          </div>
        )}
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
