import { useEffect, useState } from "react";
import { COOKING_TIPS } from "../lib/cookingTips";
import "./ThinkingTips.css";

/** Astuce de cuisine qui change toutes les ~3s, affichée pendant une attente IA un peu longue (import,
 * plan de batch cooking, idée anti-gaspi...) pour rendre le "Mamacita réfléchit..." agréable. */
export function ThinkingTips() {
  const [current, setCurrent] = useState(() => Math.floor(Math.random() * COOKING_TIPS.length));

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((i) => (i + 1) % COOKING_TIPS.length);
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  return (
    <p key={current} className="thinking-tips">
      {COOKING_TIPS[current]}
    </p>
  );
}
