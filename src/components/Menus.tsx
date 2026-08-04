import { useCallback, useEffect, useState } from "react";
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
import { MenuForm } from "./MenuForm";
import { ShoppingList } from "./ShoppingList";
import { WeeklyMenuGrid } from "./WeeklyMenuGrid";
import { MenuSuggestions } from "./MenuSuggestions";
import { WeekSummary } from "./WeekSummary";
import "./Menus.css";

/** Choisit le menu "semaine" le plus pertinent pour la semaine en cours (chevauche lundi-dimanche, sinon le plus proche). */
function pickCurrentWeekMenu(menus: Menu[]): Menu | null {
  const weekly = menus.filter((m) => m.menu_type === "semaine");
  if (weekly.length === 0) return null;

  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const inRange = weekly.find((m) => {
    if (!m.event_date) return false;
    const d = new Date(m.event_date);
    return d >= monday && d <= sunday;
  });
  if (inRange) return inRange;

  const withDate = weekly.filter((m) => m.event_date);
  if (withDate.length > 0) {
    return withDate.reduce((closest, m) =>
      Math.abs(new Date(m.event_date!).getTime() - now.getTime()) <
      Math.abs(new Date(closest.event_date!).getTime() - now.getTime())
        ? m
        : closest,
    );
  }

  return weekly[0];
}

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
  const [loading, setLoading] = useState(true);

  const [currentMenu, setCurrentMenu] = useState<MenuFull | null>(null);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [addServings, setAddServings] = useState("4");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [weekMenu, setWeekMenu] = useState<MenuFull | null>(null);
  const [formInitialType, setFormInitialType] = useState<MenuType>("evenement");

  const [shoppingListId, setShoppingListId] = useState<number | null>(null);

  const refreshMenus = useCallback(async () => {
    const list = await listMenus();
    setMenus(list);
    const candidate = pickCurrentWeekMenu(list);
    setWeekMenu(candidate ? await getMenuById(candidate.id) : null);
  }, []);

  useEffect(() => {
    (async () => {
      await refreshMenus();
      setLoading(false);
    })();
  }, [refreshMenus]);

  async function openMenu(id: number) {
    const [menu, recipes] = await Promise.all([getMenuById(id), listRecipes()]);
    setCurrentMenu(menu);
    setAllRecipes(recipes);
    setShowSuggestions(false);
    setSubView("detail");
  }

  async function refreshCurrentMenu() {
    if (!currentMenu) return;
    setCurrentMenu(await getMenuById(currentMenu.id));
  }

  async function handleAddRecipe() {
    if (!currentMenu || !selectedRecipeId) return;
    await addRecipeToMenu(currentMenu.id, Number(selectedRecipeId), Number(addServings) || 4);
    setSelectedRecipeId("");
    await refreshCurrentMenu();
  }

  async function handleRemoveRecipe(menuRecipeId: number) {
    await removeMenuRecipe(menuRecipeId);
    await refreshCurrentMenu();
  }

  async function handleToggleMade(menuRecipeId: number, recipeId: number, servings: number, made: boolean) {
    await updateMenuRecipeMade(menuRecipeId, made);
    if (made) {
      await markRecipeMade(recipeId, servings);
    }
    await refreshCurrentMenu();
  }

  async function handleDeleteMenu(id: number) {
    if (!window.confirm("Supprimer ce menu ?")) return;
    await deleteMenu(id);
    await refreshMenus();
    setCurrentMenu(null);
    setSubView("list");
  }

  async function handleGenerateList() {
    if (!currentMenu) return;
    setShoppingListId(await generateShoppingListForMenu(currentMenu.id));
  }

  if (shoppingListId != null) {
    return <ShoppingList id={shoppingListId} onBack={() => setShoppingListId(null)} />;
  }

  if (loading) return <p className="status-text">Chargement des menus...</p>;

  if (subView === "detail" && currentMenu) {
    const madeCount = currentMenu.recipes.filter((r) => r.made).length;
    const progress = currentMenu.recipes.length > 0 ? (madeCount / currentMenu.recipes.length) * 100 : 0;

    return (
      <div className="menu-detail">
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
                💡 Suggestions IA
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
            onClick={() => handleDeleteMenu(currentMenu.id)}
          >
            Supprimer le menu
          </button>
          <button className="form-submit" onClick={handleGenerateList} disabled={currentMenu.recipes.length === 0}>
            Générer la liste de courses
          </button>
        </div>
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
