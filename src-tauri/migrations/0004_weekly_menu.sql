-- Cooking Mamacita — calendrier hebdomadaire pour les menus type "semaine"
PRAGMA foreign_keys = ON;

ALTER TABLE menu_recipes ADD COLUMN day_of_week INTEGER; -- 0 = lundi ... 6 = dimanche, NULL si non applicable
ALTER TABLE menu_recipes ADD COLUMN meal_slot TEXT
    CHECK (meal_slot IS NULL OR meal_slot IN ('petit_dejeuner', 'dejeuner', 'gouter', 'diner'));
