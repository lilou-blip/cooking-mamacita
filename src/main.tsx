import React from "react";
import ReactDOM from "react-dom/client";
import { AuthGate } from "./AuthGate";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/forms.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>,
);
