-- Cooking Mamacita — associe les avatars fournis aux profils existants Lilou et Rose
UPDATE consumer_profiles SET avatar = 'lilou' WHERE name = 'Lilou' AND avatar IS NULL;
UPDATE consumer_profiles SET avatar = 'rose' WHERE name = 'Rose' AND avatar IS NULL;
