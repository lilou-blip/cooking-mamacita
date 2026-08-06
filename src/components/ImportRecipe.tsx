import { useState, type FormEvent } from "react";
import { fetchRecipeTextFromUrl, structureRecipeFromText, type RecipeDraft } from "../lib/ollama";
import "./ImportRecipe.css";

interface ImportRecipeProps {
  onDrafted: (draft: RecipeDraft) => void;
  onCancel: () => void;
}

export function ImportRecipe({ onDrafted, onCancel }: ImportRecipeProps) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFetchUrl() {
    if (!url.trim()) return;
    setFetchingUrl(true);
    setError(null);
    try {
      const fetchedText = await fetchRecipeTextFromUrl(url.trim());
      setText(fetchedText);
    } catch (err) {
      setError(String(err));
    } finally {
      setFetchingUrl(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const draft = await structureRecipeFromText(text.trim());
      onDrafted(draft);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="import-recipe" onSubmit={handleSubmit}>
      <h1>Importer une recette avec l'IA ✨</h1>
      <p className="import-recipe__hint">
        Colle le texte d'une recette (depuis un site, une photo transcrite, etc.), ou récupère-le automatiquement
        depuis une URL — y compris un post Instagram/TikTok/Facebook <em>public</em> dont la légende contient la
        recette — et l'IA la structure pour toi : titre, ingrédients, étapes et tags.
      </p>

      <div className="import-recipe__url-row">
        <input
          type="url"
          placeholder="https://exemple.fr/ma-recette"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={fetchingUrl || loading}
        />
        <button type="button" className="form-cancel" onClick={handleFetchUrl} disabled={fetchingUrl || loading || !url.trim()}>
          {fetchingUrl ? "Récupération..." : "🔗 Récupérer le texte"}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Colle ici le texte de la recette..."
        rows={12}
        disabled={loading}
      />

      <div className="import-recipe__actions">
        <button type="button" className="form-cancel" onClick={onCancel} disabled={loading}>
          Annuler
        </button>
        <button type="submit" className="form-submit" disabled={loading || !text.trim()}>
          {loading ? "L'IA structure la recette... (10-30s)" : "Structurer avec l'IA"}
        </button>
      </div>
    </form>
  );
}
