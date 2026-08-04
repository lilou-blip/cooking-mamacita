-- Cooking Mamacita — meubles de rangement du garde-manger (frigo, placard, congélo, et ceux ajoutés par l'utilisateur)
PRAGMA foreign_keys = ON;

CREATE TABLE storage_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    illustration TEXT,
    position INTEGER NOT NULL DEFAULT 0
);

INSERT INTO storage_units (name, illustration, position) VALUES
    ('Frigo', 'frigo', 0),
    ('Congélateur', 'congelateur', 1),
    ('Placard', 'placard', 2);

ALTER TABLE pantry_items ADD COLUMN storage_unit_id INTEGER REFERENCES storage_units(id);

UPDATE pantry_items SET storage_unit_id = (SELECT id FROM storage_units WHERE name = 'Frigo') WHERE location = 'frigo';
UPDATE pantry_items SET storage_unit_id = (SELECT id FROM storage_units WHERE name = 'Congélateur') WHERE location = 'congelateur';
UPDATE pantry_items SET storage_unit_id = (SELECT id FROM storage_units WHERE name = 'Placard') WHERE location = 'placard';
