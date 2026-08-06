import { describe, expect, it } from "vitest";
import { ingredientFamily, ingredientMatchesStaple, singularize } from "./ingredientMatching";

describe("singularize", () => {
  it("strips a trailing s on words longer than 3 letters", () => {
    expect(singularize("oeufs")).toBe("oeuf");
    expect(singularize("tomates")).toBe("tomate");
  });

  it("leaves short words untouched, even ending in s", () => {
    expect(singularize("as")).toBe("as");
  });

  it("leaves words with no trailing s untouched", () => {
    expect(singularize("riz")).toBe("riz");
    expect(singularize("noix")).toBe("noix");
  });
});

describe("ingredientMatchesStaple", () => {
  it("matches an exact name", () => {
    expect(ingredientMatchesStaple("beurre", "beurre")).toBe(true);
  });

  it("matches a qualified variant ('beurre mou' -> 'beurre')", () => {
    expect(ingredientMatchesStaple("beurre mou", "beurre")).toBe(true);
  });

  it("matches across singular/plural in either direction", () => {
    expect(ingredientMatchesStaple("oeuf", "oeufs")).toBe(true);
    expect(ingredientMatchesStaple("oeufs bio", "oeufs")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(ingredientMatchesStaple("Beurre Mou", "beurre")).toBe(true);
  });

  it("does not match unrelated ingredients", () => {
    expect(ingredientMatchesStaple("farine", "beurre")).toBe(false);
    expect(ingredientMatchesStaple("beurre", "oeufs")).toBe(false);
  });
});

describe("ingredientFamily", () => {
  it("keeps a single-word name as-is (singularized)", () => {
    expect(ingredientFamily("oeufs")).toBe("oeuf");
  });

  it("reduces a qualified name to its first word", () => {
    expect(ingredientFamily("beurre mou")).toBe("beurre");
    expect(ingredientFamily("chocolat noir 70%")).toBe("chocolat");
  });

  it("lets two variants of the same product converge to the same family", () => {
    expect(ingredientFamily("beurre mou")).toBe(ingredientFamily("beurre"));
    expect(ingredientFamily("oeufs")).toBe(ingredientFamily("oeuf bio"));
  });
});
