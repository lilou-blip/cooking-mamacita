/** Formate une quantité + unité pour l'affichage ("25 g ", "2 " si pas d'unité), avec un espace de fin
 * pour s'enchaîner directement avec le nom de l'ingrédient qui suit. */
export function formatQuantityPrefix(quantity: number | null, unit: string | null): string {
  if (quantity == null) return "";
  const qty = Math.round(quantity * 100) / 100;
  return unit ? `${qty} ${unit} ` : `${qty} `;
}
