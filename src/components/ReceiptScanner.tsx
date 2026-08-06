import { useRef, useState } from "react";
import { createPantryItem } from "../lib/db";
import { scanReceipt, type ReceiptItem } from "../lib/ollama";
import "./ReceiptScanner.css";

interface ReceiptScannerProps {
  onDone: () => void;
  onCancel: () => void;
}

interface DraftItem extends ReceiptItem {
  included: boolean;
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

export function ReceiptScanner({ onDone, onCancel }: ReceiptScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [items, setItems] = useState<DraftItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setScanning(true);
    setError(null);
    setItems(null);
    try {
      const base64 = await fileToBase64(file);
      const mediaType = file.type || "image/jpeg";
      const found = await scanReceipt(base64, mediaType);
      if (found.length === 0) {
        setError("Aucun article reconnu sur cette photo. Réessaie avec une photo plus nette et bien cadrée.");
      }
      setItems(found.map((i) => ({ ...i, included: true })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  function toggleIncluded(index: number) {
    setItems((prev) => prev?.map((it, i) => (i === index ? { ...it, included: !it.included } : it)) ?? null);
  }

  async function handleAddToPantry() {
    if (!items) return;
    const toAdd = items.filter((i) => i.included);
    if (toAdd.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (const item of toAdd) {
        await createPantryItem({
          ingredient_name: item.name,
          quantity: item.quantity ?? 1,
          unit_abbreviation: null,
          assignments: [],
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="receipt-scanner">
      <div className="receipt-scanner__panel">
        <button type="button" className="receipt-scanner__close" onClick={onCancel} aria-label="Fermer">
          ×
        </button>
        <h2>Scanner un ticket de caisse</h2>

        {items == null && (
          <>
            <p className="receipt-scanner__hint">
              Prends une photo bien cadrée et lisible du ticket — Mamacita en extrait automatiquement les articles.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <button type="button" className="form-submit" onClick={() => inputRef.current?.click()} disabled={scanning}>
              {scanning ? "Lecture du ticket... (10-30s)" : "📸 Prendre une photo"}
            </button>
          </>
        )}

        {error && <p className="form-error">{error}</p>}

        {items != null && items.length > 0 && (
          <>
            <ul className="receipt-scanner__items">
              {items.map((item, i) => (
                <li key={i} className="receipt-scanner__item">
                  <input type="checkbox" checked={item.included} onChange={() => toggleIncluded(i)} />
                  <span className="receipt-scanner__name">{item.name}</span>
                  {item.quantity != null && <span className="receipt-scanner__qty">×{item.quantity}</span>}
                  {item.price != null && <span className="receipt-scanner__price">{item.price.toFixed(2)} €</span>}
                </li>
              ))}
            </ul>
            <div className="receipt-scanner__actions">
              <button type="button" className="form-cancel" onClick={onCancel} disabled={saving}>
                Annuler
              </button>
              <button
                type="button"
                className="form-submit"
                onClick={handleAddToPantry}
                disabled={saving || items.every((i) => !i.included)}
              >
                {saving ? "Ajout..." : "Ajouter au garde-manger"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
