/** Devine une des catégories internes de l'app à partir des tags de catégorie Open Food Facts (ex: "en:dairies"). */
function guessCategory(tags: string[]): string {
  const joined = tags.join(" ").toLowerCase();
  const rules: [RegExp, string][] = [
    [/fruit/, "fruits"],
    [/vegetable|legume/, "legumes"],
    [/meat|fish|seafood|egg|poultry|proteine/, "proteines"],
    [/cereal|pasta|rice|bread|potato|starch/, "feculents"],
    [/dair|cheese|milk|yogurt|yoghurt/, "laitages"],
    [/beverage|drink|water|juice|soda|wine|beer/, "boissons"],
    [/grocer|condiment|spice|sugar|flour|sauce|snack/, "epicerie"],
  ];
  for (const [pattern, category] of rules) {
    if (pattern.test(joined)) return category;
  }
  return "autre";
}

export interface OffProduct {
  name: string;
  category: string;
}

/** Recherche un produit par code-barres via l'API publique et gratuite Open Food Facts (pas de clé requise). */
export async function lookupBarcode(code: string): Promise<OffProduct | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_fr,categories_tags`,
  );
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const name: string | undefined = data.product.product_name_fr || data.product.product_name;
  if (!name || !name.trim()) return null;

  return { name: name.trim(), category: guessCategory(data.product.categories_tags ?? []) };
}
