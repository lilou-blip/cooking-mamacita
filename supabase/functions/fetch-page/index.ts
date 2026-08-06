const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FETCH_BYTES = 2_000_000;
const MAX_TEXT_CHARS = 15_000;
const BLOCK_TAGS = new Set(["p", "br", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5"]);

/** Le JWT a déjà été vérifié (signature) par la plateforme Supabase avant d'invoquer la fonction : ici on
 * lit juste son rôle pour rejeter les appels non authentifiés (clé publique "anon" sans utilisateur connecté). */
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

/** Retire les balises <script>/<style> (contenu inclus) et toutes les autres balises HTML d'une page,
 * en insérant un saut de ligne aux séparations de blocs pour garder une structure lisible par l'IA. */
function stripHtml(html: string): string {
  let out = "";
  let rest = html;
  let skipping: "script" | "style" | null = null;

  let ltIndex: number;
  while ((ltIndex = rest.indexOf("<")) !== -1) {
    const text = rest.slice(0, ltIndex);
    if (!skipping && text.trim() !== "") out += text + " ";

    const afterLt = rest.slice(ltIndex + 1);
    const gtIndex = afterLt.indexOf(">");
    if (gtIndex === -1) break;

    const tagContent = afterLt.slice(0, gtIndex).toLowerCase();
    const isClosing = tagContent.startsWith("/");
    const namePart = isClosing ? tagContent.slice(1) : tagContent;
    const match = namePart.match(/^[a-z0-9]+/);
    const tagName = match ? match[0] : "";

    if (skipping) {
      if (isClosing && tagName === skipping) skipping = null;
    } else if (!isClosing && (tagName === "script" || tagName === "style")) {
      skipping = tagName as "script" | "style";
    } else if (BLOCK_TAGS.has(tagName)) {
      out += "\n";
    }

    rest = afterLt.slice(gtIndex + 1);
  }
  if (!skipping) out += rest;
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function normalizeWhitespace(s: string): string {
  let out = "";
  let lastChar: string | null = null;
  for (const c of s) {
    if (c === "\n") {
      if (lastChar !== "\n") {
        out += "\n";
        lastChar = "\n";
      }
    } else if (/\s/.test(c)) {
      if (lastChar !== " " && lastChar !== "\n") {
        out += " ";
        lastChar = " ";
      }
    } else {
      out += c;
      lastChar = c;
    }
  }
  return out.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!isAuthenticatedRequest(req)) {
      return new Response(JSON.stringify({ error: "Connecte-toi pour importer une recette." }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { url } = await req.json();
    if (typeof url !== "string" || !(url.startsWith("http://") || url.startsWith("https://"))) {
      throw new Error("L'URL doit commencer par http:// ou https://");
    }

    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; CookingMamacita/1.0)" },
    });
    if (!res.ok) throw new Error(`La page a répondu avec le statut ${res.status}`);

    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      while (total < MAX_FETCH_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
      reader.cancel().catch(() => {});
    }
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buf.set(chunk, offset);
      offset += chunk.length;
    }

    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const normalized = normalizeWhitespace(decodeEntities(stripHtml(html)));
    const truncated = normalized.slice(0, MAX_TEXT_CHARS);

    if (truncated.trim() === "") throw new Error("Aucun texte exploitable n'a été trouvé sur cette page.");

    return new Response(JSON.stringify({ text: truncated }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
