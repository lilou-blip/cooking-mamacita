-- Cooking Mamacita — profil invité exclu des stats "Tous", âge de profil, et lien recette pour les
-- restes de plats composites (batch cooking) afin que les stats par catégorie sachent les décomposer.

alter table consumer_profiles add column if not exists is_guest boolean not null default false;
alter table consumer_profiles add column if not exists age integer;

-- Le profil "invité" déjà présent devient le profil "fourre-tout" exclu du total "Tous".
update consumer_profiles set is_guest = true where lower(name) = 'invité' and is_guest = false;

-- Un pantry_item peut représenter des restes d'une recette (quantity = nombre de portions restantes,
-- pas un poids/volume) plutôt qu'un ingrédient brut — utilisé par le batch cooking.
alter table pantry_items add column if not exists recipe_id bigint references recipes(id) on delete set null;
create index if not exists idx_pantry_items_recipe on pantry_items(recipe_id);

-- Repris sur le journal de consommation au moment où ces restes sont consommés, pour que les stats par
-- catégorie puissent redécomposer via les ingrédients de la recette plutôt que de compter un "plat" flou.
alter table pantry_consumption_log add column if not exists recipe_id bigint references recipes(id) on delete set null;
create index if not exists idx_pantry_consumption_log_recipe on pantry_consumption_log(recipe_id);
