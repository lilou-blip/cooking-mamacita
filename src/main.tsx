import React from "react";
import ReactDOM from "react-dom/client";
import { AuthGate } from "./AuthGate";
import { SharedRecipePage } from "./components/SharedRecipePage";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/forms.css";
import "./index.css";

// Un lien de partage de recette (/share/:token) est public et ne demande pas de compte : on le détecte
// avant l'écran de connexion plutôt que de passer par un vrai routeur pour cette unique route.
const shareMatch = window.location.pathname.match(/^\/share\/([^/]+)/);

// Cible du partage natif (/share-target?title=&text=&url=, voir vite.config.ts) : contrairement au lien
// de partage ci-dessus, importer une recette suppose un compte, donc on transmet juste la charge utile à
// AuthGate → App plutôt que de contourner la connexion.
const shareTargetMatch = window.location.pathname === "/share-target";
const sharedImport = shareTargetMatch
  ? (() => {
      const params = new URLSearchParams(window.location.search);
      const url = params.get("url")?.trim();
      const text = params.get("text")?.trim();
      if (!url && !text) return null;
      return { url: url || undefined, text: text || undefined };
    })()
  : null;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {shareMatch ? <SharedRecipePage token={shareMatch[1]} /> : <AuthGate initialSharedImport={sharedImport} />}
  </React.StrictMode>,
);
