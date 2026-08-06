import { describe, expect, it } from "vitest";
import { valuesPlaceholders } from "./db";

// Génère les clauses VALUES des INSERT multi-lignes ajoutés lors du passage de perf (recipe_ingredients,
// recipe_steps, shopping_list_items...). Un décalage d'index ici insérerait silencieusement les mauvaises
// valeurs dans les mauvaises colonnes — critique à vérifier, contrairement au reste du fichier qui parle DB.
describe("valuesPlaceholders", () => {
  it("builds a single row", () => {
    expect(valuesPlaceholders(1, 3)).toBe("($1, $2, $3)");
  });

  it("builds multiple rows with contiguous, non-overlapping placeholder indices", () => {
    expect(valuesPlaceholders(3, 2)).toBe("($1, $2), ($3, $4), ($5, $6)");
  });

  it("handles a single column per row", () => {
    expect(valuesPlaceholders(4, 1)).toBe("($1), ($2), ($3), ($4)");
  });

  it("produces as many placeholders as rowCount * colCount, in order", () => {
    const clause = valuesPlaceholders(5, 6);
    const indices = [...clause.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(indices).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });
});
