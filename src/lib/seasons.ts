export type SeasonName = "printemps" | "été" | "automne" | "hiver";

const SEASON_EMOJI: Record<SeasonName, string> = {
  printemps: "🌸",
  été: "☀️",
  automne: "🍂",
  hiver: "❄️",
};

/** Saison météorologique actuelle (hémisphère nord), pour mettre en avant les recettes taguées en conséquence. */
export function getCurrentSeason(date = new Date()): SeasonName {
  const month = date.getMonth() + 1;
  if (month === 12 || month <= 2) return "hiver";
  if (month <= 5) return "printemps";
  if (month <= 8) return "été";
  return "automne";
}

export function seasonEmoji(season: SeasonName): string {
  return SEASON_EMOJI[season];
}
