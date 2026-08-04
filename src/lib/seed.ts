import { createRecipe, listRecipes } from "./db";

let seeding: Promise<void> | null = null;

export function ensureSeedRecipe(): Promise<void> {
  if (!seeding) {
    seeding = seedIfEmpty();
  }
  return seeding;
}

async function seedIfEmpty(): Promise<void> {
  const existing = await listRecipes();
  if (existing.length > 0) return;

  await createRecipe({
    title: "Cookies aux pépites de chocolat",
    servings: 12,
    prep_time_minutes: 15,
    cook_time_minutes: 12,
    source: "Recette personnelle",
    notes: "Bien laisser refroidir 5 min sur la plaque avant de les déplacer, ils sont fragiles à la sortie du four.",
    tags: [
      { category: "type", name: "dessert" },
      { category: "gout", name: "sucré" },
      { category: "saison", name: "automne" },
      { category: "temperature", name: "chaud" },
    ],
    ingredients: [
      { name: "beurre mou", category: "laitages", quantity: 150, unit_abbreviation: "g" },
      { name: "cassonade", category: "epicerie", quantity: 200, unit_abbreviation: "g" },
      { name: "oeuf", category: "proteines", quantity: 1, unit_abbreviation: "pièce" },
      { name: "extrait de vanille", category: "epicerie", quantity: 1, unit_abbreviation: "c. à c." },
      { name: "farine", category: "feculents", quantity: 200, unit_abbreviation: "g" },
      { name: "bicarbonate de soude", category: "epicerie", quantity: 0.5, unit_abbreviation: "c. à c." },
      { name: "sel", category: "epicerie", quantity: 1, unit_abbreviation: "pincée" },
      { name: "pépites de chocolat", category: "epicerie", quantity: 100, unit_abbreviation: "g" },
      { name: "noix de pécan concassées", category: "epicerie", quantity: 60, unit_abbreviation: "g" },
    ],
    steps: [
      "Mélangez le beurre mou et la cassonade jusqu'à obtenir une texture crémeuse.",
      "Ajoutez l'oeuf et l'extrait de vanille, mélangez bien.",
      "Tamisez la farine, le bicarbonate et le sel, puis incorporez au mélange.",
      "Ajoutez les pépites de chocolat et les noix de pécan concassées.",
      "Formez de petites boules de pâte et espacez-les sur une plaque.",
      "Enfournez à 180°C pendant 12 minutes, jusqu'à ce que les bords soient dorés.",
    ],
  });
}
