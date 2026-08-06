-- Cooking Mamacita — permet de noter les allergies/contraintes alimentaires de chaque profil, pour que l'IA en tienne compte.
ALTER TABLE consumer_profiles ADD COLUMN dietary_notes TEXT;
