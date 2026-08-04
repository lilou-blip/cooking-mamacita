import { useCallback, useEffect, useState } from "react";
import { createStorageUnit, deleteStorageUnit, listStorageUnits, type StorageUnit } from "../lib/db";
import { getStorageIllustration, getStorageOpenBackground } from "../lib/storageIllustrations";
import pantryBackground from "../assets/illustrations/pantry-background.png";
import { Pantry } from "./Pantry";
import { StorageUnitForm } from "./StorageUnitForm";
import "./PantryRoom.css";

interface PantryRoomProps {
  onBack: () => void;
}

export function PantryRoom({ onBack }: PantryRoomProps) {
  const [units, setUnits] = useState<StorageUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeUnitId, setActiveUnitId] = useState<number | "all" | null>(null);

  const refresh = useCallback(async () => {
    setUnits(await listStorageUnits());
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

  async function handleDeleteUnit(unit: StorageUnit) {
    if (
      !window.confirm(
        `Supprimer le meuble "${unit.name}" ? Les aliments qu'il contient resteront dans le garde-manger, juste sans emplacement.`,
      )
    ) {
      return;
    }
    await deleteStorageUnit(unit.id);
    await refresh();
  }

  if (activeUnitId !== null) {
    const activeUnit = activeUnitId === "all" ? null : units.find((u) => u.id === activeUnitId) ?? null;
    return (
      <Pantry
        initialUnitId={activeUnit?.id ?? null}
        onBack={() => setActiveUnitId(null)}
        backgroundSrc={getStorageOpenBackground(activeUnit?.illustration ?? null) ?? pantryBackground}
        title={activeUnit?.name ?? "Garde-manger"}
      />
    );
  }

  if (loading) return <p className="status-text">Chargement du garde-manger...</p>;

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
      </div>

      <div className="pantry-room__floor">
        {units.map((unit) => {
          const src = getStorageIllustration(unit.illustration);
          return (
            <div key={unit.id} className="pantry-room__unit">
              <button
                type="button"
                className="pantry-room__unit-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteUnit(unit);
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
    </div>
  );
}
