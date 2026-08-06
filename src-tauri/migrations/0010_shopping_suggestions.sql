-- Cooking Mamacita — distingue les articles suggérés automatiquement (produits de base bientôt épuisés) des articles demandés
ALTER TABLE shopping_list_items ADD COLUMN is_suggested INTEGER NOT NULL DEFAULT 0;
