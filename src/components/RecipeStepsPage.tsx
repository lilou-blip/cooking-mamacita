import { useState } from "react";
import type { Profile, RecipeFull, StorageUnit } from "../lib/db";
import { extractDurationSeconds } from "../lib/stepTimer";
import { CookMode } from "./CookMode";
import { SprigDoodle } from "./SprigDoodle";
import { StepTimer } from "./StepTimer";
import "./BookPage.css";

interface RecipeStepsPageProps {
  recipe: RecipeFull;
  madeCount: number;
  justMade: boolean;
  showMadeForm: boolean;
  profiles: Profile[];
  selectedMadeProfiles: Set<number>;
  storageUnits: StorageUnit[];
  leftoverPortions: string;
  leftoverStorageUnitId: number | "";
  onMarkMadeClick: () => void;
  onToggleMadeProfile: (id: number) => void;
  onLeftoverPortionsChange: (value: string) => void;
  onLeftoverStorageUnitIdChange: (value: number | "") => void;
  onConfirmMade: () => void;
  onCancelMadeForm: () => void;
}

export function RecipeStepsPage({
  recipe,
  madeCount,
  justMade,
  showMadeForm,
  profiles,
  selectedMadeProfiles,
  storageUnits,
  leftoverPortions,
  leftoverStorageUnitId,
  onMarkMadeClick,
  onToggleMadeProfile,
  onLeftoverPortionsChange,
  onLeftoverStorageUnitIdChange,
  onConfirmMade,
  onCancelMadeForm,
}: RecipeStepsPageProps) {
  const [cookModeOpen, setCookModeOpen] = useState(false);

  return (
    <>
      <div className="book-page__steps-header">
        <h2 className="book-page__steps-title">Préparation</h2>
        <button type="button" className="book-page__cook-mode-btn" onClick={() => setCookModeOpen(true)}>
          👩‍🍳 Mode cuisine
        </button>
      </div>

      <ol className="book-page__steps">
        {recipe.steps.map((step) => {
          const duration = extractDurationSeconds(step.instruction);
          return (
            <li key={step.id} className="step-card">
              <span className="step-card__number">{step.step_number}</span>
              <div>
                <p>{step.instruction}</p>
                {duration != null && (
                  <StepTimer
                    id={`step-${recipe.id}-${step.id}`}
                    label={`${recipe.title} — étape ${step.step_number}`}
                    seconds={duration}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {recipe.notes && (
        <div className="book-page__notes">
          <h3>Notes</h3>
          <p>{recipe.notes}</p>
        </div>
      )}

      <div className="book-page__made">
        <span className="book-page__made-count">{madeCount > 0 ? `Faite ${madeCount} fois` : "Jamais faite"}</span>
        <button type="button" className="book-nav__action book-nav__action--made" onClick={onMarkMadeClick}>
          {justMade ? "✓ Fait !" : "J'ai fait cette recette"}
        </button>
      </div>

      {showMadeForm && (
        <div className="made-picker">
          {profiles.length > 0 && (
            <>
              <span className="made-picker__label">Qui a mangé ça ?</span>
              <div className="made-picker__profiles">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`tag-toggle${selectedMadeProfiles.has(p.id) ? " tag-toggle--active" : ""}`}
                    onClick={() => onToggleMadeProfile(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          )}

          <span className="made-picker__label">Il te reste des portions ? 🍲</span>
          <div className="made-picker__leftovers">
            <input
              type="number"
              min="0"
              step="0.5"
              placeholder="0"
              value={leftoverPortions}
              onChange={(e) => onLeftoverPortionsChange(e.target.value)}
              aria-label="Portions de restes"
            />
            <span className="made-picker__leftovers-unit">portion(s)</span>
            <select
              value={leftoverStorageUnitId}
              onChange={(e) => onLeftoverStorageUnitIdChange(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Emplacement</option>
              {storageUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="made-picker__actions">
            <button type="button" className="form-cancel" onClick={onCancelMadeForm}>
              Annuler
            </button>
            <button type="button" className="form-submit" onClick={onConfirmMade}>
              Valider
            </button>
          </div>
        </div>
      )}

      <SprigDoodle className="book-page__doodle book-page__doodle--br" flip />

      {cookModeOpen && <CookMode recipe={recipe} onClose={() => setCookModeOpen(false)} />}
    </>
  );
}
