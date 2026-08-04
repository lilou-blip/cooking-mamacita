import { useState, type FormEvent } from "react";
import { listStorageIllustrations } from "../lib/storageIllustrations";
import "./StorageUnitForm.css";

interface StorageUnitFormProps {
  onCreated: (input: { name: string; illustration: string | null }) => void;
  onCancel: () => void;
}

export function StorageUnitForm({ onCreated, onCancel }: StorageUnitFormProps) {
  const [name, setName] = useState("");
  const [illustration, setIllustration] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = listStorageIllustrations();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Donne un nom à ce meuble.");
      return;
    }
    onCreated({ name: name.trim(), illustration });
  }

  return (
    <form className="storage-unit-form" onSubmit={handleSubmit}>
      <h2 className="storage-unit-form__title">Nouveau meuble</h2>
      {error && <p className="form-error">{error}</p>}

      <label className="field">
        <span>Nom</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Étagère, Cave à vin..."
          autoFocus
        />
      </label>

      <span className="storage-unit-form__illustration-label">Illustration (optionnel)</span>
      {options.length === 0 ? (
        <p className="storage-unit-form__no-illustration">
          Aucune illustration disponible pour l'instant — le meuble s'affichera sous forme de bloc avec son nom.
        </p>
      ) : (
        <div className="storage-unit-form__illustrations">
          <button
            type="button"
            className={`storage-unit-form__illustration${illustration === null ? " storage-unit-form__illustration--selected" : ""}`}
            onClick={() => setIllustration(null)}
          >
            Aucune
          </button>
          {options.map((opt) => (
            <button
              type="button"
              key={opt.slug}
              className={`storage-unit-form__illustration${illustration === opt.slug ? " storage-unit-form__illustration--selected" : ""}`}
              onClick={() => setIllustration(opt.slug)}
            >
              <img src={opt.url} alt={opt.slug} />
            </button>
          ))}
        </div>
      )}

      <div className="storage-unit-form__actions">
        <button type="button" className="form-cancel" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="form-submit">
          Ajouter
        </button>
      </div>
    </form>
  );
}
