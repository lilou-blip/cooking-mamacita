-- Cooking Mamacita — journal de consommation du garde-manger, lié aux profils
PRAGMA foreign_keys = ON;

CREATE TABLE pantry_consumption_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    profile_id INTEGER REFERENCES consumer_profiles(id),
    quantity REAL NOT NULL,
    unit_id INTEGER REFERENCES units(id),
    consumed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pantry_consumption_ingredient ON pantry_consumption_log(ingredient_id);
CREATE INDEX idx_pantry_consumption_profile ON pantry_consumption_log(profile_id);
