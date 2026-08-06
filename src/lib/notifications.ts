import { listMenus, listPantryItems } from "./db";
import { pickCurrentWeekMenu } from "./weekMenu";

const EXPIRY_NOTIFIED_KEY = "mamacita:notified-expiry";
const WEEKLY_REMINDER_KEY = "mamacita:notified-weekly";

function getNotifiedExpirySet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPIRY_NOTIFIED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveNotifiedExpirySet(set: Set<string>) {
  localStorage.setItem(EXPIRY_NOTIFIED_KEY, JSON.stringify([...set]));
}

/** Semaine ISO (année + numéro de semaine), pour ne montrer le rappel de planification qu'une fois par semaine. */
function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

export function isNotificationSupported(): boolean {
  return typeof Notification !== "undefined" && "serviceWorker" in navigator;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return "denied";
  return Notification.requestPermission();
}

async function showNotification(title: string, options: NotificationOptions): Promise<void> {
  if (!isNotificationSupported() || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(title, { icon: "/pwa-192.png", badge: "/pwa-192.png", ...options });
}

/**
 * À appeler à chaque ouverture de l'app (si les notifications sont autorisées) : notifie les aliments qui
 * expirent bientôt (une seule fois par article) et rappelle une fois par semaine de planifier le menu.
 * Ce sont des notifications locales déclenchées à l'ouverture de l'app, pas des pushs reçus app fermée —
 * l'app doit avoir été ouverte au moins une fois dans la période concernée pour que le rappel parte.
 */
export async function checkAndNotify(): Promise<void> {
  if (!isNotificationSupported() || Notification.permission !== "granted") return;

  try {
    const items = await listPantryItems();
    const now = Date.now();
    const soon = items.filter((i) => {
      if (!i.expires_at) return false;
      const days = (new Date(i.expires_at).getTime() - now) / 86_400_000;
      return days >= 0 && days <= 1;
    });

    const notified = getNotifiedExpirySet();
    const toNotify = soon.filter((i) => !notified.has(`${i.id}:${i.expires_at}`));
    if (toNotify.length > 0) {
      const names = toNotify.map((i) => i.ingredient_name).join(", ");
      await showNotification("Ça arrive à péremption !", {
        body: `${names} — à utiliser vite pour ne rien gaspiller.`,
        tag: "expiry",
      });
      toNotify.forEach((i) => notified.add(`${i.id}:${i.expires_at}`));
      saveNotifiedExpirySet(notified);
    }
  } catch {
    // Le garde-manger n'a pas pu être chargé (hors-ligne...) : on retentera à la prochaine ouverture.
  }

  try {
    const currentWeek = isoWeekKey();
    if (localStorage.getItem(WEEKLY_REMINDER_KEY) !== currentWeek) {
      const menus = await listMenus();
      const weekMenu = pickCurrentWeekMenu(menus);
      if (!weekMenu) {
        await showNotification("Petit rappel de Mamacita", {
          body: "Le menu de la semaine n'est pas encore planifié — un petit tour dans l'app ?",
          tag: "weekly-menu",
        });
      }
      localStorage.setItem(WEEKLY_REMINDER_KEY, currentWeek);
    }
  } catch {
    // Idem, on retentera à la prochaine ouverture.
  }
}
