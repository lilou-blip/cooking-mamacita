const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-haiku-4-5-20251001";

/** Le JWT a déjà été vérifié (signature) par la plateforme Supabase avant d'invoquer la fonction : ici on
 * lit juste son rôle pour rejeter les appels non authentifiés (clé publique "anon" sans utilisateur connecté),
 * afin qu'un tiers ne puisse pas consommer le crédit Anthropic sans être connecté à l'app. */
function isAuthenticatedRequest(req: Request): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) return false;
  try {
    const payload = JSON.parse(atob(payloadSegment.replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "authenticated";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!isAuthenticatedRequest(req)) {
      return new Response(JSON.stringify({ error: "Connecte-toi pour utiliser l'assistante." }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY n'est pas configurée sur ce projet Supabase (Edge Functions > Secrets).");
    }

    const { systemPrompt, userMessage, numPredict, image, mediaType } = await req.json();
    if (typeof systemPrompt !== "string" || typeof userMessage !== "string") {
      throw new Error("systemPrompt et userMessage sont requis.");
    }

    // Pour le scan de ticket de caisse : une image en base64 (sans le préfixe "data:...;base64,") peut être
    // jointe au message, Claude sait lire une photo directement (pas besoin d'OCR séparé).
    const userContent: Record<string, unknown>[] = [];
    if (typeof image === "string" && typeof mediaType === "string") {
      userContent.push({ type: "image", source: { type: "base64", media_type: mediaType, data: image } });
    }
    userContent.push({ type: "text", text: userMessage });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: typeof numPredict === "number" ? numPredict : 400,
        system: systemPrompt,
        // Anthropic n'a pas d'équivalent au mode JSON strict d'Ollama : on force la réponse à commencer
        // par "{" (préremplissage de l'échange) pour fiabiliser une sortie JSON pure, sans texte autour.
        messages: [
          { role: "user", content: userContent },
          { role: "assistant", content: "{" },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Anthropic a répondu avec le statut ${res.status} : ${detail}`);
    }

    const data = await res.json();
    const continuation: string | undefined = data.content?.[0]?.text;
    if (continuation == null) throw new Error("Réponse Anthropic invalide");
    const content = "{" + continuation;

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
