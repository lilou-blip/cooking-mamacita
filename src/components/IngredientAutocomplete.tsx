import { useEffect, useRef, useState } from "react";
import { listIngredients, type Ingredient } from "../lib/db";
import { INGREDIENT_CATEGORIES } from "../lib/constants";
import "./IngredientAutocomplete.css";

const CATEGORY_LABEL_BY_VALUE = Object.fromEntries(INGREDIENT_CATEGORIES.map((c) => [c.value, c.label]));

interface IngredientAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelectKnown?: (ingredient: Ingredient) => void;
  placeholder?: string;
  className?: string;
}

export function IngredientAutocomplete({
  value,
  onChange,
  onSelectKnown,
  placeholder,
  className,
}: IngredientAutocompleteProps) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listIngredients().then(setIngredients);
  }, []);

  const query = value.trim().toLowerCase();
  const suggestions = query
    ? ingredients.filter((i) => i.name.toLowerCase().includes(query)).slice(0, 8)
    : [];

  function pick(ingredient: Ingredient) {
    onChange(ingredient.name);
    onSelectKnown?.(ingredient);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pick(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="ingredient-autocomplete">
      <input
        className={className}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // délai pour laisser le clic sur une suggestion s'exécuter avant fermeture
          blurTimeout.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && suggestions.length > 0 && (
        <ul className="ingredient-autocomplete__list">
          {suggestions.map((ing, i) => (
            <li key={ing.id}>
              <button
                type="button"
                className={`ingredient-autocomplete__item${i === activeIndex ? " ingredient-autocomplete__item--active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (blurTimeout.current) clearTimeout(blurTimeout.current);
                  pick(ing);
                }}
              >
                <span>{ing.name}</span>
                <span className="ingredient-autocomplete__item-category">
                  {CATEGORY_LABEL_BY_VALUE[ing.category] ?? ing.category}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
