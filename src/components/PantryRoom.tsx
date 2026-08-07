import { useCallback, useEffect, useState } from "react";
import { createStorageUnit, deleteStorageUnit, listPantryItems, listStorageUnits, type PantryItem, type StorageUnit } from "../lib/db";
import { getStorageIllustration, getStorageOpenBackground } from "../lib/storageIllustrations";
import { generateVideFrigoRecipe, type RecipeDraft } from "../lib/ollama";
import pantryBackground from "../assets/illustrations/pantry-background.webp";
import { Pantry } from "./Pantry";
import { StorageUnitForm } from "./StorageUnitForm";
import { ReceiptScanner } from "./ReceiptScanner";
import { ConfirmDialog } from "./ConfirmDialog";
import { useIsMobile } from "../lib/useIsMobile";
import { LoadingScreen } from "./LoadingScreen";
import "./PantryRoom.css";

interface PantryRoomProps {
  onBack: () => void;
  onSuggestRecipe: (draft: RecipeDraft) => void;
}

type UnitStatus = "expired" | "soon" | null;

function worstStatus(items: PantryItem[], unitId: number): UnitStatus {
  let status: UnitStatus = null;
  for (const item of items) {
    if (item.storage_unit_id !== unitId || !item.expires_at) continue;
    const days = (new Date(item.expires_at).getTime() - Date.now()) / 86_400_000;
    if (days < 0) return "expired";
    if (days <= 3) status = "soon";
  }
  return status;
}

export function PantryRoom({ onBack, onSuggestRecipe }: PantryRoomProps) {
  const isMobile = useIsMobile(640); // le scan de ticket suppose un appareil photo à portée de main
  const [units, setUnits] = useState<StorageUnit[]>([]);
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeUnitId, setActiveUnitId] = useState<number | "all" | null>(null);
  const [videFrigoLoading, setVideFrigoLoading] = useState(false);
  const [videFrigoError, setVideFrigoError] = useState<string | null>(null);
  const [showReceiptScanner, setShowReceiptScanner] = useState(false);
  const [confirmingDeleteUnit, setConfirmingDeleteUnit] = useState<StorageUnit | null>(null);

  const refresh = useCallback(async () => {
    const [unitList, itemList] = await Promise.all([listStorageUnits(), listPantryItems()]);
    setUnits(unitList);
    setItems(itemList);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  async function handleCreateUnit(input: { name: string; illustration: string | null }) {
    await createStorageUnit(input);
    setShowForm(false);
    await refresh();
  }

  async function handleVideFrigo() {
    setVideFrigoLoading(true);
    setVideFrigoError(null);
    try {
      const sorted = [...items].sort((a, b) => {
        if (a.expires_at && b.expires_at) return a.expires_at.localeCompare(b.expires_at);
        if (a.expires_at) return -1;
        if (b.expires_at) return 1;
        return 0;
      });
      const seen = new Set<string>();
      const picked: { name: string; daysLeft: number | null }[] = [];
      for (const item of sorted) {
        const key = item.ingredient_name.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const daysLeft = item.expires_at ? (new Date(item.expires_at).getTime() - Date.now()) / 86_400_000 : null;
        picked.push({ name: item.ingredient_name, daysLeft });
        if (picked.length >= 12) break;
      }
      if (picked.length === 0) {
        setVideFrigoError("Ton garde-manger est vide, ajoute des aliments d'abord !");
        return;
      }
      const draft = await generateVideFrigoRecipe(picked);
      onSuggestRecipe(draft);
    } catch (err) {
      setVideFrigoError(String(err));
    } finally {
      setVideFrigoLoading(false);
    }
  }

  async function confirmDeleteUnit() {
    if (!confirmingDeleteUnit) return;
    await deleteStorageUnit(confirmingDeleteUnit.id);
    setConfirmingDeleteUnit(null);
    await refresh();
  }

  if (activeUnitId !== null) {
    const activeUnit = activeUnitId === "all" ? null : units.find((u) => u.id === activeUnitId) ?? null;
    return (
      <Pantry
        initialUnitId={activeUnit?.id ?? null}
        onBack={() => {
          setActiveUnitId(null);
          refresh();
        }}
        backgroundSrc={getStorageOpenBackground(activeUnit?.illustration ?? null) ?? pantryBackground}
        title={activeUnit?.name ?? "Garde-manger"}
      />
    );
  }

  if (loading) return <LoadingScreen message="Chargement du garde-manger..." />;

  return (
    <div className="pantry-room" style={{ backgroundImage: `url(${pantryBackground})` }}>
      <button className="pantry-room__back" onClick={onBack}>
        ← Table
      </button>
      <h1 className="pantry-room__title">Garde manger</h1>

      <div className="pantry-room__top-actions">
        {units.length > 0 && (
          <button className="pantry-room__action" onClick={() => setActiveUnitId("all")}>
            Voir tout
          </button>
        )}
        <button className="pantry-room__action" onClick={() => setShowForm(true)}>
          + Ajouter un meuble
        </button>
        <button className="pantry-room__action" onClick={handleVideFrigo} disabled={videFrigoLoading}>
          {videFrigoLoading ? "Mamacita réfléchit... (10-30s)" : "🥕 Idée anti-gaspi"}
        </button>
        {isMobile && (
          <button className="pantry-room__action" onClick={() => setShowReceiptScanner(true)}>
            📸 Scanner un ticket
          </button>
        )}
      </div>
      {videFrigoError && <p className="pantry-room__vide-frigo-error">{videFrigoError}</p>}

      <div className="pantry-room__floor">
        {units.map((unit) => {
          const src = getStorageIllustration(unit.illustration);
          const status = worstStatus(items, unit.id);
          return (
            <div key={unit.id} className="pantry-room__unit">
              <button
                type="button"
                className="pantry-room__unit-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingDeleteUnit(unit);
                }}
                aria-label={`Supprimer ${unit.name}`}
                title={`Supprimer ${unit.name}`}
              >
                ×
              </button>
              <button
                type="button"
                className="pantry-room__unit-main"
                onClick={() => setActiveUnitId(unit.id)}
                aria-label={unit.name}
                title={unit.name}
              >
                {status && (
                  <span
                    className={`pantry-room__unit-badge pantry-room__unit-badge--${status}`}
                    title={status === "expired" ? "Contient un aliment périmé" : "Contient un aliment bientôt périmé"}
                  />
                )}
                {src ? (
                  <img src={src} alt="" className="pantry-room__unit-image" />
                ) : (
                  <span className="pantry-room__unit-fallback">{unit.name}</span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="pantry-room__form-overlay" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <StorageUnitForm onCreated={handleCreateUnit} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}

      {showReceiptScanner && (
        <ReceiptScanner
          onCancel={() => setShowReceiptScanner(false)}
          onDone={() => {
            setShowReceiptScanner(false);
            refresh();
          }}
        />
      )}

      {confirmingDeleteUnit && (
        <ConfirmDialog
          message={`Supprimer le meuble "${confirmingDeleteUnit.name}" ? Les aliments qu'il contient resteront dans le garde-manger, juste sans emplacement.`}
          onConfirm={confirmDeleteUnit}
          onCancel={() => setConfirmingDeleteUnit(null)}
        />
      )}
    </div>
  );
}
