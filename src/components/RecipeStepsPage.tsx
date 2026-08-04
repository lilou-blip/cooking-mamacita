import type { Profile, RecipeFull } from "../lib/db";
import { SprigDoodle } from "./SprigDoodle";
import "./BookPage.css";

interface RecipeStepsPageProps {
  recipe: RecipeFull;
  madeCount: number;
  justMade: boolean;
  showMadeForm: boolean;
  profiles: Profile[];
  selectedMadeProfiles: Set<number>;
  onMarkMadeClick: () => void;
  onToggleMadeProfile: (id: number) => void;
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
  onMarkMadeClick,
  onToggleMadeProfile,
  onConfirmMade,
  onCancelMadeForm,
}: RecipeStepsPageProps) {
  return (
    <>
      <h2 className="book-page__steps-title">Préparation</h2>

      <ol className="book-page__steps">
        {recipe.steps.map((step) => (
          <li key={step.id} className="step-card">
            <span className="step-card__number">{step.step_number}</span>
            <p>{step.instruction}</p>
          </li>
        ))}
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
    </>
  );
}
