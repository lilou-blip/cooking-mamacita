import type { TagCategory } from "./db";

export const TAG_CATEGORY_LABELS: Record<TagCategory, string> = {
  type: "Type",
  regime: "Régime",
  gout: "Goût",
  saison: "Saison",
  temperature: "Température",
};

export const TAG_CATEGORY_ORDER: TagCategory[] = ["type", "regime", "gout", "saison", "temperature"];

export const INGREDIENT_CATEGORIES: { value: string; label: string }[] = [
  { value: "fruits", label: "Fruits" },
  { value: "legumes", label: "Légumes" },
  { value: "proteines", label: "Protéines" },
  { value: "feculents", label: "Féculents" },
  { value: "laitages", label: "Laitages" },
  { value: "epicerie", label: "Épicerie" },
  { value: "boissons", label: "Boissons" },
  { value: "autre", label: "Autre" },
];
