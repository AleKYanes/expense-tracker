-- ============================================================
-- v0.2.6 category overhaul
-- Safe to run multiple times.
--
-- 1. New categories: Fruits & Veggies, Dairy
-- 2. Rename "Drinks" → "Non-Alcoholic Drinks" (same id/slug, so all
--    existing expenses keep their category)
-- 3. Cat products → Pets at priority 600 (the app now matches rules of
--    ≤3 characters as whole words, so 'cat' won't hit "Muscat")
-- 4. Dairy keywords move out of Protein/Groceries into Dairy (220);
--    the 'protein' keyword is bumped to 300 so explicitly high-protein
--    products (protein curd desserts etc.) stay in Protein
-- 5. Extra rules: produce, non-alcoholic drinks, personal care (250),
--    household cleaners (300 — beats 'vinegar' on cleaning products)
-- ============================================================

-- ── 1. New categories ─────────────────────────────────────────
INSERT INTO categories (name, slug, color) VALUES
  ('Fruits & Veggies', 'fruits-veggies', '#84cc16'),
  ('Dairy',            'dairy',          '#93c5fd')
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Rename Drinks ──────────────────────────────────────────
UPDATE categories SET name = 'Non-Alcoholic Drinks' WHERE slug = 'drinks';

-- ── 4a. Move dairy keywords out of Protein and Groceries ──────
DELETE FROM category_rules
WHERE match_text IN (
  'milk', 'mléko', 'mleko', 'cheese', 'sýr', 'syr', 'mozzarella',
  'butter', 'máslo', 'maslo', 'yogurt', 'jogurt', 'skyr', 'tvaroh',
  'cheese threads'
)
AND category_id IN (SELECT id FROM categories WHERE slug IN ('protein', 'groceries'));

-- ── 4b. Keep explicitly high-protein products in Protein ──────
UPDATE category_rules SET priority = 300
WHERE match_text = 'protein'
  AND category_id = (SELECT id FROM categories WHERE slug = 'protein');

-- ── 4c. Don't let the new Dairy 'cream' rule (220) steal these ─
UPDATE category_rules SET priority = 300
WHERE match_text IN ('ice cream', 'zmrzlina')
  AND category_id = (SELECT id FROM categories WHERE slug = 'sweets-snacks');

UPDATE category_rules SET priority = 250
WHERE priority < 250
  AND category_id = (SELECT id FROM categories WHERE slug = 'personal-care');

-- ── 3 & 5. New rules ──────────────────────────────────────────
INSERT INTO category_rules (category_id, match_text, language, priority)
SELECT c.id, t.match_text, t.language, t.priority
FROM (VALUES
  -- Pets: cat products win over everything ('cat' matches whole words only)
  ('pets', 'cat',               'en', 600),
  ('pets', 'cat snack',         'en', 600),
  ('pets', 'churu',             'en', 600),
  ('pets', 'felix',             'en', 600),
  ('pets', 'whiskas',           'en', 600),

  -- Dairy (220: above produce/groceries, below meats at 250 and 'protein' at 300)
  ('dairy', 'milk',             'en', 220),
  ('dairy', 'mléko',            'cs', 220),
  ('dairy', 'mleko',            'cs', 220),
  ('dairy', 'mlékárna',         'cs', 220),
  ('dairy', 'mlekarna',         'cs', 220),
  ('dairy', 'cheese',           'en', 220),
  ('dairy', 'sýr',              'cs', 220),
  ('dairy', 'syr',              'cs', 220),
  ('dairy', 'mozzarella',       'en', 220),
  ('dairy', 'gouda',            'en', 220),
  ('dairy', 'eidam',            'cs', 220),
  ('dairy', 'cottage',          'en', 220),
  ('dairy', 'butter',           'en', 220),
  ('dairy', 'máslo',            'cs', 220),
  ('dairy', 'maslo',            'cs', 220),
  ('dairy', 'yogurt',           'en', 220),
  ('dairy', 'jogurt',           'cs', 220),
  ('dairy', 'skyr',             'cs', 220),
  ('dairy', 'tvaroh',           'cs', 220),
  ('dairy', 'curd',             'en', 220),
  ('dairy', 'cream',            'en', 220),
  ('dairy', 'smetana',          'cs', 220),
  ('dairy', 'kefir',            'cs', 220),
  ('dairy', 'kefír',            'cs', 220),

  -- Fruits & Veggies (200)
  ('fruits-veggies', 'banana',       'en', 200),
  ('fruits-veggies', 'banán',        'cs', 200),
  ('fruits-veggies', 'banan',        'cs', 200),
  ('fruits-veggies', 'potato',       'en', 200),
  ('fruits-veggies', 'brambor',      'cs', 200),
  ('fruits-veggies', 'tomato',       'en', 200),
  ('fruits-veggies', 'rajče',        'cs', 200),
  ('fruits-veggies', 'rajce',        'cs', 200),
  ('fruits-veggies', 'cucumber',     'en', 200),
  ('fruits-veggies', 'okurk',        'cs', 200),
  ('fruits-veggies', 'red pepper',   'en', 200),
  ('fruits-veggies', 'bell pepper',  'en', 200),
  ('fruits-veggies', 'yellow pepper','en', 200),
  ('fruits-veggies', 'salad',        'en', 200),
  ('fruits-veggies', 'salát',        'cs', 200),
  ('fruits-veggies', 'salat',        'cs', 200),
  ('fruits-veggies', 'lettuce',      'en', 200),
  ('fruits-veggies', 'onion',        'en', 200),
  ('fruits-veggies', 'cibul',        'cs', 200),
  ('fruits-veggies', 'garlic',       'en', 200),
  ('fruits-veggies', 'česnek',       'cs', 200),
  ('fruits-veggies', 'cesnek',       'cs', 200),
  ('fruits-veggies', 'avocado',      'en', 200),
  ('fruits-veggies', 'avokádo',      'cs', 200),
  ('fruits-veggies', 'apple',        'en', 200),
  ('fruits-veggies', 'jablk',        'cs', 200),
  ('fruits-veggies', 'lemon',        'en', 200),
  ('fruits-veggies', 'citron',       'cs', 200),
  ('fruits-veggies', 'lime',         'en', 200),
  ('fruits-veggies', 'spinach',      'en', 200),
  ('fruits-veggies', 'špenát',       'cs', 200),
  ('fruits-veggies', 'broccoli',     'en', 200),
  ('fruits-veggies', 'brokolice',    'cs', 200),
  ('fruits-veggies', 'carrot',       'en', 200),
  ('fruits-veggies', 'mrkev',        'cs', 200),
  ('fruits-veggies', 'zucchini',     'en', 200),
  ('fruits-veggies', 'cuket',        'cs', 200),
  ('fruits-veggies', 'mushroom',     'en', 200),
  ('fruits-veggies', 'žampion',      'cs', 200),
  ('fruits-veggies', 'strawberr',    'en', 200),
  ('fruits-veggies', 'jahod',        'cs', 200),
  ('fruits-veggies', 'blueberr',     'en', 200),
  ('fruits-veggies', 'borůvk',       'cs', 200),
  ('fruits-veggies', 'grape',        'en', 200),
  ('fruits-veggies', 'hrozn',        'cs', 200),
  ('fruits-veggies', 'zelenina',     'cs', 200),
  ('fruits-veggies', 'ovoce',        'cs', 200),

  -- Non-Alcoholic Drinks additions (250)
  ('drinks', 'gatorade',        'en', 250),
  ('drinks', 'isotonic',        'en', 250),
  ('drinks', 'iontový',         'cs', 250),
  ('drinks', 'iontovy',         'cs', 250),
  ('drinks', 'kombucha',        'en', 250),
  ('drinks', 'lemonade',        'en', 250),
  ('drinks', 'limonáda',        'cs', 250),
  ('drinks', 'limonada',        'cs', 250),
  ('drinks', 'ice tea',         'en', 250),
  ('drinks', 'iced tea',        'en', 250),
  ('drinks', 'ledový čaj',      'cs', 250),
  ('drinks', 'kofola',          'cs', 250),
  ('drinks', 'smoothie',        'en', 250),
  -- 'čaj' is 3 chars and now whole-word only; cover tea-adjective forms
  ('drinks', 'čajov',           'cs', 250),
  ('drinks', 'cajov',           'cs', 250),

  -- Personal Care (250 — must beat dairy 'milk' on "Goat's milk body lotion")
  ('personal-care', 'body lotion',   'en', 250),
  ('personal-care', 'lotion',        'en', 250),
  ('personal-care', 'conditioner',   'en', 250),
  ('personal-care', 'kondicionér',   'cs', 250),
  ('personal-care', 'kondicioner',   'cs', 250),
  ('personal-care', 'shampoo',       'en', 250),
  ('personal-care', 'šampon',        'cs', 250),
  ('personal-care', 'sampon',        'cs', 250),
  ('personal-care', 'soap',          'en', 250),
  ('personal-care', 'mýdlo',         'cs', 250),
  ('personal-care', 'mydlo',         'cs', 250),
  ('personal-care', 'toothpaste',    'en', 250),
  ('personal-care', 'mouthwash',     'en', 250),
  ('personal-care', 'make-up',       'en', 250),
  ('personal-care', 'makeup',        'en', 250),
  ('personal-care', 'deodorant',     'en', 250),
  ('personal-care', 'hair oil',      'en', 250),
  ('personal-care', 'scalp',         'en', 250),

  -- Household cleaners (300 — beats 'vinegar'/'floral' style food matches)
  ('household', 'cleaner',          'en', 300),
  ('household', 'čistič',           'cs', 300),
  ('household', 'cistic',           'cs', 300),
  ('household', 'dishwashing',      'en', 300),
  ('household', 'gloves',           'en', 300),
  ('household', 'rukavice',         'cs', 300),
  ('household', 'toilet',           'en', 300),
  ('household', 'kitchen towels',   'en', 300),
  ('household', 'utěrky',           'cs', 300),
  ('household', 'uterky',           'cs', 300),

  -- Carbs: sweeteners by macros (maple syrup, honey)
  ('carbs', 'maple syrup',      'en', 250),
  ('carbs', 'javorový sirup',   'cs', 250),
  ('carbs', 'javorovy sirup',   'cs', 250),
  ('carbs', 'honey',            'en', 250),
  ('carbs', 'oat flakes',       'en', 250),
  ('carbs', 'fusilli',          'en', 250)
) AS t(slug, match_text, language, priority)
JOIN categories c ON c.slug = t.slug
WHERE NOT EXISTS (
  SELECT 1 FROM category_rules r
  WHERE r.category_id = c.id AND r.match_text = t.match_text
);
