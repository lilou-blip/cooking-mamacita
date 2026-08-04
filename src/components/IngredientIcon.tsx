import { getIngredientIllustration } from "../lib/ingredientIllustrations";
import "./IngredientIcon.css";

interface IngredientIconProps {
  name: string;
  size?: number;
  className?: string;
}

export function IngredientIcon({ name, size = 64, className }: IngredientIconProps) {
  const src = getIngredientIllustration(name);
  if (!src) return null;

  return (
    <img
      className={`ingredient-icon ${className ?? ""}`}
      style={{ width: size, height: size }}
      src={src}
      alt={name}
    />
  );
}
