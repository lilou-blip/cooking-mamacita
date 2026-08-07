import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchRecipeTextFromUrl, structureRecipeFromImage, structureRecipeFromText, type RecipeDraft } from "../lib/assistant";
import "./ImportRecipe.css";

interface ImportRecipeProps {
  onDrafted: (draft: RecipeDraft) => void;
  onCancel: () => void;
  /** Préremplissage venu du partage natif (voir App.tsx / main.tsx) : une URL déclenche la récupération
   * automatique du texte, comme si on avait cliqué "Récupérer le texte" soi-même. */
  initialUrl?: string;
  initialText?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ImportRecipe({ onDrafted, onCancel, initialUrl, initialText }: ImportRecipeProps) {
  const [text, setText] = useState(initialText ?? "");
  const [url, setUrl] = useState(initialUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [scanningPhoto, setScanningPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  async function handlePhotoFile(file: File) {
    setScanningPhoto(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const draft = await structureRecipeFromImage(base64, file.type || "image/jpeg");
      onDrafted(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanningPhoto(false);
    }
  }

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

  // Arrivée avec une URL préremplie (partage natif) : lance la récupération tout de suite, comme si
  // on avait cliqué "Récupérer le texte" — pas de raison de faire ce clic en plus soi-même. Différé en
  // microtâche (plutôt qu'un appel direct) pour ne pas déclencher de setState synchrone en tête d'effet.
  useEffect(() => {
    if (initialUrl?.trim()) queueMicrotask(() => handleFetchUrl());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <h1>Importer une recette avec Mamacita ✨</h1>
      <p className="import-recipe__hint">
        Colle le texte d'une recette (depuis un site, une photo transcrite, etc.), ou récupère-le automatiquement
        depuis une URL — y compris un post Instagram/TikTok/Facebook <em>public</em> dont la légende contient la
        recette — et Mamacita la structure pour toi : titre, ingrédients, étapes et tags.
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

      <div className="import-recipe__photo-row">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handlePhotoFile(file);
          }}
        />
        <button
          type="button"
          className="form-cancel"
          onClick={() => photoInputRef.current?.click()}
          disabled={scanningPhoto || loading}
        >
          {scanningPhoto ? "Mamacita lit la photo... (10-30s)" : "📸 Scanner une recette papier"}
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
          {loading ? "Mamacita structure la recette... (10-30s)" : "Structurer avec Mamacita"}
        </button>
      </div>
    </form>
  );
}
