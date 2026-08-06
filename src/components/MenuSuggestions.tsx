import { useState } from "react";
import { addRecipeToMenu, type MenuFull, type Recipe } from "../lib/db";
import { suggestMenuRecipes, type MenuSuggestion } from "../lib/ollama";
import "./MenuSuggestions.css";

interface SuggestedRecipe extends MenuSuggestion {
  title: string;
}

interface MenuSuggestionsProps {
  menu: MenuFull;
  allRecipes: Recipe[];
  onAdded: () => void;
  onClose: () => void;
}

export function MenuSuggestions({ menu, allRecipes, onAdded, onClose }: MenuSuggestionsProps) {
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedRecipe[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  async function handleSuggest() {
    setLoading(true);
    setError(null);
    try {
      const results = await suggestMenuRecipes(context, menu.servings_target ?? 4);
      const titleById = new Map(allRecipes.map((r) => [r.id, r.title]));
      const withTitles = results
        .filter((s) => titleById.has(s.recipe_id))
        .map((s) => ({ ...s, title: titleById.get(s.recipe_id) as string }));
      setSuggestions(withTitles);
      setSelected(new Set(withTitles.map((s) => s.recipe_id)));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddSelected() {
    await Promise.all(
      suggestions.filter((s) => selected.has(s.recipe_id)).map((s) => addRecipeToMenu(menu.id, s.recipe_id, s.servings)),
    );
    onAdded();
    onClose();
  }

  return (
    <div className="menu-suggestions">
      <h2>Suggestions de Mamacita ✨</h2>
      <p className="menu-suggestions__hint">
        Décris le contexte (optionnel) et Mamacita propose des recettes de ton carnet.
      </p>

      {error && <p className="form-error">{error}</p>}

      <div className="menu-suggestions__input-row">
        <input
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Ex: barbecue convivial entre amis, plutôt estival"
          disabled={loading}
        />
        <button type="button" className="form-submit" onClick={handleSuggest} disabled={loading}>
          {loading ? "..." : "Proposer"}
        </button>
      </div>

      {suggestions.length > 0 && (
        <ul className="menu-suggestions__list">
          {suggestions.map((s) => (
            <li key={s.recipe_id}>
              <label>
                <input type="checkbox" checked={selected.has(s.recipe_id)} onChange={() => toggle(s.recipe_id)} />
                {s.title} — {s.servings} pers.
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="menu-suggestions__actions">
        <button type="button" className="form-cancel" onClick={onClose}>
          Fermer
        </button>
        {suggestions.length > 0 && (
          <button type="button" className="form-submit" onClick={handleAddSelected} disabled={selected.size === 0}>
            Ajouter la sélection
          </button>
        )}
      </div>
    </div>
  );
}
