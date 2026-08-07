import { useCallback, useState } from "react";
import { useAsyncEffect } from "../lib/useAsyncEffect";
import {
  addRecipeToMenu,
  deleteMenu,
  generateShoppingListForMenu,
  getMenuById,
  listMenus,
  listRecipes,
  markRecipeMade,
  removeMenuRecipe,
  updateMenuRecipeMade,
  type Menu,
  type MenuFull,
  type MenuType,
  type Recipe,
} from "../lib/db";
import { pickCurrentWeekMenu } from "../lib/weekMenu";
import { MenuForm } from "./MenuForm";
import { ShoppingList } from "./ShoppingList";
import { WeeklyMenuGrid } from "./WeeklyMenuGrid";
import { MenuSuggestions } from "./MenuSuggestions";
import { WeekSummary } from "./WeekSummary";
import { LoadingScreen } from "./LoadingScreen";
import { ConfirmDialog } from "./ConfirmDialog";
import "./Menus.css";

type SubView = "list" | "detail";
type MenuFilter = "toutes" | MenuType;

const MENU_TYPE_LABELS: Record<MenuType, string> = { semaine: "Semaine", evenement: "Événement" };

interface MenusProps {
  onBack: () => void;
}

export function Menus({ onBack }: MenusProps) {
  const [subView, setSubView] = useState<SubView>("list");
  const [menus, setMenus] = useState<Menu[]>([]);
  const [filter, setFilter] = useState<MenuFilter>("toutes");
  const [showForm, setShowForm] = useState(false);

  const [currentMenu, setCurrentMenu] = useState<MenuFull | null>(null);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [addServings, setAddServings] = useState("4");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [weekMenu, setWeekMenu] = useState<MenuFull | null>(null);
  const [formInitialType, setFormInitialType] = useState<MenuType>("evenement");

  const [shoppingListId, setShoppingListId] = useState<number | null>(null);
  const [confirmingDeleteMenu, setConfirmingDeleteMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshMenus = useCallback(async () => {
    const list = await listMenus();
    setMenus(list);
    const candidate = pickCurrentWeekMenu(list);
    setWeekMenu(candidate ? await getMenuById(candidate.id) : null);
  }, []);

  const { loading, error: loadError } = useAsyncEffect(refreshMenus, [refreshMenus]);

  async function openMenu(id: number) {
    setError(null);
    try {
      const [menu, recipes] = await Promise.all([getMenuById(id), listRecipes()]);
      setCurrentMenu(menu);
      setAllRecipes(recipes);
      setShowSuggestions(false);
      setSubView("detail");
    } catch (err) {
      setError(String(err));
    }
  }

  async function refreshCurrentMenu() {
    if (!currentMenu) return;
    try {
      setCurrentMenu(await getMenuById(currentMenu.id));
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleAddRecipe() {
    if (!currentMenu || !selectedRecipeId) return;
    setError(null);
    try {
      await addRecipeToMenu(currentMenu.id, Number(selectedRecipeId), Number(addServings) || 4);
      setSelectedRecipeId("");
      await refreshCurrentMenu();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleRemoveRecipe(menuRecipeId: number) {
    setError(null);
    try {
      await removeMenuRecipe(menuRecipeId);
      await refreshCurrentMenu();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleToggleMade(menuRecipeId: number, recipeId: number, servings: number, made: boolean) {
    setError(null);
    try {
      await updateMenuRecipeMade(menuRecipeId, made);
      if (made) {
        await markRecipeMade(recipeId, servings);
      }
      await refreshCurrentMenu();
    } catch (err) {
      setError(String(err));
    }
  }

  async function confirmDeleteMenu() {
    if (!currentMenu) return;
    setConfirmingDeleteMenu(false);
    setError(null);
    try {
      await deleteMenu(currentMenu.id);
      await refreshMenus();
      setCurrentMenu(null);
      setSubView("list");
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleGenerateList() {
    if (!currentMenu) return;
    setError(null);
    try {
      setShoppingListId(await generateShoppingListForMenu(currentMenu.id));
    } catch (err) {
      setError(String(err));
    }
  }

  if (shoppingListId != null) {
    return <ShoppingList id={shoppingListId} onBack={() => setShoppingListId(null)} />;
  }

  if (loading) return <LoadingScreen message="Chargement des menus..." />;
  if (loadError) return <p className="status-text status-text--error">Erreur: {loadError}</p>;

  if (subView === "detail" && currentMenu) {
    const madeCount = currentMenu.recipes.filter((r) => r.made).length;
    const progress = currentMenu.recipes.length > 0 ? (madeCount / currentMenu.recipes.length) * 100 : 0;

    return (
      <div className={`menu-detail${currentMenu.menu_type === "semaine" ? " menu-detail--week" : ""}`}>
        <button className="book-nav__back" onClick={() => setSubView("list")}>
          ← Menus
        </button>
        <div className="menu-detail__title-row">
          <h1>{currentMenu.name}</h1>
          <span className="menu-type-badge">{MENU_TYPE_LABELS[currentMenu.menu_type]}</span>
        </div>
        {currentMenu.event_date && (
          <p className="menu-detail__date">{new Date(currentMenu.event_date).toLocaleDateString("fr-FR")}</p>
        )}
        {error && <p className="form-error">{error}</p>}

        {currentMenu.recipes.length > 0 && (
          <div className="menu-progress">
            <div className="menu-progress__bar">
              <div className="menu-progress__fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="menu-progress__label">
              {madeCount}/{currentMenu.recipes.length} recette{currentMenu.recipes.length > 1 ? "s" : ""} faite
              {madeCount > 1 ? "s" : ""}
            </span>
          </div>
        )}

        {currentMenu.menu_type === "semaine" ? (
          <WeeklyMenuGrid
            menu={currentMenu}
            allRecipes={allRecipes}
            onToggleMade={handleToggleMade}
            onRemove={handleRemoveRecipe}
            onAdded={refreshCurrentMenu}
          />
        ) : (
          <>
            {showSuggestions ? (
              <MenuSuggestions
                menu={currentMenu}
                allRecipes={allRecipes}
                onAdded={refreshCurrentMenu}
                onClose={() => setShowSuggestions(false)}
              />
            ) : (
              <button className="menu-detail__suggest" onClick={() => setShowSuggestions(true)}>
                💡 Suggestions de Mamacita
              </button>
            )}

            <ul className="menu-detail__recipes">
              {currentMenu.recipes.map((r) => (
                <li key={r.menu_recipe_id} className={r.made ? "menu-detail__recipe--made" : undefined}>
                  <input
                    type="checkbox"
                    checked={r.made}
                    onChange={(e) => handleToggleMade(r.menu_recipe_id, r.recipe_id, r.servings, e.target.checked)}
                    aria-label="Fait"
                  />
                  <span>{r.title}</span>
                  <span className="menu-detail__servings">{r.servings} pers.</span>
                  <button onClick={() => handleRemoveRecipe(r.menu_recipe_id)} aria-label="Retirer">
                    ×
                  </button>
                </li>
              ))}
              {currentMenu.recipes.length === 0 && (
                <p className="pantry__empty">Aucune recette dans ce menu pour l'instant.</p>
              )}
            </ul>

            <div className="menu-detail__add">
              <select value={selectedRecipeId} onChange={(e) => setSelectedRecipeId(e.target.value)}>
                <option value="">Choisir une recette...</option>
                {allRecipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
              <input type="number" min="1" value={addServings} onChange={(e) => setAddServings(e.target.value)} />
              <button className="form-cancel" onClick={handleAddRecipe} disabled={!selectedRecipeId}>
                + Ajouter
              </button>
            </div>
          </>
        )}

        <div className="menu-detail__footer">
          <button
            className="book-nav__action book-nav__action--danger"
            onClick={() => setConfirmingDeleteMenu(true)}
          >
            Supprimer le menu
          </button>
          <button className="form-submit" onClick={handleGenerateList} disabled={currentMenu.recipes.length === 0}>
            Générer la liste de courses
          </button>
        </div>
        {confirmingDeleteMenu && (
          <ConfirmDialog
            message="Supprimer ce menu ?"
            onConfirm={confirmDeleteMenu}
            onCancel={() => setConfirmingDeleteMenu(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="menus">
      <button className="book-nav__back" onClick={onBack}>
        ← Table
      </button>
      <header className="pantry__header">
        <h1>Menus</h1>
        <button
          className="pantry__add"
          onClick={() => {
            setFormInitialType("evenement");
            setShowForm((v) => !v);
          }}
        >
          {showForm ? "Fermer" : "+ Nouveau menu"}
        </button>
      </header>
      {error && <p className="form-error">{error}</p>}

      <WeekSummary
        menu={weekMenu}
        onOpen={openMenu}
        onCreate={() => {
          setFormInitialType("semaine");
          setShowForm(true);
        }}
      />

      {showForm && (
        <MenuForm
          key={formInitialType}
          initialType={formInitialType}
          onCreated={async () => {
            setShowForm(false);
            await refreshMenus();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="menus__filters">
        {(["toutes", "semaine", "evenement"] as MenuFilter[]).map((f) => (
          <button
            key={f}
            className={`top-nav__tab${filter === f ? " top-nav__tab--active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "toutes" ? "Toutes" : MENU_TYPE_LABELS[f]}
          </button>
        ))}
      </div>

      {menus.length === 0 ? (
        <p className="pantry__empty">Pas encore de menu. Compose ton premier événement !</p>
      ) : (
        <ul className="menus__list">
          {menus
            .filter((m) => filter === "toutes" || m.menu_type === filter)
            .map((m) => (
              <li key={m.id} className="menu-card" onClick={() => openMenu(m.id)}>
                <div className="menu-card__top">
                  <h2>{m.name}</h2>
                  <span className="menu-type-badge">{MENU_TYPE_LABELS[m.menu_type]}</span>
                </div>
                <div className="menu-card__meta">
                  {m.event_date && <span>{new Date(m.event_date).toLocaleDateString("fr-FR")}</span>}
                  {m.servings_target && <span>{m.servings_target} pers.</span>}
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
