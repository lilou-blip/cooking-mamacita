-- Cooking Mamacita — index sur les 3 colonnes FK effectivement filtrées par WHERE qui n'étaient pas encore couvertes
-- (la plupart des FK avaient déjà un index depuis la migration initiale : recipe_id, ingredient_id sur pantry_items,
-- menu_id, etc. — seules ces trois-là manquaient).
PRAGMA foreign_keys = ON;

-- deleteProfile() : DELETE FROM pantry_item_assignments WHERE profile_id = ?
CREATE INDEX idx_pantry_item_assignments_profile ON pantry_item_assignments(profile_id);

-- deleteProfile(), getTopMadeRecipes(profileId), getConsumptionByCategory(profileId) : WHERE profile_id = ?
-- (non couvert par la clé primaire composite (consumption_log_id, profile_id), qui n'accélère que consumption_log_id)
CREATE INDEX idx_consumption_log_profiles_profile ON consumption_log_profiles(profile_id);

-- deleteStorageUnit() : UPDATE pantry_items SET storage_unit_id = NULL WHERE storage_unit_id = ?
CREATE INDEX idx_pantry_items_storage_unit ON pantry_items(storage_unit_id);
