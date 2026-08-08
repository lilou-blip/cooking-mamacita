/**
 * Arrondit une quantité "à acheter" (ce qu'il manque, pas la quantité exacte d'une recette) à une valeur
 * réaliste plutôt qu'un nombre à rallonge — personne ne pèse 227.5g de farine, 225g ou 230g c'est parfait.
 * Ne s'applique volontairement pas aux quantités affichées telles qu'écrites dans une recette : celles-là
 * doivent rester précises, l'arrondi humain ne concerne que "combien en prendre en plus".
 */
export function humanRoundQuantity(quantity: number, unitAbbreviation: string | null): number {
  if (quantity <= 0) return quantity;

  if (!unitAbbreviation || unitAbbreviation === "pièce") {
    // Compté à l'unité (oeufs, gousses d'ail...) : arrondi à la moitié la plus proche plutôt qu'un
    // nombre à virgule quelconque.
    const rounded = Math.round(quantity * 2) / 2;
    return rounded > 0 ? rounded : 0.5;
  }
  if (unitAbbreviation === "g" || unitAbbreviation === "ml") {
    const rounded = Math.round(quantity / 5) * 5;
    return rounded > 0 ? rounded : 5;
  }
  if (unitAbbreviation === "cl") {
    const rounded = Math.round(quantity);
    return rounded > 0 ? rounded : 1;
  }
  // kg, l, c. à c., c. à s., pincée... : déjà de petits nombres, un arrondi fin suffit.
  return Math.round(quantity * 100) / 100;
}
