/** Détecte une durée ("10 min", "1h30", "20 minutes"...) dans le texte d'une étape de recette. */
export function extractDurationSeconds(text: string): number | null {
  const hourMatch = text.match(/(\d+)\s*h(?:eures?)?\s*(\d{1,2})?\b/i);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    const minutes = hourMatch[2] ? Number(hourMatch[2]) : 0;
    return hours * 3600 + minutes * 60;
  }
  const minMatch = text.match(/(\d+)\s*min(?:ute)?s?\b/i);
  if (minMatch) return Number(minMatch[1]) * 60;
  return null;
}

export function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
