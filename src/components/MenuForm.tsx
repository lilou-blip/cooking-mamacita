import { useState, type FormEvent } from "react";
import { createMenu, type MenuType } from "../lib/db";
import "./MenuForm.css";

interface MenuFormProps {
  onCreated: () => void;
  onCancel: () => void;
  initialType?: MenuType;
}

export function MenuForm({ onCreated, onCancel, initialType = "evenement" }: MenuFormProps) {
  const [name, setName] = useState("");
  const [menuType, setMenuType] = useState<MenuType>(initialType);
  const [eventDate, setEventDate] = useState("");
  const [servingsTarget, setServingsTarget] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function defaultWeeklyName(): string {
    const date = eventDate ? new Date(eventDate) : new Date();
    return `Semaine du ${date.toLocaleDateString("fr-FR")}`;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() && menuType !== "semaine") {
      setError("Le nom du menu est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createMenu({
        name: name.trim() || defaultWeeklyName(),
        menu_type: menuType,
        event_date: eventDate || null,
        servings_target: servingsTarget.trim() ? Number(servingsTarget) : null,
        notes: notes.trim() || null,
      });
      onCreated();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="menu-form" onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}
      <div className="menu-form__row">
        <input
          placeholder={menuType === "semaine" ? "Nom (optionnel)" : "Nom du menu (ex: Barbecue vendredi)"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select value={menuType} onChange={(e) => setMenuType(e.target.value as MenuType)}>
          <option value="evenement">Événement</option>
          <option value="semaine">Semaine</option>
        </select>
        <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        <input
          type="number"
          min="1"
          placeholder="Personnes"
          value={servingsTarget}
          onChange={(e) => setServingsTarget(e.target.value)}
        />
      </div>
      <textarea placeholder="Notes (optionnel)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      <div className="menu-form__actions">
        <button type="button" className="form-cancel" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="form-submit" disabled={saving}>
          {saving ? "Création..." : "Créer le menu"}
        </button>
      </div>
    </form>
  );
}
