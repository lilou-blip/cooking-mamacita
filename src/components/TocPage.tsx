import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { getCookableRecipeIds, listAllTags, type RecipeCard, type Tag } from "../lib/db";
import { TAG_CATEGORY_LABELS, TAG_CATEGORY_ORDER } from "../lib/constants";
import { getCurrentSeason, seasonEmoji } from "../lib/seasons";
import "./TocPage.css";

type SortBy = "date" | "alpha" | "made";

interface TocPageProps {
  recipes: RecipeCard[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAddNew: () => void;
  onImport: () => void;
  onDuplicate: (id: number) => void | Promise<void>;
  onToggleFavorite: (id: number, isFavorite: boolean) => void | Promise<void>;
}

export function TocPage({ recipes, selectedId, onSelect, onAddNew, onImport, onDuplicate, onToggleFavorite }: TocPageProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [cookableIds, setCookableIds] = useState<Set<number> | null>(null);
  const [showOnlyCookable, setShowOnlyCookable] = useState(false);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<number | null>(null);

  async function handleDuplicateClick(e: MouseEvent, id: number) {
    e.stopPropagation();
    if (duplicatingId != null) return;
    setDuplicatingId(id);
    try {
      await onDuplicate(id);
    } finally {
      setDuplicatingId(null);
    }
  }

  async function handleFavoriteClick(e: MouseEvent, id: number, isFavorite: boolean) {
    e.stopPropagation();
    if (togglingFavoriteId != null) return;
    setTogglingFavoriteId(id);
    try {
      await onToggleFavorite(id, !isFavorite);
    } finally {
      setTogglingFavoriteId(null);
    }
  }

  useEffect(() => {
    listAllTags().then(setAllTags);
    getCookableRecipeIds().then(setCookableIds);
  }, []);

  const currentSeason = getCurrentSeason();
  const seasonTag = allTags.find((t) => t.category === "saison" && t.name === currentSeason);
  const seasonRecipeCount = seasonTag
    ? recipes.filter((r) => r.tags.some((t) => t.id === seasonTag.id)).length
    : 0;
  const seasonFilterActive = seasonTag != null && selectedTagIds.size === 1 && selectedTagIds.has(seasonTag.id);

  function toggleSeasonFilter() {
    if (!seasonTag) return;
    setSelectedTagIds(seasonFilterActive ? new Set() : new Set([seasonTag.id]));
  }

  function toggleTag(id: number) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleRecipes = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = recipes.filter((recipe) => {
      if (selectedTagIds.size > 0) {
        const recipeTagIds = new Set(recipe.tags.map((t) => t.id));
        for (const id of selectedTagIds) {
          if (!recipeTagIds.has(id)) return false;
        }
      }
      if (query) {
        const matchesTitle = recipe.title.toLowerCase().includes(query);
        const matchesIngredient = recipe.ingredient_names.some((n) => n.toLowerCase().includes(query));
        if (!matchesTitle && !matchesIngredient) return false;
      }
      if (showOnlyCookable && !cookableIds?.has(recipe.id)) return false;
      if (showOnlyFavorites && !recipe.is_favorite) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortBy === "alpha") return a.title.localeCompare(b.title);
      if (sortBy === "made") return b.made_count - a.made_count;
      return 0; // "date": déjà trié par date de création côté DB
    });
  }, [recipes, search, sortBy, selectedTagIds, showOnlyCookable, cookableIds, showOnlyFavorites]);

  const favoriteCount = recipes.filter((r) => r.is_favorite).length;

  return (
    <div className="toc-page">
      <h1 className="toc-page__title">Sommaire</h1>

      {((seasonTag && seasonRecipeCount > 0) || (cookableIds && cookableIds.size > 0) || favoriteCount > 0) && (
        <div className="toc-page__quick-filters">
          {seasonTag && seasonRecipeCount > 0 && (
            <button
              type="button"
              className={`toc-page__season${seasonFilterActive ? " toc-page__season--active" : ""}`}
              onClick={toggleSeasonFilter}
            >
              {seasonEmoji(currentSeason)} Recettes de saison ({seasonRecipeCount})
            </button>
          )}
          {cookableIds && cookableIds.size > 0 && (
            <button
              type="button"
              className={`toc-page__season${showOnlyCookable ? " toc-page__season--active" : ""}`}
              onClick={() => setShowOnlyCookable((v) => !v)}
            >
              🍽️ Je peux faire maintenant ({cookableIds.size})
            </button>
          )}
          {favoriteCount > 0 && (
            <button
              type="button"
              className={`toc-page__season${showOnlyFavorites ? " toc-page__season--active" : ""}`}
              onClick={() => setShowOnlyFavorites((v) => !v)}
            >
              ⭐ Favoris ({favoriteCount})
            </button>
          )}
        </div>
      )}

      <div className="toc-page__controls">
        <input
          type="search"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
          <option value="date">Date d'ajout</option>
          <option value="alpha">Alphabétique</option>
          <option value="made">Fois faite</option>
        </select>
        <button type="button" className="toc-page__filters-toggle" onClick={() => setShowFilters((v) => !v)}>
          Filtres{selectedTagIds.size > 0 ? ` (${selectedTagIds.size})` : ""}
        </button>
      </div>

      {showFilters && (
        <div className="toc-page__filters">
          {TAG_CATEGORY_ORDER.map((category) => {
            const tagsInCategory = allTags.filter((t) => t.category === category);
            if (tagsInCategory.length === 0) return null;
            return (
              <div key={category} className="tag-group">
                <span className="tag-group__label">{TAG_CATEGORY_LABELS[category]}</span>
                <div className="tag-group__options">
                  {tagsInCategory.map((tag) => (
                    <button
                      type="button"
                      key={tag.id}
                      className={`tag-toggle${selectedTagIds.has(tag.id) ? " tag-toggle--active" : ""}`}
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ul className="toc-page__list">
        {visibleRecipes.map((recipe, i) => (
          <li key={recipe.id} className="toc-page__row">
            <button
              type="button"
              className={`toc-page__item${selectedId === recipe.id ? " toc-page__item--active" : ""}`}
              onClick={() => onSelect(recipe.id)}
            >
              <span className="toc-page__item-number">{i + 1}</span>
              <span className="toc-page__item-title">{recipe.title}</span>
              {recipe.tags[0] && <span className="toc-page__item-tag">{recipe.tags[0].name}</span>}
            </button>
            <button
              type="button"
              className={`toc-page__favorite${recipe.is_favorite ? " toc-page__favorite--active" : ""}`}
              onClick={(e) => handleFavoriteClick(e, recipe.id, recipe.is_favorite)}
              disabled={togglingFavoriteId === recipe.id}
              aria-label={recipe.is_favorite ? `Retirer ${recipe.title} des favoris` : `Ajouter ${recipe.title} aux favoris`}
              aria-pressed={recipe.is_favorite}
              title={recipe.is_favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            >
              {recipe.is_favorite ? "★" : "☆"}
            </button>
            <button
              type="button"
              className="toc-page__duplicate"
              onClick={(e) => handleDuplicateClick(e, recipe.id)}
              disabled={duplicatingId === recipe.id}
              aria-label={`Dupliquer ${recipe.title}`}
              title="Dupliquer"
            >
              {duplicatingId === recipe.id ? "…" : "⎘"}
            </button>
          </li>
        ))}
      </ul>
      {visibleRecipes.length === 0 && <p className="toc-page__empty">Aucune recette ne correspond.</p>}

      <div className="toc-page__actions">
        <button type="button" className="form-cancel" onClick={onAddNew}>
          + Ajouter
        </button>
        <button type="button" className="form-cancel" onClick={onImport}>
          ✨ Importer avec Mamacita
        </button>
      </div>
    </div>
  );
}
