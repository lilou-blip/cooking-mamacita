-- Cooking Mamacita — schema initial
PRAGMA foreign_keys = ON;

-- Profils de consommateurs (ex: "Moi", "Ma fille")
CREATE TABLE consumer_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#C0392B',
    relation TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unités de mesure + conversion de base (gramme pour masse, ml pour volume, piece pour unitaire)
CREATE TABLE units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,        -- ex: "gramme", "cuillère à soupe"
    abbreviation TEXT NOT NULL,       -- ex: "g", "c. à s."
    unit_type TEXT NOT NULL CHECK (unit_type IN ('masse', 'volume', 'piece')),
    factor_to_base REAL NOT NULL DEFAULT 1  -- facteur vers l'unité de référence du unit_type (g / ml / piece)
);

-- Ingrédients (référentiel réutilisable entre recettes et garde-manger)
CREATE TABLE ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'autre'
        CHECK (category IN ('fruits', 'legumes', 'proteines', 'feculents', 'laitages', 'epicerie', 'boissons', 'autre'))
);

-- Tags (type de plat, régime, goût, saison, température)
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK (category IN ('type', 'regime', 'gout', 'saison', 'temperature')),
    name TEXT NOT NULL,
    UNIQUE (category, name)
);

-- Recettes
CREATE TABLE recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    photo_path TEXT,
    prep_time_minutes INTEGER,
    cook_time_minutes INTEGER,
    servings INTEGER NOT NULL DEFAULT 4,
    notes TEXT,
    source TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recipe_tags (
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, tag_id)
);

CREATE TABLE recipe_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    quantity REAL,
    unit_id INTEGER REFERENCES units(id),
    position INTEGER NOT NULL DEFAULT 0,
    note TEXT
);

CREATE TABLE recipe_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    instruction TEXT NOT NULL
);

-- Garde-manger
CREATE TABLE pantry_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    unit_id INTEGER REFERENCES units(id),
    quantity REAL NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT
);

CREATE TABLE pantry_item_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pantry_item_id INTEGER NOT NULL REFERENCES pantry_items(id) ON DELETE CASCADE,
    profile_id INTEGER NOT NULL REFERENCES consumer_profiles(id) ON DELETE CASCADE,
    quantity REAL NOT NULL DEFAULT 0
);

-- Menus / événements
CREATE TABLE menus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    event_date TEXT,
    servings_target INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE menu_recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id),
    servings INTEGER
);

-- Historique de consommation (bouton "Fait")
CREATE TABLE consumption_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id),
    consumed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    servings INTEGER NOT NULL DEFAULT 1,
    notes TEXT
);

CREATE TABLE consumption_log_profiles (
    consumption_log_id INTEGER NOT NULL REFERENCES consumption_log(id) ON DELETE CASCADE,
    profile_id INTEGER NOT NULL REFERENCES consumer_profiles(id) ON DELETE CASCADE,
    PRIMARY KEY (consumption_log_id, profile_id)
);

-- Listes de courses
CREATE TABLE shopping_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_id INTEGER REFERENCES menus(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shopping_list_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shopping_list_id INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    quantity REAL,
    unit_id INTEGER REFERENCES units(id),
    price REAL,
    price_is_estimate INTEGER NOT NULL DEFAULT 0,
    checked INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_steps_recipe ON recipe_steps(recipe_id);
CREATE INDEX idx_recipe_tags_recipe ON recipe_tags(recipe_id);
CREATE INDEX idx_pantry_items_ingredient ON pantry_items(ingredient_id);
CREATE INDEX idx_menu_recipes_menu ON menu_recipes(menu_id);
CREATE INDEX idx_consumption_log_recipe ON consumption_log(recipe_id);
CREATE INDEX idx_shopping_list_items_list ON shopping_list_items(shopping_list_id);

-- Unités de base
INSERT INTO units (name, abbreviation, unit_type, factor_to_base) VALUES
    ('gramme', 'g', 'masse', 1),
    ('kilogramme', 'kg', 'masse', 1000),
    ('millilitre', 'ml', 'volume', 1),
    ('centilitre', 'cl', 'volume', 10),
    ('litre', 'l', 'volume', 1000),
    ('cuillère à café', 'c. à c.', 'volume', 5),
    ('cuillère à soupe', 'c. à s.', 'volume', 15),
    ('pièce', 'pièce', 'piece', 1),
    ('pincée', 'pincée', 'masse', 1);

-- Tags de base
INSERT INTO tags (category, name) VALUES
    ('type', 'entrée'), ('type', 'plat'), ('type', 'dessert'), ('type', 'apéritif'), ('type', 'boisson'),
    ('regime', 'végétarien'), ('regime', 'vegan'), ('regime', 'sans gluten'), ('regime', 'sans lactose'),
    ('gout', 'sucré'), ('gout', 'salé'), ('gout', 'épicé'), ('gout', 'acide'),
    ('saison', 'été'), ('saison', 'automne'), ('saison', 'hiver'), ('saison', 'printemps'),
    ('temperature', 'chaud'), ('temperature', 'froid'), ('temperature', 'tiède');
