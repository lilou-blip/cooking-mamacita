/**
 * Repères de tranches d'âge très généraux, inspirés des recommandations publiques françaises courantes
 * (type PNNS / "Manger Bouger"). Ce sont des indications générales grand public, PAS un avis médical ni
 * un plan nutritionnel personnalisé — en cas de besoin spécifique (croissance, pathologie...), le repère
 * à suivre est celui d'un professionnel de santé.
 */
export interface AgeBracketGuideline {
  label: string;
  minAge: number;
  maxAge: number | null;
  points: string[];
}

export const NUTRITION_GUIDELINES: AgeBracketGuideline[] = [
  {
    label: "Jeune enfant (0-3 ans)",
    minAge: 0,
    maxAge: 3,
    points: [
      "Besoins très spécifiques à cet âge (diversification, quantités adaptées) — mieux vaut se référer au pédiatre plutôt qu'à des repères généraux.",
      "Pas de sel ni de sucre ajoutés inutilement, pas de produits allégés.",
    ],
  },
  {
    label: "Enfant (4-11 ans)",
    minAge: 4,
    maxAge: 11,
    points: [
      "Au moins 5 fruits et légumes par jour (frais, surgelés ou en conserve).",
      "3 à 4 produits laitiers par jour (croissance osseuse).",
      "Féculents à chaque repas, selon l'appétit.",
      "Viande/poisson/œuf 1 fois par jour environ.",
      "Limiter les produits sucrés et gras sans les interdire.",
    ],
  },
  {
    label: "Ado (12-17 ans)",
    minAge: 12,
    maxAge: 17,
    points: [
      "Au moins 5 fruits et légumes par jour.",
      "3 produits laitiers par jour.",
      "Féculents à chaque repas selon l'appétit (besoins énergétiques élevés à cet âge).",
      "Viande/poisson/œuf 1 à 2 fois par jour.",
      "Limiter sodas, snacks gras/sucrés et grignotage.",
    ],
  },
  {
    label: "Adulte (18-64 ans)",
    minAge: 18,
    maxAge: 64,
    points: [
      "Au moins 5 fruits et légumes par jour.",
      "2 produits laitiers par jour.",
      "Féculents à chaque repas, en privilégiant les versions complètes/semi-complètes.",
      "Viande/poisson/œuf 1 à 2 fois par jour, en variant les sources et en limitant les viandes rouges/transformées.",
      "Matières grasses à limiter, en privilégiant les huiles végétales (olive, colza).",
      "Produits sucrés à limiter.",
    ],
  },
  {
    label: "Senior (65 ans et +)",
    minAge: 65,
    maxAge: null,
    points: [
      "Au moins 5 fruits et légumes par jour.",
      "3 à 4 produits laitiers par jour (prévention de l'ostéoporose).",
      "Attention à un apport suffisant en protéines (viande/poisson/œuf/légumineuses) pour limiter la perte musculaire.",
      "Bien s'hydrater même sans sensation de soif marquée.",
    ],
  },
];

export function guidelineForAge(age: number): AgeBracketGuideline | null {
  return NUTRITION_GUIDELINES.find((g) => age >= g.minAge && (g.maxAge == null || age <= g.maxAge)) ?? null;
}
