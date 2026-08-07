import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRecipe, listAllTags, listUnits, updateRecipe, type RecipeFull, type Tag, type Unit } from "../lib/db";
import { INGREDIENT_CATEGORIES, TAG_CATEGORY_LABELS, TAG_CATEGORY_ORDER } from "../lib/constants";
import type { RecipeDraft } from "../lib/assistant";
import { IngredientAutocomplete } from "./IngredientAutocomplete";
import "./RecipeForm.css";

interface IngredientRow {
  id: number;
  name: string;
  quantity: string;
  unit_abbreviation: string;
  category: string;
}

interface StepRow {
  id: number;
  value: string;
}

let nextRowId = 0;

const emptyIngredient = (): IngredientRow => ({
  id: nextRowId++,
  name: "",
  quantity: "",
  unit_abbreviation: "",
  category: "autre",
});

const emptyStep = (value = ""): StepRow => ({ id: nextRowId++, value });

interface RecipeFormProps {
  recipe?: RecipeFull;
  draft?: RecipeDraft;
  onCreated: (id: number) => void;
  onCancel: () => void;
}

export function RecipeForm({ recipe, draft, onCreated, onCancel }: RecipeFormProps) {
  const isEditing = recipe != null;
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(
    () => new Set(recipe?.tags.map((t) => t.id) ?? []),
  );

  const [title, setTitle] = useState(recipe?.title ?? draft?.title ?? "");
  const [servings, setServings] = useState(String(recipe?.servings ?? draft?.servings ?? 4));
  const initialPrepTime = recipe?.prep_time_minutes ?? draft?.prep_time_minutes;
  const [prepTime, setPrepTime] = useState(initialPrepTime != null ? String(initialPrepTime) : "");
  const initialCookTime = recipe?.cook_time_minutes ?? draft?.cook_time_minutes;
  const [cookTime, setCookTime] = useState(initialCookTime != null ? String(initialCookTime) : "");
  const [source, setSource] = useState(recipe?.source ?? "");
  const [notes, setNotes] = useState(recipe?.notes ?? draft?.notes ?? "");
  const [ingredients, setIngredients] = useState<IngredientRow[]>(() => {
    if (recipe) {
      return recipe.ingredients.map((ing) => ({
        id: nextRowId++,
        name: ing.ingredient_name,
        quantity: ing.quantity != null ? String(ing.quantity) : "",
        unit_abbreviation: ing.unit_abbreviation ?? "",
        category: "autre",
      }));
    }
    if (draft) {
      return draft.ingredients.map((ing) => ({
        id: nextRowId++,
        name: ing.name,
        quantity: ing.quantity != null ? String(ing.quantity) : "",
        unit_abbreviation: ing.unit_abbreviation ?? "",
        category: ing.category,
      }));
    }
    return [emptyIngredient()];
  });
  const [steps, setSteps] = useState<StepRow[]>(
    () => recipe?.steps.map((s) => emptyStep(s.instruction)) ?? draft?.steps.map((s) => emptyStep(s)) ?? [emptyStep()],
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    (async () => {
      const [tags, unitList] = await Promise.all([listAllTags(), listUnits()]);
      setAllTags(tags);
      setUnits(unitList);

      if (draft) {
        const ids = tags
          .filter((t) => draft.tags.some((dt) => dt.category === t.category && dt.name === t.name))
          .map((t) => t.id);
        setSelectedTagIds(new Set(ids));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleTag(id: number) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateIngredient(index: number, patch: Partial<IngredientRow>) {
    setIngredients((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeIngredient(index: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  function updateStep(index: number, value: string) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, value } : s)));
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const tagsPayload = allTags
        .filter((t) => selectedTagIds.has(t.id))
        .map((t) => ({ category: t.category, name: t.name }));

      const ingredientsPayload = ingredients
        .filter((i) => i.name.trim())
        .map((i) => ({
          name: i.name.trim(),
          category: i.category,
          quantity: i.quantity.trim() ? Number(i.quantity) : null,
          unit_abbreviation: i.unit_abbreviation || null,
        }));

      const stepsPayload = steps.map((s) => s.value.trim()).filter(Boolean);

      const payload = {
        title: title.trim(),
        servings: Number(servings) || 4,
        prep_time_minutes: prepTime.trim() ? Number(prepTime) : null,
        cook_time_minutes: cookTime.trim() ? Number(cookTime) : null,
        notes: notes.trim() || null,
        source: source.trim() || null,
        tags: tagsPayload,
        ingredients: ingredientsPayload,
        steps: stepsPayload,
      };

      if (isEditing) {
        await updateRecipe(recipe.id, payload);
        onCreated(recipe.id);
      } else {
        const id = await createRecipe(payload);
        onCreated(id);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form className="recipe-form" onSubmit={handleSubmit}>
      <header className="recipe-form__header">
        <h1>{isEditing ? "Modifier la recette" : "Nouvelle recette"}</h1>
        <button type="button" className="form-cancel" onClick={onCancel}>
          Annuler
        </button>
      </header>

      {error && <p className="form-error">{error}</p>}

      <section className="recipe-form__section">
        <label className="field">
          <span>Titre</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Tarte aux fraises" />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Portions</span>
            <input type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} />
          </label>
          <label className="field">
            <span>Prépa (min)</span>
            <input type="number" min="0" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} />
          </label>
          <label className="field">
            <span>Cuisson (min)</span>
            <input type="number" min="0" value={cookTime} onChange={(e) => setCookTime(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span>Source (optionnel)</span>
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Personnelle, un site..." />
        </label>
      </section>

      <section className="recipe-form__section">
        <h2>Tags</h2>
        {TAG_CATEGORY_ORDER.map((category) => {
          const tagsInCategory = allTags.filter((t) => t.category === category);
          if (tagsInCategory.length === 0) return null;
          return (
            <div key={category} className="tag-group">
              <span className="tag-group__label">{TAG_CATEGORY_LABELS[category]}</span>
              <div className="tag-group__options">
                {tagsInCategory.map((tag) => (
                  <button
                    type="button"
                    key={tag.id}
                    className={`tag-toggle${selectedTagIds.has(tag.id) ? " tag-toggle--active" : ""}`}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="recipe-form__section">
        <h2>Ingrédients</h2>
        {ingredients.map((row, i) => (
          <div className="ingredient-row" key={row.id}>
            <input
              className="ingredient-row__quantity"
              placeholder="Qté"
              value={row.quantity}
              onChange={(e) => updateIngredient(i, { quantity: e.target.value })}
              aria-label={`Quantité (ingrédient ${i + 1})`}
            />
            <select
              className="ingredient-row__unit"
              value={row.unit_abbreviation}
              onChange={(e) => updateIngredient(i, { unit_abbreviation: e.target.value })}
              aria-label={`Unité (ingrédient ${i + 1})`}
            >
              <option value="">unité</option>
              {units.map((u) => (
                <option key={u.id} value={u.abbreviation}>
                  {u.abbreviation}
                </option>
              ))}
            </select>
            <IngredientAutocomplete
              className="ingredient-row__name"
              placeholder="Nom de l'ingrédient"
              value={row.name}
              onChange={(name) => updateIngredient(i, { name })}
              onSelectKnown={(ing) => updateIngredient(i, { name: ing.name, category: ing.category })}
            />
            <select
              className="ingredient-row__category"
              value={row.category}
              onChange={(e) => updateIngredient(i, { category: e.target.value })}
              aria-label={`Catégorie (ingrédient ${i + 1})`}
            >
              {INGREDIENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <button type="button" className="row-remove" onClick={() => removeIngredient(i)} aria-label="Supprimer">
              ×
            </button>
          </div>
        ))}
        <button type="button" className="add-row" onClick={() => setIngredients((prev) => [...prev, emptyIngredient()])}>
          + Ajouter un ingrédient
        </button>
      </section>

      <section className="recipe-form__section">
        <h2>Étapes</h2>
        {steps.map((step, i) => (
          <div className="step-row" key={step.id}>
            <span className="step-row__number">{i + 1}</span>
            <textarea
              value={step.value}
              onChange={(e) => updateStep(i, e.target.value)}
              placeholder="Décrivez l'étape..."
              rows={2}
            />
            <button type="button" className="row-remove" onClick={() => removeStep(i)} aria-label="Supprimer">
              ×
            </button>
          </div>
        ))}
        <button type="button" className="add-row" onClick={() => setSteps((prev) => [...prev, emptyStep()])}>
          + Ajouter une étape
        </button>
      </section>

      <section className="recipe-form__section">
        <label className="field">
          <span>Notes personnelles (optionnel)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>
      </section>

      <button type="submit" className="form-submit" disabled={saving}>
        {saving ? "Enregistrement..." : isEditing ? "Enregistrer les modifications" : "Enregistrer la recette"}
      </button>
    </form>
  );
}
