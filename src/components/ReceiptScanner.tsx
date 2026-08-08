import { useEffect, useRef, useState } from "react";
import { createPantryItem, listStorageUnits, type StorageUnit } from "../lib/db";
import { scanReceipt, type ReceiptItem } from "../lib/assistant";
import "./ReceiptScanner.css";

interface ReceiptScannerProps {
  onDone: () => void;
  onCancel: () => void;
}

interface DraftItem extends ReceiptItem {
  included: boolean;
  storageUnitId: number | "";
  expiresAt: string;
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

/** Aujourd'hui + N jours, au format attendu par un <input type="date">. */
function estimateExpiryDate(days: number | null): string {
  if (days == null) return "";
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function toDraftItems(found: ReceiptItem[], storageUnits: StorageUnit[]): DraftItem[] {
  return found.map((i) => {
    const matched = i.suggested_storage ? storageUnits.find((u) => u.name === i.suggested_storage) : undefined;
    return {
      ...i,
      included: true,
      storageUnitId: matched ? matched.id : "",
      expiresAt: estimateExpiryDate(i.shelf_life_days),
    };
  });
}

export function ReceiptScanner({ onDone, onCancel }: ReceiptScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [items, setItems] = useState<DraftItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    listStorageUnits()
      .then(setStorageUnits)
      .catch(() => {
        // Pas bloquant : les suggestions d'emplacement seront simplement absentes.
      });
  }, []);

  async function handleFile(file: File) {
    setScanning(true);
    setError(null);
    setItems(null);
    try {
      const base64 = await fileToBase64(file);
      const mediaType = file.type || "image/jpeg";
      const found = await scanReceipt(base64, mediaType, storageUnits.map((u) => u.name));
      if (found.length === 0) {
        setError("Aucun article reconnu sur cette photo. Réessaie avec une photo plus nette et bien cadrée.");
      }
      setItems(toDraftItems(found, storageUnits));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  async function handlePdfFile(file: File) {
    setScanning(true);
    setError(null);
    setItems(null);
    try {
      const { renderFirstPdfPageToImage } = await import("../lib/pdfReceipt");
      const { base64, mediaType } = await renderFirstPdfPageToImage(file);
      const found = await scanReceipt(base64, mediaType, storageUnits.map((u) => u.name));
      if (found.length === 0) {
        setError("Aucun article reconnu dans ce PDF. Réessaie avec un export plus net (première page = le ticket).");
      }
      setItems(toDraftItems(found, storageUnits));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  // Point d'entrée commun pour un fichier lâché en drag & drop (photo ou PDF, on ne peut pas se fier à un
  // input file dédié comme sur mobile) : on route selon le type MIME plutôt que de demander à l'utilisateur.
  function handleIncomingFile(file: File) {
    if (file.type === "application/pdf") void handlePdfFile(file);
    else void handleFile(file);
  }

  function toggleIncluded(index: number) {
    setItems((prev) => prev?.map((it, i) => (i === index ? { ...it, included: !it.included } : it)) ?? null);
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev?.map((it, i) => (i === index ? { ...it, ...patch } : it)) ?? null);
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
          ingredient_category: item.category ?? "autre",
          quantity: item.quantity ?? 1,
          unit_abbreviation: null,
          storage_unit_id: item.storageUnitId || null,
          expires_at: item.expiresAt || null,
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
          <div
            className={`receipt-scanner__dropzone${dragging ? " receipt-scanner__dropzone--active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleIncomingFile(file);
            }}
          >
            <p className="receipt-scanner__hint">
              Prends une photo bien cadrée et lisible du ticket, importe un PDF (export drive/e-ticket), ou
              glisse-dépose directement le fichier ici — Mamacita en extrait automatiquement les articles.
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
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePdfFile(file);
              }}
            />
            <div className="receipt-scanner__source-actions">
              <button type="button" className="form-submit" onClick={() => inputRef.current?.click()} disabled={scanning}>
                {scanning ? "Lecture du ticket... (10-30s)" : "📸 Prendre une photo"}
              </button>
              <button type="button" className="form-cancel" onClick={() => pdfInputRef.current?.click()} disabled={scanning}>
                📄 Importer un PDF
              </button>
            </div>
          </div>
        )}

        {error && <p className="form-error">{error}</p>}

        {items != null && items.length > 0 && (
          <>
            <p className="receipt-scanner__hint">
              Emplacement et date estimés automatiquement — ajuste si besoin avant d'ajouter au garde-manger.
            </p>
            <ul className="receipt-scanner__items">
              {items.map((item, i) => (
                <li key={i} className="receipt-scanner__item">
                  <div className="receipt-scanner__item-main">
                    <input type="checkbox" checked={item.included} onChange={() => toggleIncluded(i)} />
                    <span className="receipt-scanner__name">{item.name}</span>
                    {item.quantity != null && <span className="receipt-scanner__qty">×{item.quantity}</span>}
                    {item.price != null && <span className="receipt-scanner__price">{item.price.toFixed(2)} €</span>}
                  </div>
                  {item.included && (
                    <div className="receipt-scanner__item-details">
                      <select
                        value={item.storageUnitId}
                        onChange={(e) => updateItem(i, { storageUnitId: e.target.value ? Number(e.target.value) : "" })}
                        aria-label={`Emplacement pour ${item.name}`}
                      >
                        <option value="">Emplacement</option>
                        {storageUnits.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={item.expiresAt}
                        onChange={(e) => updateItem(i, { expiresAt: e.target.value })}
                        aria-label={`Date de péremption pour ${item.name}`}
                      />
                    </div>
                  )}
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
