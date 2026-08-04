import { getIngredientIllustration } from "../lib/ingredientIllustrations";
import { IngredientIcon } from "./IngredientIcon";
import "./IngredientIllustrations.css";

interface IngredientIllustrationsProps {
  ingredientNames: string[];
  className?: string;
}

export function IngredientIllustrations({ ingredientNames, className }: IngredientIllustrationsProps) {
  const illustrated = ingredientNames.filter((name) => getIngredientIllustration(name) != null).slice(0, 4);
  if (illustrated.length === 0) return null;

  return (
    <div className={`ingredient-illustrations ${className ?? ""}`}>
      {illustrated.map((name, i) => (
        <div key={`${name}-${i}`} className={`ingredient-illustrations__item ingredient-illustrations__item--${i % 4}`}>
          <IngredientIcon name={name} size={i === 0 ? 78 : 54} />
        </div>
      ))}
    </div>
  );
}
