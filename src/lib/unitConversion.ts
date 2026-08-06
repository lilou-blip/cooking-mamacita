import type { Unit, UnitType } from "./db";

/**
 * Regroupe les conversions d'unités (vers g / ml / pièce selon le type) autour d'un référentiel d'unités donné.
 * Évite de recalculer la Map à chaque appel et de dupliquer cette logique partout où on compare des quantités.
 */
export function createUnitConverter(units: Unit[]) {
  const unitById = new Map(units.map((u) => [u.id, u]));

  function unitTypeOf(unitId: number | null): UnitType {
    if (unitId == null) return "piece";
    return unitById.get(unitId)?.unit_type ?? "piece";
  }

  // Convertit une quantité vers l'unité de base de son type (g / ml / pièce) pour pouvoir comparer des unités
  // différentes MAIS de même nature (ex: cuillère à soupe et litre se convertissent tous deux en ml).
  function toBase(quantity: number, unitId: number | null): number {
    const unit = unitId != null ? unitById.get(unitId) : undefined;
    return unit ? quantity * unit.factor_to_base : quantity;
  }

  return { unitById, unitTypeOf, toBase };
}
