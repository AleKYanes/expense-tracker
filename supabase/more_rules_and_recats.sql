-- ============================================================
-- Follow-up to v0.2.6: rules + recategorization for products that
-- were still landing in "Other" (spotted on June invoices).
-- Safe to run multiple times. Run AFTER fruits_veggies_dairy_drinks.sql.
-- ============================================================

-- ── New rules ─────────────────────────────────────────────────
INSERT INTO category_rules (category_id, match_text, language, priority)
SELECT c.id, t.match_text, t.language, t.priority
FROM (VALUES
  -- Personal care
  ('personal-care', 'body oil',       'en', 250),
  ('personal-care', 'yves rocher',    'en', 250),
  ('personal-care', 'gliss kur',      'en', 250),
  ('personal-care', 'balm',           'en', 250),
  ('personal-care', 'balzám',         'cs', 250),
  ('personal-care', 'balzam',         'cs', 250),
  ('personal-care', 'intim',          'en', 250),
  ('personal-care', 'tampon',         'en', 250),
  ('personal-care', 'tampax',         'en', 250),

  -- Household
  -- (no generic 'sponge' rule — it would catch sponge biscuits/cake;
  --  brand + Czech word cover the real products)
  ('household', 'houbička',           'cs', 300),
  ('household', 'houbicka',           'cs', 300),
  ('household', 'scrub mommy',        'en', 300),
  ('household', 'sodium bicarbonate', 'en', 300),

  -- Dairy
  ('dairy', 'grana padano',           'en', 220),
  ('dairy', 'parmesan',               'en', 220),
  ('dairy', 'parmazán',               'cs', 220),
  ('dairy', 'parmazan',               'cs', 220),
  ('dairy', 'yoghurt',                'en', 220),

  -- Sweets / snacks (ice cream brands, popcorn)
  ('sweets-snacks', 'magnum',         'en', 250),
  ('sweets-snacks', 'tipafrost',      'en', 250),
  ('sweets-snacks', 'cornetto',       'en', 250),
  ('sweets-snacks', 'nanuk',          'cs', 250),
  ('sweets-snacks', 'popcorn',        'en', 250),

  -- Non-alcoholic drinks (drink ice; coffee at 350 so 'coffee beans'
  -- beats the new 'beans' → Carbs rule)
  ('drinks', 'ice cubes',             'en', 250),
  ('drinks', 'ice bar',               'en', 250),
  ('drinks', 'coffee',                'en', 350),
  ('drinks', 'káva',                  'cs', 350),
  ('drinks', 'kava',                  'cs', 350),
  ('drinks', 'espresso',              'en', 350),

  -- Spices / condiments
  ('spices-condiments', 'vanilla paste', 'en', 250),
  -- (no generic 'salt' rule — it would catch 'unsalted'/'salty pickle';
  --  'sůl' is safe because 3-char rules match whole words only)
  ('spices-condiments', 'rock salt',     'en', 250),
  ('spices-condiments', 'sea salt',      'en', 250),
  ('spices-condiments', 'sůl',           'cs', 150),
  ('spices-condiments', 'sul',           'cs', 150),

  -- Carbs (sugar by macros; fries; corn, beans & legumes by macros)
  ('carbs', 'sugar',                  'en', 250),
  ('carbs', 'cukr',                   'cs', 250),
  ('carbs', 'sweet potato',           'en', 250),
  ('carbs', 'fries',                  'en', 250),
  -- 'corn' at 200 so 'popcorn'/'cornetto' (250) still win
  ('carbs', 'corn',                   'en', 200),
  ('carbs', 'sweet corn',             'en', 250),
  ('carbs', 'kukuřice',               'cs', 250),
  ('carbs', 'kukurice',               'cs', 250),
  -- 'beans' at 300 to beat 'tomato sauce'-style condiment matches
  ('carbs', 'beans',                  'en', 300),
  ('carbs', 'fazole',                 'cs', 300),
  ('carbs', 'peas',                   'en', 250),
  ('carbs', 'hrášek',                 'cs', 250),
  ('carbs', 'hrasek',                 'cs', 250),
  ('carbs', 'chickpea',               'en', 250),
  ('carbs', 'cizrna',                 'cs', 250),
  ('carbs', 'lentil',                 'en', 250),
  ('carbs', 'čočka',                  'cs', 250),
  ('carbs', 'cocka',                  'cs', 250)
) AS t(slug, match_text, language, priority)
JOIN categories c ON c.slug = t.slug
WHERE NOT EXISTS (
  SELECT 1 FROM category_rules r
  WHERE r.category_id = c.id AND r.match_text = t.match_text
);

-- ── Recategorize saved items (all invoices, by description) ───
UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'personal-care')
WHERE description ILIKE ANY (ARRAY[
  'Yves Rocher%',
  'Gliss Kur%',
  'Chilly Intima%',
  'Tampax%'
]);

UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'household')
WHERE description ILIKE ANY (ARRAY[
  '%Sodium bicarbonate%',
  'Scrub Mommy%'
]);

UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'dairy')
WHERE description ILIKE ANY (ARRAY[
  'Miil Grana Padano%',
  'Miil Gouda%',
  'Miil Greek Style Yoghurt%'
]);

-- Felix = cat food (Party mix, Soup, everything)
UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'pets')
WHERE description ILIKE 'Felix %';

UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'sweets-snacks')
WHERE description ILIKE ANY (ARRAY[
  'Magnum %',
  'Tipafrost%',
  '%Microwave Popcorn%'
]);

UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'drinks')
WHERE description ILIKE ANY (ARRAY[
  '%Ice cubes%',
  '%Ice bar balls%'
]);

UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'spices-condiments')
WHERE description ILIKE ANY (ARRAY[
  'Dr. Oetker Vanilla paste%',
  'Salt Mills%',
  '%rock salt%'
]);

UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'carbs')
WHERE description ILIKE ANY (ARRAY[
  'Kitchin Sugar%',
  '%Sweet potatoe fries%',
  '%Sweet potato fries%',
  'Kitchin Sweet corn%',
  'Kitchin Baked beans%',
  'Kitchin White Cannellini Beans%',
  'Kitchin Red kidney beans%',
  'Kitchin Peas%'
]);

UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'fruits-veggies')
WHERE description ILIKE 'Lettuce %';
