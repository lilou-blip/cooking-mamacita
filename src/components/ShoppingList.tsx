import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  addShoppingListItem,
  createPantryItem,
  deleteShoppingListItem,
  getShoppingListById,
  listStorageUnits,
  listUnits,
  updateShoppingListItem,
  type ShoppingListFull,
  type ShoppingListItem,
  type StorageUnit,
  type Unit,
} from "../lib/db";
import { estimateListTotalByRetailer, estimatePriceRange, type RetailerTotal } from "../lib/assistant";
import { INGREDIENT_CATEGORIES } from "../lib/constants";
import { getCategoryOrder, saveCategoryOrder, swapCategories } from "../lib/shoppingCategoryOrder";
import { IngredientAutocomplete } from "./IngredientAutocomplete";
import { SprigDoodle } from "./SprigDoodle";
import { LoadingScreen } from "./LoadingScreen";
import "./BookPage.css";
import "./ShoppingList.css";

interface ShoppingListProps {
  id: number;
  onBack: () => void;
  backLabel?: string;
}

export function ShoppingList({ id, onBack, backLabel = "← Menu" }: ShoppingListProps) {
  const [list, setList] = useState<ShoppingListFull | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);
  const [transferringId, setTransferringId] = useState<number | null>(null);
  const [transferExpiry, setTransferExpiry] = useState("");
  const [loading, setLoading] = useState(true);
  const [estimatingId, setEstimatingId] = useState<number | null>(null);
  const [estimatingAll, setEstimatingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparison, setComparison] = useState<RetailerTotal[] | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [newUnitAbbr, setNewUnitAbbr] = useState("");
  const [copied, setCopied] = useState(false);
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => getCategoryOrder());
  const [reordering, setReordering] = useState(false);
  const autoEstimated = useRef(false);

  const refresh = useCallback(async () => {
    const fresh = await getShoppingListById(id);
    setList(fresh);
    return fresh;
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const [fresh, unitList, storageUnitList] = await Promise.all([refresh(), listUnits(), listStorageUnits()]);
        setUnits(unitList);
        setStorageUnits(storageUnitList);
        // Affiché dès que la liste elle-même est chargée : l'estimation des prix manquants tourne
        // ensuite en tâche de fond (indicateur "estimatingAll" séparé), pas de raison de la faire attendre.
        setLoading(false);
        if (!autoEstimated.current && fresh) {
          autoEstimated.current = true;
          await estimateMissing(fresh.items);
        }
      } catch (err) {
        setError(String(err));
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  async function toggleChecked(itemId: number, checked: boolean) {
    setError(null);
    try {
      await updateShoppingListItem(itemId, { checked });
      if (checked) {
        setTransferringId(itemId);
        setTransferExpiry("");
      } else if (transferringId === itemId) {
        setTransferringId(null);
      }
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleTransfer(item: ShoppingListItem, storageUnitId: number | null) {
    setError(null);
    try {
      await createPantryItem({
        ingredient_name: item.ingredient_name,
        quantity: item.quantity ?? 1,
        unit_abbreviation: item.unit_abbreviation,
        storage_unit_id: storageUnitId,
        expires_at: transferExpiry || null,
        assignments: [],
      });
      await deleteShoppingListItem(item.id);
      setTransferringId(null);
      setTransferExpiry("");
      invalidateComparison();
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function setPrice(itemId: number, value: string) {
    const price = value.trim() ? Number(value) : null;
    setError(null);
    try {
      await updateShoppingListItem(itemId, { price, priceIsEstimate: false });
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDeleteItem(itemId: number) {
    setError(null);
    try {
      await deleteShoppingListItem(itemId);
      invalidateComparison();
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  function invalidateComparison() {
    setComparison(null);
    setShowComparison(false);
  }

  async function estimateOne(itemId: number, name: string, quantity: number | null, unit: string | null) {
    const range = await estimatePriceRange(name, quantity, unit);
    const midpoint = Math.round(((range.low + range.high) / 2) * 100) / 100;
    await updateShoppingListItem(itemId, { price: midpoint, priceIsEstimate: true });
  }

  async function handleEstimate(itemId: number, name: string, quantity: number | null, unit: string | null) {
    setEstimatingId(itemId);
    setError(null);
    try {
      await estimateOne(itemId, name, quantity, unit);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setEstimatingId(null);
    }
  }

  async function handleCompareTotal() {
    if (!list) return;
    if (showComparison) {
      setShowComparison(false);
      return;
    }
    setShowComparison(true);
    if (comparison) return;
    setComparisonLoading(true);
    setComparisonError(null);
    try {
      const rows = await estimateListTotalByRetailer(
        list.items.map((i) => ({ name: i.ingredient_name, quantity: i.quantity, unit: i.unit_abbreviation })),
      );
      setComparison(rows);
    } catch (err) {
      setComparisonError(err instanceof Error ? err.message : String(err));
    } finally {
      setComparisonLoading(false);
    }
  }

  async function estimateMissing(items: ShoppingListItem[]) {
    const missing = items.filter((i) => i.price == null);
    if (missing.length === 0) return;
    setEstimatingAll(true);
    setError(null);
    try {
      for (const item of missing) {
        await estimateOne(item.id, item.ingredient_name, item.quantity, item.unit_abbreviation);
      }
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setEstimatingAll(false);
    }
  }

  async function handleAddItem() {
    if (!list || !newName.trim()) return;
    setError(null);
    try {
      await addShoppingListItem(list.id, {
        ingredient_name: newName.trim(),
        quantity: newQuantity.trim() ? Number(newQuantity) : null,
        unit_abbreviation: newUnitAbbr || null,
      });
      setNewName("");
      setNewQuantity("");
      setNewUnitAbbr("");
      invalidateComparison();
      const fresh = await refresh();
      if (fresh) await estimateMissing(fresh.items);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleExport() {
    if (!list) return;
    const lines = list.items.map((item) => {
      const qty =
        item.quantity != null
          ? `${Math.round(item.quantity * 100) / 100}${item.unit_abbreviation ? " " + item.unit_abbreviation : ""} `
          : "";
      const checkbox = item.checked ? "[x]" : "[ ]";
      return `${checkbox} ${qty}${item.ingredient_name}`;
    });
    const text = `${list.name}\n${lines.join("\n")}`;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading || !list) return <LoadingScreen message="Chargement de la liste..." />;

  const total = list.items.reduce((sum, item) => sum + (item.price ?? 0), 0);
  const missingPriceCount = list.items.filter((i) => i.price == null).length;
  // Groupé par catégorie (dans l'ordre choisi par l'utilisateur, par défaut celui de INGREDIENT_CATEGORIES
  // qui suit à peu près les rayons d'un supermarché type) plutôt qu'en une liste plate, pour ne pas
  // zigzaguer entre les rayons pendant les courses.
  const categoryLabelByValue = Object.fromEntries(INGREDIENT_CATEGORIES.map((c) => [c.value, c.label]));
  const groupedItems = categoryOrder
    .map((value) => ({
      category: value,
      label: categoryLabelByValue[value] ?? value,
      items: list.items.filter((item) => item.ingredient_category === value),
    }))
    .filter((group) => group.items.length > 0);

  function moveCategory(value: string, direction: -1 | 1) {
    const visible = groupedItems.map((g) => g.category);
    const target = visible[visible.indexOf(value) + direction];
    if (!target) return;
    setCategoryOrder((prev) => {
      const next = swapCategories(prev, value, target);
      saveCategoryOrder(next);
      return next;
    });
  }

  return (
    <div className="shopping-list">
      <button className="book-nav__back" onClick={onBack}>
        {backLabel}
      </button>

      <div className="shopping-list__paper">
        <SprigDoodle className="book-page__doodle book-page__doodle--tl" />
        <SprigDoodle className="book-page__doodle book-page__doodle--br" flip />

        <h1>{list.name}</h1>

        {list.items.length > 0 && (
          <div className="shopping-list__toolbar">
            <button type="button" className="shopping-list__export" onClick={handleExport}>
              {copied ? "✓ Copié !" : "📋 Copier la liste"}
            </button>
            {groupedItems.length > 1 && (
              <button type="button" className="shopping-list__export" onClick={() => setReordering((r) => !r)}>
                {reordering ? "✓ Terminé" : "↕️ Réordonner les rayons"}
              </button>
            )}
          </div>
        )}

        {error && <p className="form-error">{error}</p>}

        {list.items.length === 0 ? (
          <p className="shopping-list__empty">Tout est déjà dans le garde-manger, rien à acheter !</p>
        ) : (
          <ul className="shopping-list__items">
            {groupedItems.map((group) => (
              <Fragment key={group.category}>
                <li className="shopping-list__category-header">
                  <span>{group.label}</span>
                  {reordering && (
                    <span className="shopping-list__category-reorder">
                      <button
                        type="button"
                        onClick={() => moveCategory(group.category, -1)}
                        disabled={groupedItems.indexOf(group) === 0}
                        aria-label={`Monter le rayon ${group.label}`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCategory(group.category, 1)}
                        disabled={groupedItems.indexOf(group) === groupedItems.length - 1}
                        aria-label={`Descendre le rayon ${group.label}`}
                      >
                        ▼
                      </button>
                    </span>
                  )}
                </li>
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className={`shopping-list__item${item.checked ? " shopping-list__item--checked" : ""}${transferringId === item.id ? " shopping-list__item--expanded" : ""}`}
                  >
                    <div className="shopping-list__item-main">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => toggleChecked(item.id, e.target.checked)}
                        aria-label={`${item.ingredient_name} acheté`}
                      />
                      <span className="shopping-list__qty">
                        {item.quantity != null
                          ? `${Math.round(item.quantity * 100) / 100}${item.unit_abbreviation ? " " + item.unit_abbreviation : ""}`
                          : ""}
                      </span>
                      <span className="shopping-list__name">{item.ingredient_name}</span>
                      {item.is_suggested && <span className="shopping-list__suggested-badge">suggéré</span>}
                    </div>
                    <div className="shopping-list__item-controls">
                      {item.price == null && !estimatingAll && (
                        <button
                          type="button"
                          className="shopping-list__estimate"
                          onClick={() => handleEstimate(item.id, item.ingredient_name, item.quantity, item.unit_abbreviation)}
                          disabled={estimatingId === item.id || estimatingAll}
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
                        aria-label={`Prix de ${item.ingredient_name}`}
                      />
                      <button
                        type="button"
                        className="shopping-list__delete"
                        onClick={() => handleDeleteItem(item.id)}
                        aria-label="Retirer"
                      >
                        ×
                      </button>
                    </div>

                    {transferringId === item.id && (
                      <div className="shopping-list__transfer">
                        <span className="shopping-list__transfer-label">Ranger dans :</span>
                        <input
                          type="date"
                          className="shopping-list__transfer-expiry"
                          value={transferExpiry}
                          onChange={(e) => setTransferExpiry(e.target.value)}
                          title="Date de péremption (optionnel)"
                        />
                        {storageUnits.map((u) => (
                          <button key={u.id} type="button" onClick={() => handleTransfer(item, u.id)}>
                            {u.name}
                          </button>
                        ))}
                        <button type="button" onClick={() => handleTransfer(item, null)}>
                          Sans emplacement
                        </button>
                        <button
                          type="button"
                          className="shopping-list__transfer-skip"
                          onClick={() => setTransferringId(null)}
                        >
                          Plus tard
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </Fragment>
            ))}
          </ul>
        )}

        <div className="shopping-list__add">
          <IngredientAutocomplete
            className="shopping-list__add-name"
            placeholder="Ajouter un article..."
            value={newName}
            onChange={setNewName}
          />
          <input
            className="shopping-list__add-quantity"
            type="number"
            min="0"
            step="any"
            placeholder="Qté"
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
          />
          <select value={newUnitAbbr} onChange={(e) => setNewUnitAbbr(e.target.value)}>
            <option value="">unité</option>
            {units.map((u) => (
              <option key={u.id} value={u.abbreviation}>
                {u.abbreviation}
              </option>
            ))}
          </select>
          <button type="button" className="form-cancel" onClick={handleAddItem} disabled={!newName.trim()}>
            + Ajouter
          </button>
        </div>

        <div className="shopping-list__total">
          <span>Total estimé</span>
          <strong>{total.toFixed(2)} €</strong>
          {missingPriceCount > 0 && (
            <>
              <span className="shopping-list__missing">{missingPriceCount} prix manquant(s)</span>
              <button
                type="button"
                className="shopping-list__estimate-all"
                onClick={() => estimateMissing(list.items)}
                disabled={estimatingAll}
              >
                {estimatingAll ? "Estimation..." : "💡 Tout estimer"}
              </button>
            </>
          )}
          <button
            type="button"
            className="shopping-list__estimate-all"
            onClick={handleCompareTotal}
            disabled={comparisonLoading}
          >
            {comparisonLoading ? "Comparaison..." : "🏷️ Comparer les enseignes"}
          </button>
        </div>

        {showComparison && (
          <div className="shopping-list__comparison">
            <p className="shopping-list__comparison-note">
              Estimation comparative de Mamacita sur le total de la liste (pas des prix scrapés en temps réel) —
              pour se situer entre enseignes, pas un prix garanti.
            </p>
            {comparisonError && <p className="form-error">{comparisonError}</p>}
            {comparison && (
              <ul className="shopping-list__comparison-list">
                {(() => {
                  const min = Math.min(...comparison.map((r) => r.total));
                  return comparison.map((r) => (
                    <li key={r.retailer} className={r.total === min ? "shopping-list__comparison-row--cheapest" : undefined}>
                      <span>{r.retailer}</span>
                      <strong>{r.total.toFixed(2)} €</strong>
                    </li>
                  ));
                })()}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
