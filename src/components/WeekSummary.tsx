import type { MenuFull } from "../lib/db";
import "./WeekSummary.css";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

interface WeekSummaryProps {
  menu: MenuFull | null;
  onOpen: (id: number) => void;
  onCreate: () => void;
}

export function WeekSummary({ menu, onOpen, onCreate }: WeekSummaryProps) {
  if (!menu) {
    return (
      <div className="week-summary week-summary--empty">
        <h2>Cette semaine</h2>
        <p>Pas encore de menu pour cette semaine.</p>
        <button type="button" className="form-submit" onClick={onCreate}>
          Planifier la semaine
        </button>
      </div>
    );
  }

  const byDay = DAYS.map((label, day) => ({
    label,
    entries: menu.recipes.filter((r) => r.day_of_week === day),
  })).filter((d) => d.entries.length > 0);

  return (
    <div className="week-summary">
      <div className="week-summary__header">
        <h2>Cette semaine : {menu.name}</h2>
        <button type="button" className="week-summary__open" onClick={() => onOpen(menu.id)}>
          Voir le menu →
        </button>
      </div>
      {byDay.length === 0 ? (
        <p className="week-summary__empty">Rien de prévu pour l'instant — clique pour planifier.</p>
      ) : (
        <ul className="week-summary__days">
          {byDay.map((d) => (
            <li key={d.label}>
              <span className="week-summary__day-label">{d.label}</span>
              <span className="week-summary__day-recipes">{d.entries.map((e) => e.title).join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
