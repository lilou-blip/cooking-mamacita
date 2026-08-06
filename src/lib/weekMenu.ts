import type { Menu } from "./db";

/** Choisit le menu "semaine" le plus pertinent pour la semaine en cours (chevauche lundi-dimanche, sinon le plus proche). */
export function pickCurrentWeekMenu(menus: Menu[]): Menu | null {
  const weekly = menus.filter((m) => m.menu_type === "semaine");
  if (weekly.length === 0) return null;

  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const inRange = weekly.find((m) => {
    if (!m.event_date) return false;
    const d = new Date(m.event_date);
    return d >= monday && d <= sunday;
  });
  if (inRange) return inRange;

  const withDate = weekly.filter((m) => m.event_date);
  if (withDate.length > 0) {
    return withDate.reduce((closest, m) =>
      Math.abs(new Date(m.event_date!).getTime() - now.getTime()) <
      Math.abs(new Date(closest.event_date!).getTime() - now.getTime())
        ? m
        : closest,
    );
  }

  return weekly[0];
}
