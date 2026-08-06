-- Cooking Mamacita — refonte des catégories d'ingrédients : "beurre" ne fait pas vraiment sens dans
-- "laitages", et "épicerie" mélangeait des produits très différents (farine ET sucre ET chocolat).
-- On ajoute deux catégories : matieres_grasses (beurre, huiles...) et sucreries (sucre, chocolat, miel...).

-- 1) Élargit la contrainte de catégorie sur ingredients (on retrouve le nom réel de la contrainte plutôt
--    que de le supposer, au cas où Postgres l'ait nommée différemment).
do $$
declare
    constraint_name text;
begin
    select con.conname into constraint_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where rel.relname = 'ingredients' and con.contype = 'c' and att.attname = 'category';

    if constraint_name is not null then
        execute format('alter table ingredients drop constraint %I', constraint_name);
    end if;
end $$;

alter table ingredients add constraint ingredients_category_check
    check (category in (
        'fruits', 'legumes', 'proteines', 'feculents', 'laitages',
        'matieres_grasses', 'sucreries', 'epicerie', 'boissons', 'autre'
    ));

-- 2) Recatégorise les ingrédients déjà existants (tous comptes confondus) qui tombent clairement dans
--    les deux nouvelles catégories.
update ingredients set category = 'matieres_grasses'
    where category in ('laitages', 'epicerie') and name ~* 'beurre|huile|margarine|saindoux|graisse de canard';

update ingredients set category = 'sucreries'
    where category = 'epicerie'
    and name ~* 'sucre|chocolat|miel|confiture|cassonade|caramel|pâte à tartiner|bonbon|nutella|sirop d''érable|sirop d''agave';

-- 3) Remplace le seed par défaut (déclenché à la création d'un compte) par une liste beaucoup plus
--    complète, avec les bonnes catégories dès le départ.
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
        -- Fruits
        (new.id, 'pomme', 'fruits'), (new.id, 'banane', 'fruits'), (new.id, 'citron', 'fruits'),
        (new.id, 'citron vert', 'fruits'), (new.id, 'orange', 'fruits'), (new.id, 'clémentine', 'fruits'),
        (new.id, 'pamplemousse', 'fruits'), (new.id, 'fraise', 'fruits'), (new.id, 'framboise', 'fruits'),
        (new.id, 'myrtille', 'fruits'), (new.id, 'mûre', 'fruits'), (new.id, 'cerise', 'fruits'),
        (new.id, 'abricot', 'fruits'), (new.id, 'pêche', 'fruits'), (new.id, 'nectarine', 'fruits'),
        (new.id, 'prune', 'fruits'), (new.id, 'poire', 'fruits'), (new.id, 'raisin', 'fruits'),
        (new.id, 'kiwi', 'fruits'), (new.id, 'mangue', 'fruits'), (new.id, 'ananas', 'fruits'),
        (new.id, 'pastèque', 'fruits'), (new.id, 'melon', 'fruits'), (new.id, 'figue', 'fruits'),
        (new.id, 'grenade', 'fruits'), (new.id, 'rhubarbe', 'fruits'), (new.id, 'litchi', 'fruits'),

        -- Légumes
        (new.id, 'oignon', 'legumes'), (new.id, 'ail', 'legumes'), (new.id, 'échalote', 'legumes'),
        (new.id, 'poireau', 'legumes'), (new.id, 'tomate', 'legumes'), (new.id, 'carotte', 'legumes'),
        (new.id, 'pomme de terre', 'legumes'), (new.id, 'patate douce', 'legumes'), (new.id, 'courgette', 'legumes'),
        (new.id, 'aubergine', 'legumes'), (new.id, 'poivron', 'legumes'), (new.id, 'concombre', 'legumes'),
        (new.id, 'salade', 'legumes'), (new.id, 'épinard', 'legumes'), (new.id, 'brocoli', 'legumes'),
        (new.id, 'chou-fleur', 'legumes'), (new.id, 'chou blanc', 'legumes'), (new.id, 'chou rouge', 'legumes'),
        (new.id, 'chou de bruxelles', 'legumes'), (new.id, 'champignon', 'legumes'), (new.id, 'haricot vert', 'legumes'),
        (new.id, 'petit pois', 'legumes'), (new.id, 'radis', 'legumes'), (new.id, 'betterave', 'legumes'),
        (new.id, 'céleri', 'legumes'), (new.id, 'fenouil', 'legumes'), (new.id, 'artichaut', 'legumes'),
        (new.id, 'navet', 'legumes'), (new.id, 'potiron', 'legumes'), (new.id, 'maïs', 'legumes'),
        (new.id, 'avocat', 'legumes'), (new.id, 'cornichon', 'legumes'),

        -- Protéines
        (new.id, 'oeuf', 'proteines'), (new.id, 'poulet', 'proteines'), (new.id, 'poulet entier', 'proteines'),
        (new.id, 'dinde', 'proteines'), (new.id, 'boeuf haché', 'proteines'), (new.id, 'steak', 'proteines'),
        (new.id, 'escalope de veau', 'proteines'), (new.id, 'porc', 'proteines'), (new.id, 'côte de porc', 'proteines'),
        (new.id, 'lardons', 'proteines'), (new.id, 'jambon', 'proteines'), (new.id, 'saucisse', 'proteines'),
        (new.id, 'chorizo', 'proteines'), (new.id, 'thon', 'proteines'), (new.id, 'saumon', 'proteines'),
        (new.id, 'cabillaud', 'proteines'), (new.id, 'crevette', 'proteines'), (new.id, 'moules', 'proteines'),
        (new.id, 'poisson', 'proteines'), (new.id, 'tofu', 'proteines'), (new.id, 'lentilles', 'proteines'),
        (new.id, 'pois chiches', 'proteines'), (new.id, 'haricots rouges', 'proteines'), (new.id, 'haricots blancs', 'proteines'),

        -- Féculents
        (new.id, 'farine', 'feculents'), (new.id, 'riz', 'feculents'), (new.id, 'pâtes', 'feculents'),
        (new.id, 'semoule', 'feculents'), (new.id, 'pain', 'feculents'), (new.id, 'pain de mie', 'feculents'),
        (new.id, 'quinoa', 'feculents'), (new.id, 'boulgour', 'feculents'), (new.id, 'polenta', 'feculents'),
        (new.id, 'biscottes', 'feculents'), (new.id, 'chapelure', 'feculents'), (new.id, 'farine de maïs', 'feculents'),

        -- Laitages
        (new.id, 'lait', 'laitages'), (new.id, 'lait demi-écrémé', 'laitages'), (new.id, 'crème fraîche', 'laitages'),
        (new.id, 'crème liquide', 'laitages'), (new.id, 'fromage râpé', 'laitages'), (new.id, 'fromage blanc', 'laitages'),
        (new.id, 'yaourt', 'laitages'), (new.id, 'yaourt grec', 'laitages'), (new.id, 'mozzarella', 'laitages'),
        (new.id, 'feta', 'laitages'), (new.id, 'parmesan', 'laitages'), (new.id, 'comté', 'laitages'),
        (new.id, 'emmental', 'laitages'), (new.id, 'chèvre', 'laitages'), (new.id, 'mascarpone', 'laitages'),
        (new.id, 'ricotta', 'laitages'), (new.id, 'petit-suisse', 'laitages'), (new.id, 'babeurre', 'laitages'),

        -- Matières grasses
        (new.id, 'beurre', 'matieres_grasses'), (new.id, 'huile d''olive', 'matieres_grasses'),
        (new.id, 'huile de tournesol', 'matieres_grasses'), (new.id, 'huile de colza', 'matieres_grasses'),
        (new.id, 'huile de coco', 'matieres_grasses'), (new.id, 'margarine', 'matieres_grasses'),
        (new.id, 'saindoux', 'matieres_grasses'), (new.id, 'graisse de canard', 'matieres_grasses'),

        -- Sucres & sucreries
        (new.id, 'sucre', 'sucreries'), (new.id, 'cassonade', 'sucreries'), (new.id, 'sucre glace', 'sucreries'),
        (new.id, 'sucre vanillé', 'sucreries'), (new.id, 'miel', 'sucreries'), (new.id, 'chocolat noir', 'sucreries'),
        (new.id, 'chocolat au lait', 'sucreries'), (new.id, 'chocolat blanc', 'sucreries'),
        (new.id, 'pépites de chocolat', 'sucreries'), (new.id, 'cacao en poudre', 'sucreries'),
        (new.id, 'confiture', 'sucreries'), (new.id, 'pâte à tartiner', 'sucreries'), (new.id, 'caramel', 'sucreries'),
        (new.id, 'bonbons', 'sucreries'), (new.id, 'sirop d''érable', 'sucreries'), (new.id, 'sirop d''agave', 'sucreries'),

        -- Épicerie (condiments, épices, placard sec — non sucré)
        (new.id, 'sel', 'epicerie'), (new.id, 'poivre', 'epicerie'), (new.id, 'paprika', 'epicerie'),
        (new.id, 'cumin', 'epicerie'), (new.id, 'curry', 'epicerie'), (new.id, 'muscade', 'epicerie'),
        (new.id, 'cannelle', 'epicerie'), (new.id, 'gingembre en poudre', 'epicerie'), (new.id, 'herbes de Provence', 'epicerie'),
        (new.id, 'thym', 'epicerie'), (new.id, 'laurier', 'epicerie'), (new.id, 'persil séché', 'epicerie'),
        (new.id, 'basilic séché', 'epicerie'), (new.id, 'levure chimique', 'epicerie'), (new.id, 'levure de boulanger', 'epicerie'),
        (new.id, 'bicarbonate de soude', 'epicerie'), (new.id, 'vinaigre', 'epicerie'), (new.id, 'vinaigre balsamique', 'epicerie'),
        (new.id, 'moutarde', 'epicerie'), (new.id, 'mayonnaise', 'epicerie'), (new.id, 'ketchup', 'epicerie'),
        (new.id, 'sauce soja', 'epicerie'), (new.id, 'sauce tomate', 'epicerie'), (new.id, 'concentré de tomate', 'epicerie'),
        (new.id, 'bouillon cube', 'epicerie'), (new.id, 'extrait de vanille', 'epicerie'), (new.id, 'gélatine', 'epicerie'),
        (new.id, 'fécule de maïs', 'epicerie'), (new.id, 'pignons de pin', 'epicerie'), (new.id, 'amandes', 'epicerie'),
        (new.id, 'noisettes', 'epicerie'), (new.id, 'noix', 'epicerie'), (new.id, 'graines de sésame', 'epicerie'),
        (new.id, 'graines de tournesol', 'epicerie'), (new.id, 'raisins secs', 'epicerie'),

        -- Boissons
        (new.id, 'eau', 'boissons'), (new.id, 'eau gazeuse', 'boissons'), (new.id, 'jus d''orange', 'boissons'),
        (new.id, 'jus de pomme', 'boissons'), (new.id, 'soda', 'boissons'), (new.id, 'vin blanc', 'boissons'),
        (new.id, 'vin rouge', 'boissons'), (new.id, 'bière', 'boissons'), (new.id, 'café', 'boissons'),
        (new.id, 'thé', 'boissons'), (new.id, 'grenadine', 'boissons');

    insert into storage_units (user_id, name, illustration, position) values
        (new.id, 'Frigo', 'frigo', 0),
        (new.id, 'Congélateur', 'congelateur', 1),
        (new.id, 'Placard', 'placard', 2),
        (new.id, 'Étagère', 'etagere-fruit', 3);

    return new;
end;
$$;

-- 4) Ajoute rétroactivement cette liste élargie aux comptes déjà existants (sans dupliquer ce qui y est
--    déjà grâce à la contrainte unique(user_id, name)).
insert into ingredients (user_id, name, category)
select u.id, v.name, v.category
from auth.users u
cross join (values
    ('citron vert', 'fruits'), ('clémentine', 'fruits'), ('pamplemousse', 'fruits'), ('framboise', 'fruits'),
    ('myrtille', 'fruits'), ('mûre', 'fruits'), ('cerise', 'fruits'), ('abricot', 'fruits'), ('pêche', 'fruits'),
    ('nectarine', 'fruits'), ('prune', 'fruits'), ('poire', 'fruits'), ('raisin', 'fruits'), ('kiwi', 'fruits'),
    ('mangue', 'fruits'), ('ananas', 'fruits'), ('pastèque', 'fruits'), ('melon', 'fruits'), ('figue', 'fruits'),
    ('grenade', 'fruits'), ('rhubarbe', 'fruits'), ('litchi', 'fruits'),
    ('échalote', 'legumes'), ('patate douce', 'legumes'), ('concombre', 'legumes'), ('épinard', 'legumes'),
    ('brocoli', 'legumes'), ('chou-fleur', 'legumes'), ('chou blanc', 'legumes'), ('chou rouge', 'legumes'),
    ('chou de bruxelles', 'legumes'), ('champignon', 'legumes'), ('haricot vert', 'legumes'), ('petit pois', 'legumes'),
    ('radis', 'legumes'), ('betterave', 'legumes'), ('céleri', 'legumes'), ('fenouil', 'legumes'),
    ('artichaut', 'legumes'), ('navet', 'legumes'), ('potiron', 'legumes'), ('maïs', 'legumes'), ('avocat', 'legumes'),
    ('cornichon', 'legumes'),
    ('poulet entier', 'proteines'), ('dinde', 'proteines'), ('steak', 'proteines'), ('escalope de veau', 'proteines'),
    ('porc', 'proteines'), ('côte de porc', 'proteines'), ('lardons', 'proteines'), ('jambon', 'proteines'),
    ('saucisse', 'proteines'), ('chorizo', 'proteines'), ('thon', 'proteines'), ('saumon', 'proteines'),
    ('cabillaud', 'proteines'), ('crevette', 'proteines'), ('moules', 'proteines'), ('poisson', 'proteines'),
    ('tofu', 'proteines'), ('lentilles', 'proteines'), ('pois chiches', 'proteines'), ('haricots rouges', 'proteines'),
    ('haricots blancs', 'proteines'),
    ('riz', 'feculents'), ('pâtes', 'feculents'), ('semoule', 'feculents'), ('pain', 'feculents'),
    ('pain de mie', 'feculents'), ('quinoa', 'feculents'), ('boulgour', 'feculents'), ('polenta', 'feculents'),
    ('biscottes', 'feculents'), ('chapelure', 'feculents'), ('farine de maïs', 'feculents'),
    ('lait demi-écrémé', 'laitages'), ('crème liquide', 'laitages'), ('fromage blanc', 'laitages'),
    ('yaourt grec', 'laitages'), ('mozzarella', 'laitages'), ('feta', 'laitages'), ('parmesan', 'laitages'),
    ('comté', 'laitages'), ('emmental', 'laitages'), ('chèvre', 'laitages'), ('mascarpone', 'laitages'),
    ('ricotta', 'laitages'), ('petit-suisse', 'laitages'), ('babeurre', 'laitages'),
    ('huile d''olive', 'matieres_grasses'), ('huile de tournesol', 'matieres_grasses'),
    ('huile de colza', 'matieres_grasses'), ('huile de coco', 'matieres_grasses'), ('margarine', 'matieres_grasses'),
    ('saindoux', 'matieres_grasses'), ('graisse de canard', 'matieres_grasses'),
    ('cassonade', 'sucreries'), ('sucre glace', 'sucreries'), ('sucre vanillé', 'sucreries'), ('miel', 'sucreries'),
    ('chocolat noir', 'sucreries'), ('chocolat au lait', 'sucreries'), ('chocolat blanc', 'sucreries'),
    ('pépites de chocolat', 'sucreries'), ('cacao en poudre', 'sucreries'), ('confiture', 'sucreries'),
    ('pâte à tartiner', 'sucreries'), ('caramel', 'sucreries'), ('bonbons', 'sucreries'),
    ('sirop d''érable', 'sucreries'), ('sirop d''agave', 'sucreries'),
    ('paprika', 'epicerie'), ('cumin', 'epicerie'), ('curry', 'epicerie'), ('muscade', 'epicerie'),
    ('cannelle', 'epicerie'), ('gingembre en poudre', 'epicerie'), ('herbes de Provence', 'epicerie'),
    ('thym', 'epicerie'), ('laurier', 'epicerie'), ('persil séché', 'epicerie'), ('basilic séché', 'epicerie'),
    ('levure de boulanger', 'epicerie'), ('vinaigre balsamique', 'epicerie'), ('moutarde', 'epicerie'),
    ('mayonnaise', 'epicerie'), ('ketchup', 'epicerie'), ('sauce soja', 'epicerie'), ('sauce tomate', 'epicerie'),
    ('concentré de tomate', 'epicerie'), ('bouillon cube', 'epicerie'), ('extrait de vanille', 'epicerie'),
    ('gélatine', 'epicerie'), ('fécule de maïs', 'epicerie'), ('pignons de pin', 'epicerie'), ('amandes', 'epicerie'),
    ('noisettes', 'epicerie'), ('noix', 'epicerie'), ('graines de sésame', 'epicerie'), ('graines de tournesol', 'epicerie'),
    ('raisins secs', 'epicerie'),
    ('eau gazeuse', 'boissons'), ('jus d''orange', 'boissons'), ('jus de pomme', 'boissons'), ('soda', 'boissons'),
    ('bière', 'boissons'), ('café', 'boissons'), ('thé', 'boissons'), ('grenadine', 'boissons')
) as v(name, category)
on conflict (user_id, name) do nothing;
