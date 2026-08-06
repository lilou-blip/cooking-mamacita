import { useEffect, useMemo, useState } from "react";
import { createPantryItem, listRecipes, listStorageUnits, type Recipe, type StorageUnit } from "../lib/db";
import { LoadingScreen } from "./LoadingScreen";
import "./BatchCooking.css";

interface BatchCookingProps {
  onBack: () => void;
  onDone: () => void;
}

interface SelectedRecipe {
  recipe: Recipe;
  portions: string;
  storageUnitId: number | "";
  expiresAt: string;
}

export function BatchCooking({ onBack, onDone }: BatchCookingProps) {
  const [step, setStep] = useState<"pick" | "distribute">("pick");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<SelectedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [recipeList, units] = await Promise.all([listRecipes(), listStorageUnits()]);
      setRecipes(recipeList);
      setStorageUnits(units);
      setLoading(false);
    })();
  }, []);

  const visibleRecipes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return recipes;
    return recipes.filter((r) => r.title.toLowerCase().includes(query));
  }, [recipes, search]);

  function toggleRecipe(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function goToDistribute() {
    const chosen = recipes.filter((r) => selectedIds.has(r.id));
    setSelected(
      chosen.map((recipe) => ({
        recipe,
        portions: String(recipe.servings),
        storageUnitId: "",
        expiresAt: "",
      })),
    );
    setStep("distribute");
  }

  function updateSelected(recipeId: number, patch: Partial<SelectedRecipe>) {
    setSelected((prev) => prev.map((s) => (s.recipe.id === recipeId ? { ...s, ...patch } : s)));
  }

  async function handleDistribute() {
    setSaving(true);
    setError(null);
    try {
      for (const s of selected) {
        const portions = Number(s.portions);
        if (!portions || portions <= 0) continue;
        await createPantryItem({
          ingredient_name: `Restes de ${s.recipe.title}`,
          ingredient_category: "autre",
          quantity: portions,
          unit_abbreviation: null,
          expires_at: s.expiresAt || null,
          storage_unit_id: s.storageUnitId || null,
          recipe_id: s.recipe.id,
          assignments: [],
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingScreen message="Chargement des recettes..." />;

  return (
    <div className="batch-cooking">
      <button className="book-nav__back" onClick={onBack}>
        ← Garde-manger
      </button>

      <div className="batch-cooking__paper">
        <h1>🍲 Batch cooking</h1>

        {step === "pick" ? (
          <>
            <p className="batch-cooking__hint">
              Choisis les recettes que tu cuisines aujourd'hui — à la fin, tu répartis les restes obtenus
              directement dans le frigo ou le congélateur.
            </p>
            <input
              type="search"
              placeholder="Rechercher une recette..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="batch-cooking__search"
            />
            {recipes.length === 0 ? (
              <p className="batch-cooking__empty">Ton carnet est vide, ajoute d'abord des recettes.</p>
            ) : (
              <ul className="batch-cooking__list">
                {visibleRecipes.map((recipe) => (
                  <li key={recipe.id}>
                    <label className="batch-cooking__item">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(recipe.id)}
                        onChange={() => toggleRecipe(recipe.id)}
                      />
                      <span className="batch-cooking__item-title">{recipe.title}</span>
                      <span className="batch-cooking__item-servings">{recipe.servings} portions habituellement</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="batch-cooking__actions">
              <button type="button" className="form-cancel" onClick={onBack}>
                Annuler
              </button>
              <button type="button" className="form-submit" onClick={goToDistribute} disabled={selectedIds.size === 0}>
                Suivant ({selectedIds.size} recette{selectedIds.size > 1 ? "s" : ""})
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="batch-cooking__hint">
              Pour chaque recette, indique combien de portions de restes tu as obtenu et où les ranger.
            </p>
            {error && <p className="form-error">{error}</p>}
            <ul className="batch-cooking__distribute-list">
              {selected.map((s) => (
                <li key={s.recipe.id} className="batch-cooking__distribute-row">
                  <span className="batch-cooking__distribute-title">{s.recipe.title}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={s.portions}
                    onChange={(e) => updateSelected(s.recipe.id, { portions: e.target.value })}
                    aria-label="Portions de restes"
                  />
                  <span className="batch-cooking__distribute-unit">portion(s)</span>
                  <select
                    value={s.storageUnitId}
                    onChange={(e) => updateSelected(s.recipe.id, { storageUnitId: e.target.value ? Number(e.target.value) : "" })}
                  >
                    <option value="">Emplacement</option>
                    {storageUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={s.expiresAt}
                    onChange={(e) => updateSelected(s.recipe.id, { expiresAt: e.target.value })}
                    title="Date de péremption (optionnel)"
                  />
                </li>
              ))}
            </ul>
            <div className="batch-cooking__actions">
              <button type="button" className="form-cancel" onClick={() => setStep("pick")} disabled={saving}>
                ← Retour
              </button>
              <button type="button" className="form-submit" onClick={handleDistribute} disabled={saving}>
                {saving ? "Ajout..." : "Ajouter au garde-manger"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
