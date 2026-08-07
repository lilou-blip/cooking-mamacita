-- Partage d'une recette via un lien public en lecture seule (pas besoin de compte pour la consulter).
-- Le token est un UUID aléatoire non énumérable ; la lecture publique passe par l'Edge Function
-- get-shared-recipe (clé service_role, contourne RLS volontairement) plutôt que par une policy RLS
-- publique sur cette table ou sur recipes, pour ne jamais exposer directement la table recipes.

create table recipe_shares (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    recipe_id bigint not null references recipes(id) on delete cascade,
    token uuid not null default gen_random_uuid() unique,
    created_at timestamptz not null default now()
);

create index idx_recipe_shares_user on recipe_shares(user_id);
create index idx_recipe_shares_recipe on recipe_shares(recipe_id);

alter table recipe_shares enable row level security;

create policy recipe_shares_owner on recipe_shares
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
