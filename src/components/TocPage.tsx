import { useEffect, useMemo, useState } from "react";
import { listAllTags, type RecipeCard, type Tag } from "../lib/db";
import { TAG_CATEGORY_LABELS, TAG_CATEGORY_ORDER } from "../lib/constants";
import "./TocPage.css";

type SortBy = "date" | "alpha" | "made";

interface TocPageProps {
  recipes: RecipeCard[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAddNew: () => void;
  onImport: () => void;
}

export function TocPage({ recipes, selectedId, onSelect, onAddNew, onImport }: TocPageProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    listAllTags().then(setAllTags);
  }, []);

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
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortBy === "alpha") return a.title.localeCompare(b.title);
      if (sortBy === "made") return b.made_count - a.made_count;
      return 0; // "date": déjà trié par date de création côté DB
    });
  }, [recipes, search, sortBy, selectedTagIds]);

  return (
    <div className="toc-page">
      <h1 className="toc-page__title">Sommaire</h1>

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
          <li key={recipe.id}>
            <button
              type="button"
              className={`toc-page__item${selectedId === recipe.id ? " toc-page__item--active" : ""}`}
              onClick={() => onSelect(recipe.id)}
            >
              <span className="toc-page__item-number">{i + 1}</span>
              <span className="toc-page__item-title">{recipe.title}</span>
              {recipe.tags[0] && <span className="toc-page__item-tag">{recipe.tags[0].name}</span>}
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
          ✨ Importer IA
        </button>
      </div>
    </div>
  );
}
