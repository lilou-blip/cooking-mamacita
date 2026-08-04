import { useEffect, useState, type FormEvent } from "react";
import { createPantryItem, listUnits, type Profile, type StorageUnit, type Unit } from "../lib/db";
import { INGREDIENT_CATEGORIES } from "../lib/constants";
import { IngredientAutocomplete } from "./IngredientAutocomplete";
import "./PantryForm.css";

interface PantryFormProps {
  profiles: Profile[];
  storageUnits: StorageUnit[];
  initialUnitId?: number | null;
  onCreated: () => void;
  onCancel: () => void;
}

export function PantryForm({ profiles, storageUnits, initialUnitId, onCreated, onCancel }: PantryFormProps) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("autre");
  const [quantity, setQuantity] = useState("");
  const [unitAbbr, setUnitAbbr] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [storageUnitId, setStorageUnitId] = useState<number | "">(initialUnitId ?? "");
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUnits().then(setUnits);
  }, []);

  const totalQuantity = Number(quantity) || 0;
  const assignedTotal = Object.values(assignments).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const unassigned = totalQuantity - assignedTotal;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || totalQuantity <= 0) {
      setError("Renseigne au moins un nom d'ingrédient et une quantité.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPantryItem({
        ingredient_name: name.trim(),
        ingredient_category: category,
        quantity: totalQuantity,
        unit_abbreviation: unitAbbr || null,
        expires_at: expiresAt || null,
        storage_unit_id: storageUnitId || null,
        assignments: Object.entries(assignments)
          .map(([profileId, value]) => ({ profile_id: Number(profileId), quantity: Number(value) || 0 }))
          .filter((a) => a.quantity > 0),
      });
      onCreated();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="pantry-form" onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="pantry-form__row">
        <IngredientAutocomplete
          className="pantry-form__name"
          placeholder="Ingrédient (ex: oeufs)"
          value={name}
          onChange={setName}
          onSelectKnown={(ing) => {
            setName(ing.name);
            setCategory(ing.category);
          }}
        />
        <input
          className="pantry-form__quantity"
          placeholder="Qté"
          type="number"
          min="0"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <select value={unitAbbr} onChange={(e) => setUnitAbbr(e.target.value)}>
          <option value="">unité</option>
          {units.map((u) => (
            <option key={u.id} value={u.abbreviation}>
              {u.abbreviation}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {INGREDIENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <label className="pantry-form__expiry">
          <span>Péremption</span>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
        <select value={storageUnitId} onChange={(e) => setStorageUnitId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Emplacement</option>
          {storageUnits.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {profiles.length > 0 && (
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
                  value={assignments[p.id] ?? ""}
                  onChange={(e) => setAssignments((prev) => ({ ...prev, [p.id]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          {totalQuantity > 0 && (
            <span className="pantry-form__unassigned">
              {unassigned > 0 ? `${unassigned} non attribué(s)` : unassigned < 0 ? "Répartition dépasse le total" : "Tout est attribué"}
            </span>
          )}
        </div>
      )}

      <div className="pantry-form__actions">
        <button type="button" className="form-cancel" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="form-submit" disabled={saving}>
          {saving ? "Ajout..." : "Ajouter au garde-manger"}
        </button>
      </div>
    </form>
  );
}
