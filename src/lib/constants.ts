import type { MealSlot, TagCategory } from "./db";

export const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: "petit_dejeuner", label: "Petit-déj" },
  { value: "dejeuner", label: "Déjeuner" },
  { value: "gouter", label: "Goûter" },
  { value: "diner", label: "Dîner" },
];

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
  { value: "matieres_grasses", label: "Matières grasses" },
  { value: "sucreries", label: "Sucres & sucreries" },
  { value: "epicerie", label: "Épicerie" },
  { value: "boissons", label: "Boissons" },
  { value: "autre", label: "Autre" },
];
