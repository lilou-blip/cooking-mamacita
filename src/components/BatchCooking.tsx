import { useEffect, useState } from "react";
import {
  createPantryItem,
  getMenuById,
  listMenus,
  listProfiles,
  listRecipes,
  listStorageUnits,
  type MealSlot,
  type Profile,
  type Recipe,
  type StorageUnit,
} from "../lib/db";
import { pickCurrentWeekMenu } from "../lib/weekMenu";
import { MEAL_SLOTS } from "../lib/constants";
import { LoadingScreen } from "./LoadingScreen";
import "./PantryForm.css";
import "./BatchCooking.css";

interface BatchCookingProps {
  onBack: () => void;
  onDone: () => void;
}

interface StorageChunk {
  key: string;
  quantity: string;
  storageUnitId: number | "";
  expiresAt: string;
  showAssignments: boolean;
  assignments: Record<number, string>;
}

interface BatchEntry {
  recipeId: number;
  title: string;
  suggestedTotal: number | null;
  totalQuantity: string;
  chunks: StorageChunk[];
}

function makeChunk(): StorageChunk {
  return { key: crypto.randomUUID(), quantity: "", storageUnitId: "", expiresAt: "", showAssignments: false, assignments: {} };
}

export function BatchCooking({ onBack, onDone }: BatchCookingProps) {
  const [step, setStep] = useState<"slot" | "build">("slot");
  const [slot, setSlot] = useState<MealSlot | null>(null);
  const [weekMenuName, setWeekMenuName] = useState<string | null>(null);
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [addRecipeId, setAddRecipeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [recipeList, units, profileList] = await Promise.all([listRecipes(), listStorageUnits(), listProfiles()]);
      setAllRecipes(recipeList);
      setStorageUnits(units);
      setProfiles(profileList);
      setLoading(false);
    })();
  }, []);

  async function chooseSlot(chosen: MealSlot) {
    setSlot(chosen);
    setWeekMenuName(null);

    const menus = await listMenus();
    const weekMenu = pickCurrentWeekMenu(menus);
    let initialEntries: BatchEntry[] = [];

    if (weekMenu) {
      const full = await getMenuById(weekMenu.id);
      if (full) {
        const byRecipe = new Map<number, { title: string; total: number }>();
        for (const r of full.recipes.filter((r) => r.meal_slot === chosen)) {
          const existing = byRecipe.get(r.recipe_id) ?? { title: r.title, total: 0 };
          existing.total += r.servings;
          byRecipe.set(r.recipe_id, existing);
        }
        if (byRecipe.size > 0) setWeekMenuName(full.name);
        initialEntries = [...byRecipe.entries()].map(([recipeId, { title, total }]) => ({
          recipeId,
          title,
          suggestedTotal: total,
          totalQuantity: String(total),
          chunks: [makeChunk()],
        }));
      }
    }

    setEntries(initialEntries);
    setStep("build");
  }

  function addRecipeManually() {
    const recipeId = Number(addRecipeId);
    const recipe = allRecipes.find((r) => r.id === recipeId);
    if (!recipe || entries.some((e) => e.recipeId === recipeId)) return;
    setEntries((prev) => [...prev, { recipeId, title: recipe.title, suggestedTotal: null, totalQuantity: "", chunks: [makeChunk()] }]);
    setAddRecipeId("");
  }

  function removeEntry(recipeId: number) {
    setEntries((prev) => prev.filter((e) => e.recipeId !== recipeId));
  }

  function updateEntry(recipeId: number, patch: Partial<BatchEntry>) {
    setEntries((prev) => prev.map((e) => (e.recipeId === recipeId ? { ...e, ...patch } : e)));
  }

  function addChunk(recipeId: number) {
    setEntries((prev) => prev.map((e) => (e.recipeId === recipeId ? { ...e, chunks: [...e.chunks, makeChunk()] } : e)));
  }

  function removeChunk(recipeId: number, key: string) {
    setEntries((prev) =>
      prev.map((e) => (e.recipeId === recipeId ? { ...e, chunks: e.chunks.filter((c) => c.key !== key) } : e)),
    );
  }

  function updateChunk(recipeId: number, key: string, patch: Partial<StorageChunk>) {
    setEntries((prev) =>
      prev.map((e) =>
        e.recipeId === recipeId ? { ...e, chunks: e.chunks.map((c) => (c.key === key ? { ...c, ...patch } : c)) } : e,
      ),
    );
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      for (const entry of entries) {
        for (const chunk of entry.chunks) {
          const qty = Number(chunk.quantity);
          if (!qty || qty <= 0) continue;
          const assignments = Object.entries(chunk.assignments)
            .map(([profileId, value]) => ({ profile_id: Number(profileId), quantity: Number(value) || 0 }))
            .filter((a) => a.quantity > 0);
          await createPantryItem({
            ingredient_name: `Restes de ${entry.title}`,
            ingredient_category: "autre",
            quantity: qty,
            unit_abbreviation: null,
            storage_unit_id: chunk.storageUnitId || null,
            expires_at: chunk.expiresAt || null,
            recipe_id: entry.recipeId,
            assignments,
          });
        }
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingScreen message="Chargement..." />;

  const availableToAdd = allRecipes.filter((r) => !entries.some((e) => e.recipeId === r.id));
  const slotLabel = MEAL_SLOTS.find((s) => s.value === slot)?.label ?? "";

  return (
    <div className="batch-cooking">
      <button className="book-nav__back" onClick={step === "slot" ? onBack : () => setStep("slot")}>
        {step === "slot" ? "← Garde-manger" : "← Changer de créneau"}
      </button>

      <div className="batch-cooking__paper">
        <h1>🍲 Batch cooking</h1>

        {step === "slot" ? (
          <>
            <p className="batch-cooking__hint">
              Pour quel créneau repas ? S'il est déjà planifié dans le menu de la semaine, les quantités
              seront calculées automatiquement.
            </p>
            <div className="batch-cooking__slots">
              {MEAL_SLOTS.map((s) => (
                <button key={s.value} type="button" className="batch-cooking__slot" onClick={() => chooseSlot(s.value)}>
                  {s.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="batch-cooking__hint">
              {weekMenuName
                ? `Détecté depuis le menu "${weekMenuName}" — quantités calculées, ajustables si besoin.`
                : `Rien de planifié pour "${slotLabel}" cette semaine — ajoute les recettes à préparer directement.`}
            </p>
            {error && <p className="form-error">{error}</p>}

            {entries.length === 0 && (
              <p className="batch-cooking__empty">Aucune recette pour l'instant, ajoutes-en une ci-dessous.</p>
            )}

            <ul className="batch-cooking__entries">
              {entries.map((entry) => {
                const totalChunks = entry.chunks.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0);
                const target = Number(entry.totalQuantity) || 0;
                return (
                  <li key={entry.recipeId} className="batch-cooking__entry">
                    <div className="batch-cooking__entry-header">
                      <span className="batch-cooking__entry-title">{entry.title}</span>
                      {entry.suggestedTotal != null && (
                        <span className="batch-cooking__entry-suggested">planifié : {entry.suggestedTotal} portions</span>
                      )}
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        className="batch-cooking__entry-total"
                        value={entry.totalQuantity}
                        onChange={(e) => updateEntry(entry.recipeId, { totalQuantity: e.target.value })}
                        aria-label="Quantité totale à cuisiner"
                      />
                      <span className="batch-cooking__entry-unit">portion(s) au total</span>
                      <button
                        type="button"
                        className="batch-cooking__entry-remove"
                        onClick={() => removeEntry(entry.recipeId)}
                        aria-label="Retirer cette recette"
                      >
                        ×
                      </button>
                    </div>

                    <ul className="batch-cooking__chunks">
                      {entry.chunks.map((chunk) => (
                        <li key={chunk.key} className="batch-cooking__chunk">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder="Qté"
                            value={chunk.quantity}
                            onChange={(e) => updateChunk(entry.recipeId, chunk.key, { quantity: e.target.value })}
                            aria-label="Portions pour cet emplacement"
                          />
                          <select
                            value={chunk.storageUnitId}
                            onChange={(e) =>
                              updateChunk(entry.recipeId, chunk.key, {
                                storageUnitId: e.target.value ? Number(e.target.value) : "",
                              })
                            }
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
                            value={chunk.expiresAt}
                            onChange={(e) => updateChunk(entry.recipeId, chunk.key, { expiresAt: e.target.value })}
                            title="Date de péremption (optionnel)"
                          />
                          {profiles.length > 0 && (
                            <button
                              type="button"
                              className="form-cancel"
                              onClick={() =>
                                updateChunk(entry.recipeId, chunk.key, { showAssignments: !chunk.showAssignments })
                              }
                            >
                              {chunk.showAssignments ? "Masquer" : "Pour qui ?"}
                            </button>
                          )}
                          {entry.chunks.length > 1 && (
                            <button
                              type="button"
                              className="batch-cooking__entry-remove"
                              onClick={() => removeChunk(entry.recipeId, chunk.key)}
                              aria-label="Retirer cet emplacement"
                            >
                              ×
                            </button>
                          )}

                          {chunk.showAssignments && (
                            <div className="pantry-form__assignments">
                              <span className="pantry-form__assignments-label">Répartition par profil (optionnel)</span>
                              <div className="pantry-form__assignments-row">
                                {profiles.map((p) => (
                                  <label key={p.id} className="pantry-form__assignment">
                                    <span style={{ color: p.color }}>{p.name}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="any"
                                      value={chunk.assignments[p.id] ?? ""}
                                      onChange={(e) =>
                                        updateChunk(entry.recipeId, chunk.key, {
                                          assignments: { ...chunk.assignments, [p.id]: e.target.value },
                                        })
                                      }
                                    />
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className="batch-cooking__chunk-actions">
                      <button type="button" className="form-cancel" onClick={() => addChunk(entry.recipeId)}>
                        + Ajouter un emplacement
                      </button>
                      {target > 0 && (
                        <span className="batch-cooking__chunk-total">
                          {totalChunks}/{target} réparti(es)
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {availableToAdd.length > 0 && (
              <div className="batch-cooking__add-row">
                <select value={addRecipeId} onChange={(e) => setAddRecipeId(e.target.value)}>
                  <option value="">+ Ajouter une recette...</option>
                  {availableToAdd.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
                <button type="button" className="form-cancel" onClick={addRecipeManually} disabled={!addRecipeId}>
                  Ajouter
                </button>
              </div>
            )}

            <div className="batch-cooking__actions">
              <button type="button" className="form-cancel" onClick={onBack} disabled={saving}>
                Annuler
              </button>
              <button type="button" className="form-submit" onClick={handleSubmit} disabled={saving || entries.length === 0}>
                {saving ? "Ajout..." : "Ajouter au garde-manger"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
