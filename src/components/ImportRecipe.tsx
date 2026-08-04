import { useState, type FormEvent } from "react";
import { structureRecipeFromText, type RecipeDraft } from "../lib/ollama";
import "./ImportRecipe.css";

interface ImportRecipeProps {
  onDrafted: (draft: RecipeDraft) => void;
  onCancel: () => void;
}

export function ImportRecipe({ onDrafted, onCancel }: ImportRecipeProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        Colle le texte d'une recette (depuis un site, une photo transcrite, etc.) et l'IA locale va la structurer
        pour toi — titre, ingrédients, étapes et tags.
      </p>

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
