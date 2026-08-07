import { useCallback, useEffect, useState } from "react";
import {
  adjustPantryItemQuantity,
  consumePantryItem,
  deletePantryItem,
  listPantryItems,
  listProfiles,
  listStorageUnits,
  type PantryItem,
  type Profile,
  type StorageUnit,
} from "../lib/db";
import { PantryForm } from "./PantryForm";
import { PantryShelfItem } from "./PantryShelfItem";
import { LoadingScreen } from "./LoadingScreen";
import { ConfirmDialog } from "./ConfirmDialog";
import "./Pantry.css";

interface PantryProps {
  onBack: () => void;
  initialUnitId: number | null;
  backgroundSrc: string;
  title: string;
}

export function Pantry({ onBack, initialUnitId, backgroundSrc, title }: PantryProps) {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [consumingId, setConsumingId] = useState<number | null>(null);
  const [consumeValue, setConsumeValue] = useState("");
  const [consumeProfileId, setConsumeProfileId] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<{ id: number; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [itemList, profileList, unitList] = await Promise.all([listPantryItems(), listProfiles(), listStorageUnits()]);
    setItems(itemList);
    setProfiles(profileList);
    setStorageUnits(unitList);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  async function confirmDelete() {
    if (!confirmingDelete) return;
    setError(null);
    try {
      await deletePantryItem(confirmingDelete.id);
      setConfirmingDelete(null);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleAdjust(id: number, delta: number) {
    setError(null);
    try {
      await adjustPantryItemQuantity(id, delta);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function confirmConsume(item: PantryItem) {
    const qty = Number(consumeValue);
    if (!qty || qty <= 0) return;
    setError(null);
    try {
      await consumePantryItem(item.id, qty, consumeProfileId ? Number(consumeProfileId) : null);
      setConsumingId(null);
      setConsumeValue("");
      setConsumeProfileId("");
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  if (loading) return <LoadingScreen message="Chargement du garde-manger..." />;

  const visibleItems = items.filter((item) => initialUnitId === null || item.storage_unit_id === initialUnitId);

  return (
    <div className="pantry-themed" style={{ backgroundImage: `url(${backgroundSrc})` }} onClick={() => setConsumingId(null)}>
      <button className="pantry-themed__back" onClick={onBack}>
        ← Garde-manger
      </button>
      <button
        className="pantry-themed__add"
        onClick={(e) => {
          e.stopPropagation();
          setShowForm((v) => !v);
        }}
      >
        {showForm ? "Fermer" : "+ Ajouter"}
      </button>

      <h1 className="pantry-themed__title">{title}</h1>
      {error && <p className="form-error">{error}</p>}

      {showForm && (
        <div className="pantry-themed__form-overlay" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <PantryForm
              profiles={profiles}
              storageUnits={storageUnits}
              initialUnitId={initialUnitId}
              onCreated={async () => {
                setShowForm(false);
                await refresh();
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}

      <div className="pantry-themed__shelf">
        {visibleItems.length === 0 ? (
          <p className="pantry-themed__empty">
            {initialUnitId === null ? "Ton garde-manger est vide pour l'instant." : "Ce meuble est vide pour l'instant."}
          </p>
        ) : (
          visibleItems.map((item) => (
            <PantryShelfItem
              key={item.id}
              item={item}
              profiles={profiles}
              showLocation={initialUnitId === null}
              expanded={consumingId === item.id}
              onToggle={() => {
                if (consumingId === item.id) {
                  setConsumingId(null);
                } else {
                  setConsumingId(item.id);
                  setConsumeValue("");
                  setConsumeProfileId("");
                }
              }}
              consumeValue={consumeValue}
              onConsumeValueChange={setConsumeValue}
              consumeProfileId={consumeProfileId}
              onConsumeProfileChange={setConsumeProfileId}
              onConfirmConsume={() => confirmConsume(item)}
              onDelete={() => setConfirmingDelete({ id: item.id, title: item.ingredient_name })}
              onAdjust={(delta) => handleAdjust(item.id, delta)}
            />
          ))
        )}
      </div>
      {confirmingDelete && (
        <ConfirmDialog
          message={`Retirer "${confirmingDelete.title}" du garde-manger ?`}
          confirmLabel="Retirer"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(null)}
        />
      )}
    </div>
  );
}
