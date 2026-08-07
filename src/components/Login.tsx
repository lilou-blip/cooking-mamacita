import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import assistantAvatar from "../assets/illustrations/ai-assistant.webp";
import tableBackground from "../assets/illustrations/table-background.webp";
import "./Login.css";

type Mode = "signin" | "signup";

export function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupDone, setSignupDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setSignupDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login" style={{ backgroundImage: `url(${tableBackground})` }}>
      <form className="login__card" onSubmit={handleSubmit}>
        <img src={assistantAvatar} alt="" className="login__avatar" />
        <h1>Cooking Mamacita</h1>

        {signupDone ? (
          <p className="login__hint">
            Compte créé ! Vérifie ta boîte mail ({email}) pour confirmer ton adresse, puis connecte-toi.
          </p>
        ) : (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={loading}
            />
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={6}
              required
              disabled={loading}
            />

            {error && <p className="form-error">{error}</p>}

            <button type="submit" className="form-submit" disabled={loading}>
              {loading ? "..." : mode === "signin" ? "Se connecter" : "Créer mon compte"}
            </button>

            <button
              type="button"
              className="form-cancel"
              onClick={() => {
                setMode((m) => (m === "signin" ? "signup" : "signin"));
                setError(null);
              }}
              disabled={loading}
            >
              {mode === "signin" ? "Pas encore de compte ? En créer un" : "Déjà un compte ? Se connecter"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
