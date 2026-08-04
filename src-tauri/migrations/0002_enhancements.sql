-- Cooking Mamacita — enrichissements: types de menu, suivi "fait", ingrédients courants
PRAGMA foreign_keys = ON;

ALTER TABLE menus ADD COLUMN menu_type TEXT NOT NULL DEFAULT 'evenement' CHECK (menu_type IN ('semaine', 'evenement'));
ALTER TABLE menu_recipes ADD COLUMN made INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO ingredients (name, category) VALUES
    ('pomme', 'fruits'), ('banane', 'fruits'), ('citron', 'fruits'), ('fraise', 'fruits'), ('orange', 'fruits'),
    ('oignon', 'legumes'), ('ail', 'legumes'), ('tomate', 'legumes'), ('carotte', 'legumes'),
    ('pomme de terre', 'legumes'), ('poireau', 'legumes'), ('courgette', 'legumes'), ('salade', 'legumes'),
    ('oeuf', 'proteines'), ('poulet', 'proteines'), ('boeuf haché', 'proteines'), ('jambon', 'proteines'),
    ('thon', 'proteines'), ('saumon', 'proteines'),
    ('farine', 'feculents'), ('riz', 'feculents'), ('pâtes', 'feculents'), ('pain', 'feculents'), ('semoule', 'feculents'),
    ('lait', 'laitages'), ('beurre', 'laitages'), ('crème fraîche', 'laitages'), ('fromage râpé', 'laitages'), ('yaourt', 'laitages'),
    ('sucre', 'epicerie'), ('sel', 'epicerie'), ('poivre', 'epicerie'), ('huile d''olive', 'epicerie'),
    ('huile de tournesol', 'epicerie'), ('vinaigre', 'epicerie'), ('levure chimique', 'epicerie'),
    ('bicarbonate de soude', 'epicerie'), ('chocolat', 'epicerie'), ('miel', 'epicerie'), ('moutarde', 'epicerie'),
    ('eau', 'boissons'), ('vin blanc', 'boissons'), ('vin rouge', 'boissons');
