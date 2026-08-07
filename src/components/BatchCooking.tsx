import { useState, type CSSProperties } from "react";
import { useAsyncEffect } from "../lib/useAsyncEffect";
import {
  addShoppingListItem,
  createPantryItem,
  getMenuById,
  getOrCreateStandaloneShoppingList,
  getRecipeById,
  listMenus,
  listProfiles,
  listRecipes,
  listStorageUnits,
  previewBatchIngredients,
  type BatchIngredientPreviewRow,
  type MealSlot,
  type Profile,
  type Recipe,
  type RecipeFull,
  type RecipeIngredientView,
  type StorageUnit,
} from "../lib/db";
import { estimatePriceRange, suggestBatchCookingPlan, suggestBatchCookingSelection } from "../lib/assistant";
import { pickCurrentWeekMenu } from "../lib/weekMenu";
import { MEAL_SLOTS } from "../lib/constants";
import { CookMode } from "./CookMode";
import { LoadingScreen } from "./LoadingScreen";
import "./PantryForm.css";
import "./BatchCooking.css";

interface BatchCookingProps {
  onBack: () => void;
  onDone: () => void;
}

type Step = "slots" | "recipes" | "plan" | "store";

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
  mealSlots: MealSlot[];
  chunks: StorageChunk[];
}

function makeChunk(): StorageChunk {
  return { key: crypto.randomUUID(), quantity: "", storageUnitId: "", expiresAt: "", showAssignments: false, assignments: {} };
}

function formatIngredientLine(ing: RecipeIngredientView): string {
  if (ing.quantity == null) return ing.ingredient_name;
  const qty = Math.round(ing.quantity * 100) / 100;
  const unit = ing.unit_abbreviation ? ` ${ing.unit_abbreviation}` : "";
  return `${qty}${unit} ${ing.ingredient_name}`;
}

export function BatchCooking({ onBack, onDone }: BatchCookingProps) {
  const [step, setStep] = useState<Step>("slots");
  const [selectedSlots, setSelectedSlots] = useState<Set<MealSlot>>(new Set());
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<number>>(new Set());
  const [manualHeadcount, setManualHeadcount] = useState("");
  const [durationDays, setDurationDays] = useState("7");
  const [weekMenuName, setWeekMenuName] = useState<string | null>(null);
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipesError, setRecipesError] = useState<string | null>(null);
  const [choosingForMe, setChoosingForMe] = useState(false);

  const [expandedRecipeId, setExpandedRecipeId] = useState<number | null>(null);
  const [recipeDetails, setRecipeDetails] = useState<Record<number, RecipeFull>>({});
  const [detailLoading, setDetailLoading] = useState<Record<number, boolean>>({});
  const [cookModeRecipe, setCookModeRecipe] = useState<RecipeFull | null>(null);

  const [ingredientPreview, setIngredientPreview] = useState<BatchIngredientPreviewRow[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [batchCost, setBatchCost] = useState<{ low: number; high: number } | null>(null);
  const [estimatingCost, setEstimatingCost] = useState(false);
  const [addingMissingToList, setAddingMissingToList] = useState(false);
  const [addedMissingToList, setAddedMissingToList] = useState(false);
  const [missingListError, setMissingListError] = useState<string | null>(null);

  const [plan, setPlan] = useState<string[] | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [storageAdvice, setStorageAdvice] = useState<Record<string, string>>({});

  const { loading, error: loadError } = useAsyncEffect(async () => {
    const [recipeList, units, profileList] = await Promise.all([listRecipes(), listStorageUnits(), listProfiles()]);
    setAllRecipes(recipeList);
    setStorageUnits(units);
    setProfiles(profileList);
  }, []);

  function toggleSlot(s: MealSlot) {
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleProfile(id: number) {
    setManualHeadcount("");
    setSelectedProfileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Profils cochés ou nombre saisi à la main (mutuellement exclusifs) : sert de quantité par défaut
  // quand aucun menu de la semaine ne fournit déjà une quantité planifiée pour la recette.
  function getHeadcount(): number | null {
    if (selectedProfileIds.size > 0) return selectedProfileIds.size;
    const manual = Number(manualHeadcount);
    return manual > 0 ? manual : null;
  }

  // Nombre de jours à couvrir par cette séance de batch cooking (une semaine par défaut, mais ajustable
  // pour préparer plus large — les quantités par défaut se calculent alors sur personnes × jours).
  function getDurationDays(): number {
    const n = Number(durationDays);
    return n > 0 ? Math.round(n) : 7;
  }

  async function goToRecipes() {
    setWeekMenuName(null);
    let initialEntries: BatchEntry[] = [];
    let loadErrorMessage: string | null = null;

    try {
      const menus = await listMenus();
      const weekMenu = pickCurrentWeekMenu(menus);

      if (weekMenu) {
        const full = await getMenuById(weekMenu.id);
        if (full) {
          const byRecipe = new Map<number, { title: string; total: number; slots: Set<MealSlot> }>();
          for (const r of full.recipes.filter((r) => r.meal_slot != null && selectedSlots.has(r.meal_slot))) {
            const existing = byRecipe.get(r.recipe_id) ?? { title: r.title, total: 0, slots: new Set<MealSlot>() };
            existing.total += r.servings;
            if (r.meal_slot) existing.slots.add(r.meal_slot);
            byRecipe.set(r.recipe_id, existing);
          }
          if (byRecipe.size > 0) setWeekMenuName(full.name);
          initialEntries = [...byRecipe.entries()].map(([recipeId, { title, total, slots }]) => ({
            recipeId,
            title,
            suggestedTotal: total,
            totalQuantity: String(total),
            mealSlots: [...slots],
            chunks: [makeChunk()],
          }));
        }
      }
    } catch (err) {
      // Le menu de la semaine n'a pas pu être détecté : on continue quand même vers l'étape recettes
      // (liste vide, à composer à la main) plutôt que de bloquer sur l'étape créneaux.
      loadErrorMessage = err instanceof Error ? err.message : String(err);
    }

    setEntries(initialEntries);
    setRecipesError(loadErrorMessage);
    setStep("recipes");
  }

  function addRecipe(recipeId: number) {
    const recipe = allRecipes.find((r) => r.id === recipeId);
    if (!recipe || entries.some((e) => e.recipeId === recipeId)) return;
    const headcount = getHeadcount();
    const total = headcount != null ? headcount * getDurationDays() : null;
    setEntries((prev) => [
      ...prev,
      {
        recipeId,
        title: recipe.title,
        suggestedTotal: null,
        totalQuantity: total != null ? String(total) : "",
        mealSlots: selectedSlots.size === 1 ? [...selectedSlots] : [],
        chunks: [makeChunk()],
      },
    ]);
  }

  // Fait choisir à l'IA des recettes du carnet adaptées à chaque créneau sélectionné (pas de plat salé
  // complet pour un goûter par ex.), en quantité suffisante pour couvrir la durée choisie, réparties entre
  // plusieurs recettes par créneau pour varier plutôt que répéter la même chose tous les jours.
  async function letAppChoose() {
    setChoosingForMe(true);
    setRecipesError(null);
    try {
      const headcount = getHeadcount() ?? 4;
      const days = getDurationDays();
      const slots = MEAL_SLOTS.filter((s) => selectedSlots.has(s.value));
      const selections = (await suggestBatchCookingSelection(slots, headcount, days)).filter(
        (s) => !entries.some((e) => e.recipeId === s.recipe_id),
      );
      if (selections.length === 0) {
        setRecipesError("Mamacita n'a pas trouvé de recette adaptée dans ton carnet pour ces créneaux.");
        return;
      }
      const byRecipe = new Map<number, { title: string; total: number; slots: Set<MealSlot> }>();
      for (const s of selections) {
        const recipe = allRecipes.find((r) => r.id === s.recipe_id);
        if (!recipe) continue;
        const existing = byRecipe.get(s.recipe_id) ?? { title: recipe.title, total: 0, slots: new Set<MealSlot>() };
        existing.total += s.total_servings;
        existing.slots.add(s.meal_slot);
        byRecipe.set(s.recipe_id, existing);
      }
      setEntries((prev) => [
        ...prev,
        ...[...byRecipe.entries()].map(([recipeId, { title, total, slots: recipeSlots }]) => ({
          recipeId,
          title,
          suggestedTotal: null,
          totalQuantity: String(total),
          mealSlots: [...recipeSlots],
          chunks: [makeChunk()],
        })),
      ]);
    } catch (err) {
      setRecipesError(err instanceof Error ? err.message : String(err));
    } finally {
      setChoosingForMe(false);
    }
  }

  function removeEntry(recipeId: number) {
    setEntries((prev) => prev.filter((e) => e.recipeId !== recipeId));
    setExpandedRecipeId((prev) => (prev === recipeId ? null : prev));
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

  async function ensureRecipeDetail(recipeId: number): Promise<RecipeFull | null> {
    const cached = recipeDetails[recipeId];
    if (cached) return cached;
    setDetailLoading((prev) => ({ ...prev, [recipeId]: true }));
    try {
      const full = await getRecipeById(recipeId);
      if (full) setRecipeDetails((prev) => ({ ...prev, [recipeId]: full }));
      return full;
    } finally {
      setDetailLoading((prev) => ({ ...prev, [recipeId]: false }));
    }
  }

  async function toggleExpand(recipeId: number) {
    if (expandedRecipeId === recipeId) {
      setExpandedRecipeId(null);
      return;
    }
    setExpandedRecipeId(recipeId);
    await ensureRecipeDetail(recipeId);
  }

  async function openCookMode(recipeId: number) {
    const detail = await ensureRecipeDetail(recipeId);
    if (detail) setCookModeRecipe(detail);
  }

  async function handlePreviewIngredients() {
    setLoadingPreview(true);
    setPreviewError(null);
    setBatchCost(null);
    setMissingListError(null);
    try {
      const items = entries
        .map((e) => ({ recipeId: e.recipeId, servings: Number(e.totalQuantity) || 0 }))
        .filter((i) => i.servings > 0);
      const rows = await previewBatchIngredients(items);
      setIngredientPreview(rows);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleEstimateBatchCost() {
    if (!ingredientPreview || ingredientPreview.length === 0) return;
    setEstimatingCost(true);
    try {
      let low = 0;
      let high = 0;
      for (const row of ingredientPreview) {
        const range = await estimatePriceRange(row.ingredient_name, row.quantity, row.unit_abbreviation);
        low += range.low;
        high += range.high;
      }
      setBatchCost({ low: Math.round(low * 100) / 100, high: Math.round(high * 100) / 100 });
    } finally {
      setEstimatingCost(false);
    }
  }

  async function handleAddMissingToList() {
    const missing = ingredientPreview?.filter((row) => !row.have_enough) ?? [];
    if (missing.length === 0) return;
    setAddingMissingToList(true);
    setMissingListError(null);
    try {
      const listId = await getOrCreateStandaloneShoppingList();
      // Chaque ingrédient est indépendant : si l'un échoue, les autres doivent quand même être ajoutés
      // plutôt que de tout bloquer silencieusement (même logique que RecipeIngredientsPage).
      const failures: string[] = [];
      for (const row of missing) {
        try {
          await addShoppingListItem(listId, {
            ingredient_name: row.ingredient_name,
            quantity: row.missing_quantity,
            unit_abbreviation: row.unit_abbreviation,
          });
        } catch (err) {
          console.error(`Échec ajout "${row.ingredient_name}" à la liste de courses :`, err);
          failures.push(row.ingredient_name);
        }
      }
      if (failures.length > 0) {
        setMissingListError(`Pas pu ajouter : ${failures.join(", ")}. Le reste a bien été ajouté.`);
      } else {
        setAddedMissingToList(true);
        setTimeout(() => setAddedMissingToList(false), 2500);
      }
    } finally {
      setAddingMissingToList(false);
    }
  }

  async function handleGeneratePlan() {
    const activeEntries = entries.filter((e) => (Number(e.totalQuantity) || 0) > 0);
    if (activeEntries.length === 0) {
      setPlanError("Indique une quantité à cuisiner pour au moins une recette.");
      return;
    }
    setLoadingPlan(true);
    setPlanError(null);
    setCheckedSteps({});
    try {
      const details = await Promise.all(activeEntries.map((e) => ensureRecipeDetail(e.recipeId)));
      const payload = activeEntries
        .map((e, i) => {
          const detail = details[i];
          if (!detail) return null;
          return {
            title: e.title,
            ingredients: detail.ingredients.map(formatIngredientLine),
            steps: [...detail.steps].sort((a, b) => a.step_number - b.step_number).map((s) => s.instruction),
          };
        })
        .filter((p): p is { title: string; ingredients: string[]; steps: string[] } => p != null);
      const result = await suggestBatchCookingPlan(payload);
      if (result.plan.length === 0) setPlanError("Mamacita n'a pas réussi à générer de plan, réessaie.");
      setPlan(result.plan);
      setStorageAdvice(Object.fromEntries(result.storage.map((s) => [s.title, s.advice])));
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingPlan(false);
    }
  }

  function goToPlan() {
    const active = entries.filter((e) => (Number(e.totalQuantity) || 0) > 0);
    if (active.length === 0) {
      setRecipesError("Indique une quantité à cuisiner pour au moins une recette.");
      return;
    }
    setRecipesError(null);
    setStep("plan");
    void handlePreviewIngredients();
    void handleGeneratePlan();
  }

  function toggleChecked(index: number) {
    setCheckedSteps((prev) => ({ ...prev, [index]: !prev[index] }));
  }

  function handleBack() {
    if (step === "slots") onBack();
    else if (step === "recipes") setStep("slots");
    else if (step === "plan") setStep("recipes");
    else setStep("plan");
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
  if (loadError) return <p className="status-text status-text--error">Erreur: {loadError}</p>;

  const availableToAdd = allRecipes.filter((r) => !entries.some((e) => e.recipeId === r.id));
  const slotLabels = MEAL_SLOTS.filter((s) => selectedSlots.has(s.value)).map((s) => s.label);
  const headcount = getHeadcount();
  const days = getDurationDays();
  const backLabel =
    step === "slots" ? "← Garde-manger" : step === "recipes" ? "← Créneaux" : step === "plan" ? "← Recettes" : "← Plan";

  return (
    <div className="batch-cooking">
      <button className="book-nav__back" onClick={handleBack}>
        {backLabel}
      </button>

      <div className="batch-cooking__paper">
        <h1>🍲 Batch cooking</h1>

        {step === "slots" && (
          <>
            <p className="batch-cooking__hint">
              Pour quel(s) créneau(x) repas ? Choisis-en un ou plusieurs — s'ils sont déjà planifiés dans le
              menu de la semaine, les quantités seront calculées automatiquement.
            </p>
            <div className="batch-cooking__slots">
              {MEAL_SLOTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`batch-cooking__slot${selectedSlots.has(s.value) ? " batch-cooking__slot--active" : ""}`}
                  onClick={() => toggleSlot(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="batch-cooking__headcount">
              <label>
                Sur combien de jours ?
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  placeholder="7"
                />
              </label>
            </div>

            <p className="batch-cooking__hint">
              Pour qui ? Ça permet de pré-remplir automatiquement les quantités à cuisiner pour toute la
              durée choisie (une portion par personne et par jour), plutôt que de les saisir à la main pour
              chaque recette.
            </p>
            {profiles.length > 0 && (
              <div className="batch-cooking__slots">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`batch-cooking__slot batch-cooking__slot--profile${
                      selectedProfileIds.has(p.id) ? " batch-cooking__slot--active" : ""
                    }`}
                    style={{ "--profile-color": p.color } as CSSProperties}
                    onClick={() => toggleProfile(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <div className="batch-cooking__headcount">
              <label>
                {profiles.length > 0 ? "ou juste un nombre de personnes :" : "Combien de personnes ?"}
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={manualHeadcount}
                  onChange={(e) => {
                    setManualHeadcount(e.target.value);
                    if (e.target.value) setSelectedProfileIds(new Set());
                  }}
                  placeholder="ex : 4"
                />
              </label>
            </div>

            <div className="batch-cooking__actions">
              <button type="button" className="form-cancel" onClick={onBack}>
                Annuler
              </button>
              <button type="button" className="form-submit" onClick={goToRecipes} disabled={selectedSlots.size === 0}>
                Continuer →
              </button>
            </div>
          </>
        )}

        {step === "recipes" && (
          <>
            <p className="batch-cooking__hint">
              {weekMenuName
                ? `Détecté depuis le menu "${weekMenuName}" (${slotLabels.join(" + ")}) — quantités calculées, ajustables si besoin.`
                : headcount != null
                  ? `Rien de planifié pour ${slotLabels.join(" + ")} cette semaine — quantités par défaut calculées pour ${headcount} personne${headcount > 1 ? "s" : ""} sur ${days} jour${days > 1 ? "s" : ""}, ajustables si besoin.`
                  : `Rien de planifié pour ${slotLabels.join(" + ")} cette semaine — ajoute les recettes à préparer, ou laisse Mamacita choisir.`}
            </p>
            {recipesError && <p className="form-error">{recipesError}</p>}

            {entries.length === 0 && (
              <p className="batch-cooking__empty">
                Aucune recette pour l'instant, ajoutes-en une ci-dessous, ou laisse Mamacita choisir.
              </p>
            )}

            <ul className="batch-cooking__entries">
              {entries.map((entry) => {
                const isExpanded = expandedRecipeId === entry.recipeId;
                const detail = recipeDetails[entry.recipeId];
                return (
                  <li key={entry.recipeId} className="batch-cooking__entry">
                    <div className="batch-cooking__entry-header">
                      <span className="batch-cooking__entry-title">{entry.title}</span>
                      {selectedSlots.size > 1 &&
                        entry.mealSlots.map((slot) => (
                          <span key={slot} className="batch-cooking__entry-slot">
                            {MEAL_SLOTS.find((s) => s.value === slot)?.label ?? slot}
                          </span>
                        ))}
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

                    <div className="batch-cooking__entry-links">
                      <button
                        type="button"
                        className="batch-cooking__entry-toggle"
                        onClick={() => toggleExpand(entry.recipeId)}
                      >
                        {isExpanded ? "▾ Masquer la recette" : "▸ Voir ingrédients & étapes"}
                      </button>
                      <button type="button" className="batch-cooking__entry-toggle" onClick={() => openCookMode(entry.recipeId)}>
                        👩‍🍳 Mode cuisine
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="batch-cooking__entry-detail">
                        {detailLoading[entry.recipeId] && !detail ? (
                          <p className="batch-cooking__hint">Chargement...</p>
                        ) : detail ? (
                          <>
                            <div className="batch-cooking__entry-detail-col">
                              <h4>Ingrédients ({detail.servings} portion(s) de base)</h4>
                              <ul>
                                {detail.ingredients.map((ing) => (
                                  <li key={ing.id}>{formatIngredientLine(ing)}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="batch-cooking__entry-detail-col">
                              <h4>Étapes</h4>
                              <ol>
                                {[...detail.steps]
                                  .sort((a, b) => a.step_number - b.step_number)
                                  .map((s) => (
                                    <li key={s.id}>{s.instruction}</li>
                                  ))}
                              </ol>
                            </div>
                          </>
                        ) : (
                          <p className="form-error">Impossible de charger cette recette.</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {availableToAdd.length > 0 && (
              <div className="batch-cooking__add-row">
                <select
                  value=""
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id) addRecipe(id);
                  }}
                >
                  <option value="">+ Ajouter une recette...</option>
                  {availableToAdd.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
                <button type="button" className="form-cancel" onClick={letAppChoose} disabled={choosingForMe}>
                  {choosingForMe ? "..." : "🎲 Laisser Mamacita choisir"}
                </button>
              </div>
            )}

            <div className="batch-cooking__actions">
              <button type="button" className="form-cancel" onClick={onBack}>
                Annuler
              </button>
              <button type="button" className="form-submit" onClick={goToPlan}>
                Voir le plan optimisé →
              </button>
            </div>
          </>
        )}

        {step === "plan" && (
          <>
            <section className="batch-cooking__optimize-block">
              <div className="batch-cooking__plan-header">
                <h2>🧺 Ingrédients nécessaires</h2>
                <button
                  type="button"
                  className="batch-cooking__refresh"
                  onClick={handlePreviewIngredients}
                  disabled={loadingPreview}
                  aria-label="Recalculer les ingrédients"
                  title="Recalculer"
                >
                  🔄
                </button>
              </div>
              {loadingPreview && <p className="batch-cooking__hint">Calcul...</p>}
              {previewError && <p className="form-error">{previewError}</p>}
              {ingredientPreview && (
                <ul className="batch-cooking__ingredient-list">
                  {ingredientPreview.length === 0 ? (
                    <li className="batch-cooking__empty">
                      Indique une quantité à cuisiner pour voir les ingrédients nécessaires.
                    </li>
                  ) : (
                    ingredientPreview.map((row) => (
                      <li
                        key={row.ingredient_name}
                        className={`batch-cooking__ingredient${row.have_enough ? "" : " batch-cooking__ingredient--missing"}`}
                      >
                        <span aria-hidden="true">{row.have_enough ? "✅" : "⚠️"}</span>
                        <span className="batch-cooking__ingredient-name">{row.ingredient_name}</span>
                        <span className="batch-cooking__ingredient-qty">
                          {row.quantity} {row.unit_abbreviation ?? ""}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              )}
              {ingredientPreview && ingredientPreview.length > 0 && (
                <div className="batch-cooking__ingredient-actions">
                  {batchCost ? (
                    <span className="batch-cooking__batch-cost">
                      💰 ~{batchCost.low === batchCost.high ? `${batchCost.low}` : `${batchCost.low}-${batchCost.high}`}€ au
                      total
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="form-cancel"
                      onClick={handleEstimateBatchCost}
                      disabled={estimatingCost}
                    >
                      {estimatingCost ? "Mamacita calcule..." : "💰 Estimer le coût du batch"}
                    </button>
                  )}
                  {ingredientPreview.some((row) => !row.have_enough) && (
                    <button
                      type="button"
                      className="form-cancel"
                      onClick={handleAddMissingToList}
                      disabled={addingMissingToList}
                    >
                      {addedMissingToList
                        ? "Ajouté !"
                        : addingMissingToList
                          ? "Ajout..."
                          : "🛒 Ajouter les ingrédients manquants à la liste"}
                    </button>
                  )}
                </div>
              )}
              {missingListError && <p className="form-error">{missingListError}</p>}
            </section>

            <section className="batch-cooking__optimize-block">
              <div className="batch-cooking__plan-header">
                <h2>🪄 Plan optimisé Mamacita</h2>
                <button
                  type="button"
                  className="batch-cooking__refresh"
                  onClick={handleGeneratePlan}
                  disabled={loadingPlan}
                  aria-label="Régénérer le plan"
                  title="Régénérer"
                >
                  🔄
                </button>
              </div>
              {loadingPlan && <p className="batch-cooking__hint">Mamacita réfléchit...</p>}
              {planError && <p className="form-error">{planError}</p>}
              {plan && plan.length > 0 && (
                <ol className="batch-cooking__plan">
                  {plan.map((line, i) => (
                    <li key={i}>
                      <label
                        className={`batch-cooking__plan-step${checkedSteps[i] ? " batch-cooking__plan-step--done" : ""}`}
                      >
                        <input type="checkbox" checked={!!checkedSteps[i]} onChange={() => toggleChecked(i)} />
                        <span>{line}</span>
                      </label>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <div className="batch-cooking__actions">
              <button type="button" className="form-cancel" onClick={onBack}>
                Annuler
              </button>
              <button type="button" className="form-submit" onClick={() => setStep("store")}>
                C'est cuisiné → Ranger les restes ✅
              </button>
            </div>
          </>
        )}

        {step === "store" && (
          <>
            {error && <p className="form-error">{error}</p>}

            <ul className="batch-cooking__entries">
              {entries.map((entry) => {
                const totalChunks = entry.chunks.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0);
                const target = Number(entry.totalQuantity) || 0;
                const advice = storageAdvice[entry.title];
                return (
                  <li key={entry.recipeId} className="batch-cooking__entry">
                    <div className="batch-cooking__entry-header">
                      <span className="batch-cooking__entry-title">{entry.title}</span>
                      <span className="batch-cooking__entry-unit">{target || 0} portion(s) à ranger</span>
                    </div>
                    {advice && <p className="batch-cooking__storage-tip">🧊 {advice}</p>}

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
      {cookModeRecipe && <CookMode recipe={cookModeRecipe} onClose={() => setCookModeRecipe(null)} />}
    </div>
  );
}
