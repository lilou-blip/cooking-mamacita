-- Favoris et estimation nutritionnelle par recette. L'estimation nutrition suit la même logique que
-- l'estimation de prix sur une liste de courses (IA, approximative) mais est calculée pour une recette
-- entière ET mise en cache sur la ligne plutôt que recalculée à chaque affichage : contrairement au prix
-- d'une liste de courses (éphémère, change à chaque liste), la valeur nutritionnelle d'une recette ne
-- change pas d'une consultation à l'autre.

alter table recipes add column if not exists is_favorite boolean not null default false;
alter table recipes add column if not exists nutrition_estimate jsonb;

create index if not exists idx_recipes_favorite on recipes(user_id, is_favorite) where is_favorite;
