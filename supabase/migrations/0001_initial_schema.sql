-- Cooking Mamacita — schéma Postgres/Supabase (équivalent des migrations SQLite 0001 à 0013)
-- Chaque table appartient à un utilisateur (colonne user_id, RLS), pour permettre le partage
-- des mêmes données entre plusieurs appareils connectés au même compte.

create extension if not exists "pgcrypto";

-- ============================================================================
-- Tables
-- ============================================================================

create table consumer_profiles (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name text not null,
    color text not null default '#C0392B',
    relation text,
    avatar text,
    dietary_notes text,
    created_at timestamptz not null default now()
);

create table units (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name text not null,
    abbreviation text not null,
    unit_type text not null check (unit_type in ('masse', 'volume', 'piece')),
    factor_to_base double precision not null default 1,
    unique (user_id, name)
);

create table ingredients (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name text not null,
    category text not null default 'autre'
        check (category in ('fruits', 'legumes', 'proteines', 'feculents', 'laitages', 'epicerie', 'boissons', 'autre')),
    unique (user_id, name)
);

create table tags (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    category text not null check (category in ('type', 'regime', 'gout', 'saison', 'temperature')),
    name text not null,
    unique (user_id, category, name)
);

create table recipes (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    title text not null,
    photo_path text,
    prep_time_minutes integer,
    cook_time_minutes integer,
    servings integer not null default 4,
    notes text,
    source text,
    created_at timestamptz not null default now()
);

create table recipe_tags (
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    recipe_id bigint not null references recipes(id) on delete cascade,
    tag_id bigint not null references tags(id) on delete cascade,
    primary key (recipe_id, tag_id)
);

create table recipe_ingredients (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    recipe_id bigint not null references recipes(id) on delete cascade,
    ingredient_id bigint not null references ingredients(id),
    quantity double precision,
    unit_id bigint references units(id),
    position integer not null default 0,
    note text
);

create table recipe_steps (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    recipe_id bigint not null references recipes(id) on delete cascade,
    step_number integer not null,
    instruction text not null
);

create table storage_units (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name text not null,
    illustration text,
    position integer not null default 0,
    unique (user_id, name)
);

create table pantry_items (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    ingredient_id bigint not null references ingredients(id),
    unit_id bigint references units(id),
    quantity double precision not null default 0,
    added_at timestamptz not null default now(),
    expires_at date,
    location text check (location is null or location in ('frigo', 'congelateur', 'placard', 'autre')),
    storage_unit_id bigint references storage_units(id)
);

create table pantry_item_assignments (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    pantry_item_id bigint not null references pantry_items(id) on delete cascade,
    profile_id bigint not null references consumer_profiles(id) on delete cascade,
    quantity double precision not null default 0
);

create table menus (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name text not null,
    event_date date,
    servings_target integer,
    notes text,
    menu_type text not null default 'evenement' check (menu_type in ('semaine', 'evenement')),
    created_at timestamptz not null default now()
);

create table menu_recipes (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    menu_id bigint not null references menus(id) on delete cascade,
    recipe_id bigint not null references recipes(id),
    servings integer,
    made boolean not null default false,
    day_of_week integer,
    meal_slot text check (meal_slot is null or meal_slot in ('petit_dejeuner', 'dejeuner', 'gouter', 'diner'))
);

create table consumption_log (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    recipe_id bigint not null references recipes(id),
    consumed_at timestamptz not null default now(),
    servings integer not null default 1,
    notes text
);

create table consumption_log_profiles (
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    consumption_log_id bigint not null references consumption_log(id) on delete cascade,
    profile_id bigint not null references consumer_profiles(id) on delete cascade,
    primary key (consumption_log_id, profile_id)
);

create table shopping_lists (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    menu_id bigint references menus(id) on delete set null,
    name text not null,
    created_at timestamptz not null default now()
);

create table shopping_list_items (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    shopping_list_id bigint not null references shopping_lists(id) on delete cascade,
    ingredient_id bigint not null references ingredients(id),
    quantity double precision,
    unit_id bigint references units(id),
    price double precision,
    price_is_estimate boolean not null default false,
    checked boolean not null default false,
    is_suggested boolean not null default false
);

create table pantry_consumption_log (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    ingredient_id bigint not null references ingredients(id),
    profile_id bigint references consumer_profiles(id),
    quantity double precision not null,
    unit_id bigint references units(id),
    consumed_at timestamptz not null default now()
);

create table pantry_waste_avoided_log (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    ingredient_id bigint not null references ingredients(id),
    quantity double precision not null,
    unit_id bigint references units(id),
    consumed_at timestamptz not null default now()
);

-- ============================================================================
-- Index (mêmes clés étrangères filtrées que dans les migrations SQLite d'origine,
-- + un index sur user_id sur chaque table pour accélérer le filtrage RLS)
-- ============================================================================

create index idx_recipe_ingredients_recipe on recipe_ingredients(recipe_id);
create index idx_recipe_steps_recipe on recipe_steps(recipe_id);
create index idx_recipe_tags_recipe on recipe_tags(recipe_id);
create index idx_pantry_items_ingredient on pantry_items(ingredient_id);
create index idx_pantry_items_storage_unit on pantry_items(storage_unit_id);
create index idx_menu_recipes_menu on menu_recipes(menu_id);
create index idx_consumption_log_recipe on consumption_log(recipe_id);
create index idx_consumption_log_profiles_profile on consumption_log_profiles(profile_id);
create index idx_shopping_list_items_list on shopping_list_items(shopping_list_id);
create index idx_pantry_consumption_ingredient on pantry_consumption_log(ingredient_id);
create index idx_pantry_consumption_profile on pantry_consumption_log(profile_id);
create index idx_pantry_item_assignments_profile on pantry_item_assignments(profile_id);

create index idx_consumer_profiles_user on consumer_profiles(user_id);
create index idx_units_user on units(user_id);
create index idx_ingredients_user on ingredients(user_id);
create index idx_tags_user on tags(user_id);
create index idx_recipes_user on recipes(user_id);
create index idx_recipe_tags_user on recipe_tags(user_id);
create index idx_recipe_ingredients_user on recipe_ingredients(user_id);
create index idx_recipe_steps_user on recipe_steps(user_id);
create index idx_storage_units_user on storage_units(user_id);
create index idx_pantry_items_user on pantry_items(user_id);
create index idx_pantry_item_assignments_user on pantry_item_assignments(user_id);
create index idx_menus_user on menus(user_id);
create index idx_menu_recipes_user on menu_recipes(user_id);
create index idx_consumption_log_user on consumption_log(user_id);
create index idx_consumption_log_profiles_user on consumption_log_profiles(user_id);
create index idx_shopping_lists_user on shopping_lists(user_id);
create index idx_shopping_list_items_user on shopping_list_items(user_id);
create index idx_pantry_consumption_log_user on pantry_consumption_log(user_id);
create index idx_pantry_waste_avoided_log_user on pantry_waste_avoided_log(user_id);

-- ============================================================================
-- Row Level Security — chacun ne voit et ne modifie que ses propres données
-- ============================================================================

do $$
declare
    t text;
begin
    for t in
        select unnest(array[
            'consumer_profiles', 'units', 'ingredients', 'tags', 'recipes', 'recipe_tags',
            'recipe_ingredients', 'recipe_steps', 'storage_units', 'pantry_items',
            'pantry_item_assignments', 'menus', 'menu_recipes', 'consumption_log',
            'consumption_log_profiles', 'shopping_lists', 'shopping_list_items',
            'pantry_consumption_log', 'pantry_waste_avoided_log'
        ])
    loop
        execute format('alter table %I enable row level security', t);
        execute format(
            'create policy %I on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
            t || '_owner', t
        );
    end loop;
end $$;

-- ============================================================================
-- Données de référence par défaut, créées automatiquement pour chaque nouveau compte
-- (équivalent des INSERT des migrations 0001, 0002, 0006, 0007)
-- ============================================================================

create or replace function public.seed_default_data_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into units (user_id, name, abbreviation, unit_type, factor_to_base) values
        (new.id, 'gramme', 'g', 'masse', 1),
        (new.id, 'kilogramme', 'kg', 'masse', 1000),
        (new.id, 'millilitre', 'ml', 'volume', 1),
        (new.id, 'centilitre', 'cl', 'volume', 10),
        (new.id, 'litre', 'l', 'volume', 1000),
        (new.id, 'cuillère à café', 'c. à c.', 'volume', 5),
        (new.id, 'cuillère à soupe', 'c. à s.', 'volume', 15),
        (new.id, 'pièce', 'pièce', 'piece', 1),
        (new.id, 'pincée', 'pincée', 'masse', 1);

    insert into tags (user_id, category, name) values
        (new.id, 'type', 'entrée'), (new.id, 'type', 'plat'), (new.id, 'type', 'dessert'),
        (new.id, 'type', 'apéritif'), (new.id, 'type', 'boisson'),
        (new.id, 'regime', 'végétarien'), (new.id, 'regime', 'vegan'),
        (new.id, 'regime', 'sans gluten'), (new.id, 'regime', 'sans lactose'),
        (new.id, 'gout', 'sucré'), (new.id, 'gout', 'salé'), (new.id, 'gout', 'épicé'), (new.id, 'gout', 'acide'),
        (new.id, 'saison', 'été'), (new.id, 'saison', 'automne'), (new.id, 'saison', 'hiver'), (new.id, 'saison', 'printemps'),
        (new.id, 'temperature', 'chaud'), (new.id, 'temperature', 'froid'), (new.id, 'temperature', 'tiède');

    insert into ingredients (user_id, name, category) values
        (new.id, 'pomme', 'fruits'), (new.id, 'banane', 'fruits'), (new.id, 'citron', 'fruits'),
        (new.id, 'fraise', 'fruits'), (new.id, 'orange', 'fruits'),
        (new.id, 'oignon', 'legumes'), (new.id, 'ail', 'legumes'), (new.id, 'tomate', 'legumes'),
        (new.id, 'carotte', 'legumes'), (new.id, 'pomme de terre', 'legumes'), (new.id, 'poireau', 'legumes'),
        (new.id, 'courgette', 'legumes'), (new.id, 'salade', 'legumes'),
        (new.id, 'oeuf', 'proteines'), (new.id, 'poulet', 'proteines'), (new.id, 'boeuf haché', 'proteines'),
        (new.id, 'jambon', 'proteines'), (new.id, 'thon', 'proteines'), (new.id, 'saumon', 'proteines'),
        (new.id, 'farine', 'feculents'), (new.id, 'riz', 'feculents'), (new.id, 'pâtes', 'feculents'),
        (new.id, 'pain', 'feculents'), (new.id, 'semoule', 'feculents'),
        (new.id, 'lait', 'laitages'), (new.id, 'beurre', 'laitages'), (new.id, 'crème fraîche', 'laitages'),
        (new.id, 'fromage râpé', 'laitages'), (new.id, 'yaourt', 'laitages'),
        (new.id, 'sucre', 'epicerie'), (new.id, 'sel', 'epicerie'), (new.id, 'poivre', 'epicerie'),
        (new.id, 'huile d''olive', 'epicerie'), (new.id, 'huile de tournesol', 'epicerie'),
        (new.id, 'vinaigre', 'epicerie'), (new.id, 'levure chimique', 'epicerie'),
        (new.id, 'bicarbonate de soude', 'epicerie'), (new.id, 'chocolat', 'epicerie'),
        (new.id, 'miel', 'epicerie'), (new.id, 'moutarde', 'epicerie'),
        (new.id, 'eau', 'boissons'), (new.id, 'vin blanc', 'boissons'), (new.id, 'vin rouge', 'boissons');

    insert into storage_units (user_id, name, illustration, position) values
        (new.id, 'Frigo', 'frigo', 0),
        (new.id, 'Congélateur', 'congelateur', 1),
        (new.id, 'Placard', 'placard', 2),
        (new.id, 'Étagère', 'etagere-fruit', 3);

    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.seed_default_data_for_new_user();
