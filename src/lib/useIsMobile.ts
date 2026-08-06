import { useEffect, useState } from "react";

/** Même seuil que la mise en page du livre de recettes (BookSpread.css) : en dessous, on abandonne la
 * métaphore livre/pages qui se tournent pour une simple liste + une page de recette qui défile. */
export function useIsMobile(breakpointPx = 820): boolean {
  const query = `(max-width: ${breakpointPx}px)`;
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return isMobile;
}
