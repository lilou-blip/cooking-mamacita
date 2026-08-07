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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{shareMatch ? <SharedRecipePage token={shareMatch[1]} /> : <AuthGate />}</React.StrictMode>,
);
