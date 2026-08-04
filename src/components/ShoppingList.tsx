import { useCallback, useEffect, useState } from "react";
import { getShoppingListById, updateShoppingListItem, type ShoppingListFull } from "../lib/db";
import { estimatePriceRange } from "../lib/ollama";
import "./ShoppingList.css";

interface ShoppingListProps {
  id: number;
  onBack: () => void;
}

export function ShoppingList({ id, onBack }: ShoppingListProps) {
  const [list, setList] = useState<ShoppingListFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [estimatingId, setEstimatingId] = useState<number | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setList(await getShoppingListById(id));
  }, [id]);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  async function toggleChecked(itemId: number, checked: boolean) {
    await updateShoppingListItem(itemId, { checked });
    await refresh();
  }

  async function setPrice(itemId: number, value: string) {
    const price = value.trim() ? Number(value) : null;
    await updateShoppingListItem(itemId, { price, priceIsEstimate: false });
    await refresh();
  }

  async function handleEstimate(itemId: number, name: string, quantity: number | null, unit: string | null) {
    setEstimatingId(itemId);
    setEstimateError(null);
    try {
      const range = await estimatePriceRange(name, quantity, unit);
      const midpoint = Math.round(((range.low + range.high) / 2) * 100) / 100;
      await updateShoppingListItem(itemId, { price: midpoint, priceIsEstimate: true });
      await refresh();
    } catch (err) {
      setEstimateError(String(err));
    } finally {
      setEstimatingId(null);
    }
  }

  if (loading || !list) return <p className="status-text">Chargement de la liste...</p>;

  const total = list.items.reduce((sum, item) => sum + (item.price ?? 0), 0);
  const missingPriceCount = list.items.filter((i) => i.price == null).length;

  return (
    <div className="shopping-list">
      <button className="book-nav__back" onClick={onBack}>
        ← Menu
      </button>
      <h1>{list.name}</h1>

      {estimateError && <p className="form-error">{estimateError}</p>}

      {list.items.length === 0 ? (
        <p className="pantry__empty">Tout est déjà dans le garde-manger, rien à acheter !</p>
      ) : (
        <ul className="shopping-list__items">
          {list.items.map((item) => (
            <li
              key={item.id}
              className={`shopping-list__item${item.checked ? " shopping-list__item--checked" : ""}`}
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) => toggleChecked(item.id, e.target.checked)}
              />
              <span className="shopping-list__qty">
                {item.quantity != null
                  ? `${Math.round(item.quantity * 100) / 100}${item.unit_abbreviation ? " " + item.unit_abbreviation : ""}`
                  : ""}
              </span>
              <span className="shopping-list__name">{item.ingredient_name}</span>
              {item.price == null && (
                <button
                  type="button"
                  className="shopping-list__estimate"
                  onClick={() => handleEstimate(item.id, item.ingredient_name, item.quantity, item.unit_abbreviation)}
                  disabled={estimatingId === item.id}
                >
                  {estimatingId === item.id ? "..." : "💡 Estimer"}
                </button>
              )}
              {item.price_is_estimate && <span className="shopping-list__estimate-badge">estimé</span>}
              <input
                key={`${item.id}-${item.price ?? "empty"}`}
                className="shopping-list__price"
                type="number"
                min="0"
                step="0.01"
                placeholder="€"
                defaultValue={item.price ?? ""}
                onBlur={(e) => setPrice(item.id, e.target.value)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="shopping-list__total">
        <span>Total estimé</span>
        <strong>{total.toFixed(2)} €</strong>
        {missingPriceCount > 0 && (
          <span className="shopping-list__missing">{missingPriceCount} prix manquant(s)</span>
        )}
      </div>
    </div>
  );
}
