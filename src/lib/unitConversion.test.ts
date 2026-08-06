import { describe, expect, it } from "vitest";
import { createUnitConverter } from "./unitConversion";
import type { Unit } from "./db";

// Mêmes unités que celles insérées par le seed par défaut (supabase/migrations/0001_initial_schema.sql).
const UNITS: Unit[] = [
  { id: 1, name: "gramme", abbreviation: "g", unit_type: "masse", factor_to_base: 1 },
  { id: 2, name: "kilogramme", abbreviation: "kg", unit_type: "masse", factor_to_base: 1000 },
  { id: 3, name: "millilitre", abbreviation: "ml", unit_type: "volume", factor_to_base: 1 },
  { id: 4, name: "centilitre", abbreviation: "cl", unit_type: "volume", factor_to_base: 10 },
  { id: 5, name: "litre", abbreviation: "l", unit_type: "volume", factor_to_base: 1000 },
  { id: 6, name: "cuillère à soupe", abbreviation: "c. à s.", unit_type: "volume", factor_to_base: 15 },
  { id: 7, name: "pièce", abbreviation: "pièce", unit_type: "piece", factor_to_base: 1 },
];

describe("createUnitConverter / unitTypeOf", () => {
  const { unitTypeOf } = createUnitConverter(UNITS);

  it("treats a null unit as 'piece'", () => {
    expect(unitTypeOf(null)).toBe("piece");
  });

  it("resolves the type of a known unit", () => {
    expect(unitTypeOf(2)).toBe("masse");
    expect(unitTypeOf(5)).toBe("volume");
  });

  it("falls back to 'piece' for an unknown unit id", () => {
    expect(unitTypeOf(999)).toBe("piece");
  });
});

describe("createUnitConverter / toBase", () => {
  const { toBase } = createUnitConverter(UNITS);

  it("converts mass units to grams", () => {
    expect(toBase(2, 2)).toBe(2000); // 2 kg -> 2000 g
    expect(toBase(500, 1)).toBe(500); // 500 g -> 500 g
  });

  it("converts different volume units to a common base (ml), so they become comparable", () => {
    expect(toBase(1, 5)).toBe(1000); // 1 l -> 1000 ml
    expect(toBase(2, 6)).toBe(30); // 2 tbsp -> 30 ml
    expect(toBase(1, 5) > toBase(2, 6)).toBe(true); // 1 l d'huile > 2 c. à s. d'huile
  });

  it("passes the quantity through unchanged when there is no unit", () => {
    expect(toBase(3, null)).toBe(3);
  });

  it("passes the quantity through unchanged for an unknown unit id", () => {
    expect(toBase(3, 999)).toBe(3);
  });
});
