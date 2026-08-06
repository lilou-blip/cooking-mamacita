import { useEffect, useState } from "react";
import { getOrCreateStandaloneShoppingList } from "../lib/db";
import { ShoppingList } from "./ShoppingList";

interface StandaloneShoppingListProps {
  onBack: () => void;
}

export function StandaloneShoppingList({ onBack }: StandaloneShoppingListProps) {
  const [id, setId] = useState<number | null>(null);

  useEffect(() => {
    getOrCreateStandaloneShoppingList().then(setId);
  }, []);

  if (id == null) return <p className="status-text">Chargement de la liste...</p>;

  return <ShoppingList id={id} backLabel="← Table" onBack={onBack} />;
}
