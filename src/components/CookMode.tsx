import { useEffect, useRef, useState, type TouchEvent } from "react";
import type { RecipeFull } from "../lib/db";
import { extractDurationSeconds } from "../lib/stepTimer";
import { matchIngredientsInStep } from "../lib/stepIngredients";
import { useWakeLock } from "../lib/useWakeLock";
import { StepTimer } from "./StepTimer";
import "./CookMode.css";

interface CookModeProps {
  recipe: RecipeFull;
  onClose: () => void;
}

function formatQty(quantity: number | null, unit: string | null): string {
  if (quantity == null) return "";
  const qty = Math.round(quantity * 100) / 100;
  return unit ? `${qty} ${unit} ` : `${qty} `;
}

/** Assistant plein écran pour cuisiner pas-à-pas : une étape à la fois en très gros, écran qui ne s'éteint
 * pas, rappel des ingrédients concernés, lecture vocale et minuteur — pensé pour être utilisable mains
 * sales/mouillées, accessible depuis le carnet, le batch cooking et une recette anti-gaspi (une fois
 * enregistrée, elle passe par la même fiche recette que les autres). */
export function CookMode({ recipe, onClose }: CookModeProps) {
  const steps = [...recipe.steps].sort((a, b) => a.step_number - b.step_number);
  const [index, setIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useWakeLock(true);

  const step = steps[index];
  const duration = step ? extractDurationSeconds(step.instruction) : null;
  const matchedIngredients = step ? matchIngredientsInStep(step.instruction, recipe.ingredients) : [];

  function stopSpeaking() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  function toggleSpeak() {
    if (!("speechSynthesis" in window) || !step) return;
    if (speaking) {
      stopSpeaking();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(step.instruction);
    utterance.lang = "fr-FR";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  function goNext() {
    stopSpeaking();
    setIndex((i) => Math.min(steps.length - 1, i + 1));
  }
  function goPrev() {
    stopSpeaking();
    setIndex((i) => Math.max(0, i - 1));
  }
  function close() {
    stopSpeaking();
    onClose();
  }

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, steps.length]);

  function onTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: TouchEvent) {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 60) {
      if (dx < 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  }

  if (!step) {
    return (
      <div className="cook-mode">
        <button type="button" className="cook-mode__close" onClick={close} aria-label="Fermer le mode cuisine">
          ×
        </button>
        <p className="cook-mode__empty">Cette recette n'a pas d'étapes renseignées.</p>
      </div>
    );
  }

  const progressPct = ((index + 1) / steps.length) * 100;

  return (
    <div className="cook-mode" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="cook-mode__header">
        <span className="cook-mode__title">{recipe.title}</span>
        <button type="button" className="cook-mode__close" onClick={close} aria-label="Fermer le mode cuisine">
          ×
        </button>
      </div>

      <div className="cook-mode__progress-track">
        <div className="cook-mode__progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <span className="cook-mode__progress-label">
        Étape {index + 1} / {steps.length}
      </span>

      <div className="cook-mode__body">
        <p className="cook-mode__instruction">{step.instruction}</p>

        {matchedIngredients.length > 0 && (
          <div className="cook-mode__ingredients">
            <span className="cook-mode__ingredients-label">Pour cette étape :</span>
            <ul>
              {matchedIngredients.map((ing) => (
                <li key={ing.id}>
                  {formatQty(ing.quantity, ing.unit_abbreviation)}
                  {ing.ingredient_name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="cook-mode__tools">
          <button type="button" className="cook-mode__speak" onClick={toggleSpeak}>
            {speaking ? "⏹ Arrêter la lecture" : "🔊 Lire l'étape"}
          </button>
          {duration != null && (
            <StepTimer id={`step-${recipe.id}-${step.id}`} label={`${recipe.title} — étape ${step.step_number}`} seconds={duration} />
          )}
        </div>
      </div>

      <div className="cook-mode__nav">
        <button type="button" className="cook-mode__nav-btn" onClick={goPrev} disabled={index === 0}>
          ‹ Précédent
        </button>
        {index === steps.length - 1 ? (
          <button type="button" className="cook-mode__nav-btn cook-mode__nav-btn--done" onClick={close}>
            C'est prêt ! ✓
          </button>
        ) : (
          <button type="button" className="cook-mode__nav-btn cook-mode__nav-btn--next" onClick={goNext}>
            Suivant ›
          </button>
        )}
      </div>
    </div>
  );
}
