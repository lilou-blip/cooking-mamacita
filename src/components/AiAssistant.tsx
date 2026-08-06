import { useEffect, useRef, useState } from "react";
import {
  getConsumptionByCategory,
  getMenuById,
  getOrCreateStandaloneShoppingList,
  getShoppingListById,
  listMenus,
  listPantryItems,
  listProfiles,
  listRecipesWithTags,
} from "../lib/db";
import { pickCurrentWeekMenu } from "../lib/weekMenu";
import { chatWithAssistant, type AssistantMessage } from "../lib/ollama";
import { INGREDIENT_CATEGORIES } from "../lib/constants";
import assistantAvatar from "../assets/illustrations/ai-assistant.webp";
import "./AiAssistant.css";

const CATEGORY_LABEL_BY_VALUE = Object.fromEntries(INGREDIENT_CATEGORIES.map((c) => [c.value, c.label]));

type Section = "table" | "carnet" | "pantry" | "menus" | "stats" | "shopping" | "batch";

interface AiAssistantProps {
  section: Section;
  currentRecipeTitle?: string;
}

async function buildHouseholdContext(): Promise<string> {
  const profiles = await listProfiles();
  if (profiles.length === 0) return "";
  const list = profiles
    .map((p) => {
      const relation = p.relation ? `, ${p.relation}` : "";
      const notes = p.dietary_notes?.trim() ? ` — allergies/contraintes : ${p.dietary_notes.trim()}` : "";
      return `${p.name}${relation}${notes}`;
    })
    .join(" ; ");
  return `Composition du foyer (${profiles.length} personne(s)) : ${list}. Tiens compte de ces allergies/contraintes dans tes suggestions de recettes, sans jamais en inventer d'autres.`;
}

async function buildScreenContext(section: Section, currentRecipeTitle?: string): Promise<string> {
  switch (section) {
    case "carnet": {
      if (currentRecipeTitle) {
        return `L'utilisateur consulte la recette "${currentRecipeTitle}" dans son carnet.`;
      }
      const recipes = await listRecipesWithTags();
      return `L'utilisateur consulte le sommaire de son carnet de recettes (${recipes.length} recette(s) enregistrée(s)).`;
    }
    case "pantry": {
      const items = await listPantryItems();
      const now = Date.now();
      const soon = items.filter((i) => {
        if (!i.expires_at) return false;
        const days = (new Date(i.expires_at).getTime() - now) / 86_400_000;
        return days <= 3;
      });
      if (soon.length === 0) {
        return "L'utilisateur consulte son garde-manger. Rien n'arrive à péremption dans l'immédiat.";
      }
      const list = soon.map((i) => i.ingredient_name).join(", ");
      return `L'utilisateur consulte son garde-manger. Ces aliments arrivent bientôt à péremption ou sont déjà périmés : ${list}. Si l'un de ces ingrédients te fait penser à une recette simple, suggère-la.`;
    }
    case "menus": {
      const menus = await listMenus();
      const week = pickCurrentWeekMenu(menus);
      if (!week) return "L'utilisateur consulte ses menus. Aucun menu de la semaine n'est encore planifié.";
      const full = await getMenuById(week.id);
      if (!full || full.recipes.length === 0) {
        return `L'utilisateur consulte son menu de la semaine "${week.name}", qui est vide pour l'instant — aucune recette n'y a encore été ajoutée.`;
      }
      const days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
      const slots: Record<string, string> = {
        petit_dejeuner: "petit-déjeuner",
        dejeuner: "déjeuner",
        gouter: "goûter",
        diner: "dîner",
      };
      const list = full.recipes
        .map((r) => {
          const day = r.day_of_week != null ? days[r.day_of_week] : null;
          const slot = r.meal_slot ? slots[r.meal_slot] : null;
          const when = day && slot ? ` (${day} ${slot})` : "";
          return `"${r.title}"${when}`;
        })
        .join(", ");
      return `L'utilisateur consulte son menu de la semaine "${week.name}". Voici EXACTEMENT les recettes déjà planifiées, n'en invente aucune autre : ${list}.`;
    }
    case "stats": {
      const categories = await getConsumptionByCategory();
      if (categories.length === 0) return "L'utilisateur consulte ses statistiques, il n'y a pas encore assez de données.";
      const list = categories.map((c) => `${CATEGORY_LABEL_BY_VALUE[c.category] ?? c.category}: ${c.count}`).join(", ");
      return `L'utilisateur consulte ses statistiques de consommation par catégorie : ${list}. Si une catégorie comme les légumes semble sous-représentée par rapport aux autres, tu peux le lui signaler gentiment.`;
    }
    case "shopping": {
      const id = await getOrCreateStandaloneShoppingList();
      const list = await getShoppingListById(id);
      const items = list?.items ?? [];
      if (items.length === 0) return "L'utilisateur consulte sa liste de courses libre, elle est vide pour l'instant.";
      const summary = items
        .map((i) => `${i.ingredient_name}${i.checked ? " (coché)" : ""}`)
        .join(", ");
      const uncheckedCount = items.filter((i) => !i.checked).length;
      return `L'utilisateur consulte sa liste de courses libre. Voici EXACTEMENT son contenu, n'en invente aucun autre article : ${summary}. Il reste ${uncheckedCount} article(s) non coché(s).`;
    }
    case "batch":
      return "L'utilisateur est sur l'écran de batch cooking, en train d'organiser une séance pour cuisiner plusieurs recettes à la fois.";
    default:
      return "L'utilisateur est sur l'écran d'accueil de l'application, il n'a encore rien ouvert.";
  }
}

async function buildContext(section: Section, currentRecipeTitle?: string): Promise<string> {
  const [household, screen] = await Promise.all([
    buildHouseholdContext(),
    buildScreenContext(section, currentRecipeTitle),
  ]);
  return household ? `${household}\n\n${screen}` : screen;
}

export function AiAssistant({ section, currentRecipeTitle }: AiAssistantProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasTipped = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || hasTipped.current) return;
    hasTipped.current = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const context = await buildContext(section, currentRecipeTitle);
        const reply = await chatWithAssistant(
          context,
          [],
          "Donne-moi spontanément un petit conseil ou une suggestion utile par rapport à ce que je regarde en ce moment, sans que je te pose de question. Sois brève et chaleureuse.",
        );
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages: AssistantMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const context = await buildContext(section, currentRecipeTitle);
      const reply = await chatWithAssistant(context, messages, text);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ai-assistant">
      {open && (
        <div className="ai-assistant__panel">
          <div className="ai-assistant__header">
            <img src={assistantAvatar} alt="" className="ai-assistant__header-avatar" />
            <span>Mamacita</span>
            <button type="button" className="ai-assistant__close" onClick={() => setOpen(false)} aria-label="Fermer">
              ×
            </button>
          </div>

          <div className="ai-assistant__messages">
            {messages.length === 0 && !loading && (
              <p className="ai-assistant__empty">Pose-moi une question, ou attends mon petit conseil...</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`ai-assistant__bubble ai-assistant__bubble--${m.role}`}>
                {m.content}
              </div>
            ))}
            {loading && <div className="ai-assistant__bubble ai-assistant__bubble--assistant">Mamacita réfléchit...</div>}
            {error && <p className="form-error">{error}</p>}
            <div ref={messagesEndRef} />
          </div>

          <div className="ai-assistant__input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              placeholder="Écris à Mamacita..."
              disabled={loading}
            />
            <button type="button" onClick={handleSend} disabled={loading || !input.trim()}>
              Envoyer
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="ai-assistant__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fermer l'assistante" : "Ouvrir l'assistante"}
      >
        <img src={assistantAvatar} alt="Mamacita" />
      </button>
    </div>
  );
}
