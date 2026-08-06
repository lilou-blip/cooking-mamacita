-- Cooking Mamacita — journalise les aliments consommés alors qu'ils étaient proches de la péremption (gaspillage évité), pour les statistiques éco-responsables.
CREATE TABLE pantry_waste_avoided_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  quantity REAL NOT NULL,
  unit_id INTEGER REFERENCES units(id),
  consumed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
