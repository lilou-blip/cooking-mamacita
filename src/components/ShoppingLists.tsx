import { useCallback, useEffect, useState } from "react";
import {
  createShoppingList,
  deleteShoppingList,
  listShoppingLists,
  renameShoppingList,
  type ShoppingListSummary,
} from "../lib/db";
import { ShoppingList } from "./ShoppingList";
import { LoadingScreen } from "./LoadingScreen";
import { ConfirmDialog } from "./ConfirmDialog";
import "./ShoppingLists.css";

interface ShoppingListsProps {
  onBack: () => void;
}

export function ShoppingLists({ onBack }: ShoppingListsProps) {
  const [lists, setLists] = useState<ShoppingListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<{ id: number; name: string } | null>(null);

  const refresh = useCallback(async () => {
    setLists(await listShoppingLists());
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const id = await createShoppingList(name);
    setNewName("");
    await refresh();
    setSelectedId(id);
  }

  async function handleRenameSubmit(id: number) {
    const name = renameValue.trim();
    if (name) await renameShoppingList(id, name);
    setRenamingId(null);
    await refresh();
  }

  async function confirmDelete() {
    if (!confirmingDelete) return;
    await deleteShoppingList(confirmingDelete.id);
    setConfirmingDelete(null);
    await refresh();
  }

  if (selectedId != null) {
    return <ShoppingList id={selectedId} backLabel="← Mes listes" onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="shopping-lists">
      <button className="book-nav__back" onClick={onBack}>
        ← Table
      </button>

      <div className="shopping-lists__paper">
        <h1>Mes listes de courses</h1>

        {loading ? (
          <LoadingScreen fullScreen={false} />
        ) : lists.length === 0 ? (
          <p className="shopping-lists__empty">Aucune liste pour l'instant, crées-en une ci-dessous.</p>
        ) : (
          <ul className="shopping-lists__items">
            {lists.map((list) => (
              <li key={list.id} className="shopping-lists__item">
                {renamingId === list.id ? (
                  <input
                    className="shopping-lists__rename-input"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSubmit(list.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => handleRenameSubmit(list.id)}
                  />
                ) : (
                  <button type="button" className="shopping-lists__name" onClick={() => setSelectedId(list.id)}>
                    {list.name}
                    <span className="shopping-lists__count">
                      {list.checked_count}/{list.item_count} coché(s)
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  className="shopping-lists__rename"
                  aria-label="Renommer"
                  onClick={() => {
                    setRenamingId(list.id);
                    setRenameValue(list.name);
                  }}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="shopping-lists__delete"
                  aria-label="Supprimer"
                  onClick={() => setConfirmingDelete({ id: list.id, name: list.name })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="shopping-lists__add">
          <input
            placeholder="Nom de la nouvelle liste (ex: Courses du weekend)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <button type="button" className="form-submit" onClick={handleCreate} disabled={!newName.trim()}>
            + Nouvelle liste
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          message={`Supprimer la liste "${confirmingDelete.name}" ? Cette action est irréversible.`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(null)}
        />
      )}
    </div>
  );
}
