import { Fragment, useState } from "react";
import { addRecipeToMenu, type MealSlot, type MenuFull, type MenuRecipeRow, type Recipe } from "../lib/db";
import "./WeeklyMenuGrid.css";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: "petit_dejeuner", label: "Petit-déj" },
  { value: "dejeuner", label: "Déjeuner" },
  { value: "gouter", label: "Goûter" },
  { value: "diner", label: "Dîner" },
];

interface WeeklyMenuGridProps {
  menu: MenuFull;
  allRecipes: Recipe[];
  onToggleMade: (menuRecipeId: number, recipeId: number, servings: number, made: boolean) => void;
  onRemove: (menuRecipeId: number) => void;
  onAdded: () => void;
}

export function WeeklyMenuGrid({ menu, allRecipes, onToggleMade, onRemove, onAdded }: WeeklyMenuGridProps) {
  const [cell, setCell] = useState<{ day: number; slot: MealSlot } | null>(null);
  const [recipeId, setRecipeId] = useState("");
  const [servings, setServings] = useState("4");
  // La grille 7 jours × repas suppose un écran large ; sur mobile (CSS ci-dessous) on n'affiche qu'un jour
  // à la fois, choisi via ces onglets — le reste du balisage/des données ne change pas.
  const [mobileDay, setMobileDay] = useState(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);

  function cellEntry(day: number, slot: MealSlot): MenuRecipeRow | undefined {
    return menu.recipes.find((r) => r.day_of_week === day && r.meal_slot === slot);
  }

  function openCell(day: number, slot: MealSlot) {
    setCell({ day, slot });
    setRecipeId("");
    setServings("4");
  }

  async function confirmCell() {
    if (!cell || !recipeId) return;
    await addRecipeToMenu(menu.id, Number(recipeId), Number(servings) || 4, cell.day, cell.slot);
    setCell(null);
    onAdded();
  }

  return (
    <div className="weekly-grid-scroll">
      <div className="weekly-grid__day-tabs">
        {DAYS.map((day, i) => (
          <button
            key={day}
            type="button"
            className={`weekly-grid__day-tab${i === mobileDay ? " weekly-grid__day-tab--active" : ""}`}
            onClick={() => setMobileDay(i)}
          >
            {day.slice(0, 3)}
          </button>
        ))}
      </div>

      <div className="weekly-grid">
        <div className="weekly-grid__corner" />
        {DAYS.map((day, i) => (
          <div key={day} className={`weekly-grid__day-label${i === mobileDay ? " weekly-grid__col--active" : ""}`}>
            {day}
          </div>
        ))}

        {MEAL_SLOTS.map((slot) => (
          <Fragment key={slot.value}>
            <div className="weekly-grid__slot-label">{slot.label}</div>
            {DAYS.map((_, day) => {
              const entry = cellEntry(day, slot.value);
              const isActive = cell?.day === day && cell?.slot === slot.value;
              return (
                <div
                  key={`${slot.value}-${day}`}
                  className={`weekly-grid__cell${day === mobileDay ? " weekly-grid__col--active" : ""}`}
                >
                  {!isActive &&
                    (entry ? (
                      <div className={`weekly-grid__entry${entry.made ? " weekly-grid__entry--made" : ""}`}>
                        <span>{entry.title}</span>
                        <div className="weekly-grid__entry-actions">
                          <input
                            type="checkbox"
                            checked={entry.made}
                            onChange={(e) =>
                              onToggleMade(entry.menu_recipe_id, entry.recipe_id, entry.servings, e.target.checked)
                            }
                            aria-label="Fait"
                          />
                          <button type="button" onClick={() => onRemove(entry.menu_recipe_id)} aria-label="Retirer">
                            ×
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="weekly-grid__add" onClick={() => openCell(day, slot.value)}>
                        +
                      </button>
                    ))}

                  {isActive && (
                    <div className="weekly-grid__picker">
                      <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} autoFocus>
                        <option value="">Recette...</option>
                        {allRecipes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        className="weekly-grid__servings"
                        value={servings}
                        onChange={(e) => setServings(e.target.value)}
                        placeholder="Portions"
                      />
                      <div className="weekly-grid__picker-actions">
                        <button type="button" className="form-cancel" onClick={() => setCell(null)}>
                          Annuler
                        </button>
                        <button type="button" className="form-submit" onClick={confirmCell} disabled={!recipeId}>
                          OK
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
