import type { Tag } from "./db";

const SEASON_COLOR: Record<string, string> = {
  été: "var(--color-blush)",
  automne: "var(--color-autumn-orange)",
  hiver: "var(--color-brown)",
  printemps: "var(--color-blush-deep)",
};

export function recipeAccentColor(recipe: { tags: Tag[] }): string {
  const seasonTag = recipe.tags.find((t) => t.category === "saison");
  return seasonTag ? SEASON_COLOR[seasonTag.name] ?? "var(--color-groseille)" : "var(--color-groseille)";
}
