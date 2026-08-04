-- Cooking Mamacita — emplacement de rangement au garde-manger
PRAGMA foreign_keys = ON;

ALTER TABLE pantry_items ADD COLUMN location TEXT
    CHECK (location IS NULL OR location IN ('frigo', 'congelateur', 'placard', 'autre'));
