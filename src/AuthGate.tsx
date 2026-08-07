import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { Login } from "./components/Login";
import { LoadingScreen } from "./components/LoadingScreen";
import App, { type SharedImportPayload } from "./App";

interface AuthGateProps {
  initialSharedImport?: SharedImportPayload | null;
}

export function AuthGate({ initialSharedImport }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      // Sans ce .catch, un rejet (ex: réseau indisponible au démarrage) laisserait loading à true
      // indéfiniment : l'appli resterait bloquée sur l'écran de chargement sans jamais l'atteindre.
      .catch(() => setSessionCheckFailed(true))
      .finally(() => setLoading(false));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  if (loading) return <LoadingScreen />;
  if (!session) return <Login initialError={sessionCheckFailed ? "Impossible de vérifier ta session. Vérifie ta connexion et reconnecte-toi." : undefined} />;
  return <App onLogout={() => supabase.auth.signOut()} initialSharedImport={initialSharedImport} />;
}
