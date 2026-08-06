import { getIngredientIllustration } from "../lib/ingredientIllustrations";
import type { PantryItem, Profile } from "../lib/db";
import "./PantryShelfItem.css";

function formatQuantity(item: PantryItem): string {
  if (!item.unit_abbreviation || item.unit_abbreviation === "pièce") return `${item.quantity}`;
  return `${item.quantity} ${item.unit_abbreviation}`;
}

type ExpiryStatus = "expired" | "soon" | "ok" | "none";

function expiryStatus(expiresAt: string | null): ExpiryStatus {
  if (!expiresAt) return "none";
  const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "expired";
  if (days <= 3) return "soon";
  return "ok";
}

interface PantryShelfItemProps {
  item: PantryItem;
  profiles: Profile[];
  showLocation?: boolean;
  expanded: boolean;
  onToggle: () => void;
  consumeValue: string;
  onConsumeValueChange: (value: string) => void;
  consumeProfileId: string;
  onConsumeProfileChange: (value: string) => void;
  onConfirmConsume: () => void;
  onDelete: () => void;
  onAdjust: (delta: number) => void;
}

export function PantryShelfItem({
  item,
  profiles,
  showLocation,
  expanded,
  onToggle,
  consumeValue,
  onConsumeValueChange,
  consumeProfileId,
  onConsumeProfileChange,
  onConfirmConsume,
  onDelete,
  onAdjust,
}: PantryShelfItemProps) {
  const src = getIngredientIllustration(item.ingredient_name);
  const status = expiryStatus(item.expires_at);

  return (
    <div className={`pantry-shelf-item pantry-shelf-item--${status}${expanded ? " pantry-shelf-item--expanded" : ""}`}>
      <button
        type="button"
        className="pantry-shelf-item__token"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <span className="pantry-shelf-item__icon">
          {src ? (
            <img src={src} alt="" />
          ) : (
            <span className="pantry-shelf-item__initial">{item.ingredient_name.trim().charAt(0).toUpperCase()}</span>
          )}
        </span>
        <span className="pantry-shelf-item__adjust">
          <span
            role="button"
            tabIndex={0}
            className="pantry-shelf-item__adjust-btn"
            onClick={(e) => {
              e.stopPropagation();
              onAdjust(-1);
            }}
            aria-label="Retirer 1"
          >
            −
          </span>
          <span className="pantry-shelf-item__quantity">{formatQuantity(item)}</span>
          <span
            role="button"
            tabIndex={0}
            className="pantry-shelf-item__adjust-btn"
            onClick={(e) => {
              e.stopPropagation();
              onAdjust(1);
            }}
            aria-label="Ajouter 1"
          >
            +
          </span>
        </span>
        <span className="pantry-shelf-item__name">{item.ingredient_name}</span>
        {showLocation && item.storage_unit_name && (
          <span className="pantry-shelf-item__location">{item.storage_unit_name}</span>
        )}
      </button>

      {expanded && (
        <div className="pantry-shelf-item__panel" onClick={(e) => e.stopPropagation()}>
          {item.expires_at && (
            <span className={`pantry-shelf-item__expiry pantry-shelf-item__expiry--${status}`}>
              {status === "expired" ? "Périmé le " : "À consommer avant le "}
              {new Date(item.expires_at).toLocaleDateString("fr-FR")}
            </span>
          )}
          <div className="pantry-shelf-item__consume-form">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Qté consommée"
              value={consumeValue}
              onChange={(e) => onConsumeValueChange(e.target.value)}
              autoFocus
            />
            <select value={consumeProfileId} onChange={(e) => onConsumeProfileChange(e.target.value)}>
              <option value="">Qui ?</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => onConsumeValueChange(String(item.quantity))}>
              Tout
            </button>
            <button type="button" className="form-submit" onClick={onConfirmConsume}>
              OK
            </button>
          </div>
          <button type="button" className="pantry-shelf-item__delete" onClick={onDelete}>
            Retirer du garde-manger
          </button>
        </div>
      )}
    </div>
  );
}
