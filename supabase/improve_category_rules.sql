-- ============================================================
-- Category Rules — Priority Scoring + Rule Quality Fixes
-- Run in Supabase SQL Editor AFTER schema.sql and add_category_rules.sql
-- Safe to run multiple times.
-- ============================================================

-- ── 1. Add priority column ───────────────────────────────────────────────────
-- Higher value = preferred when multiple rules match the same text.
-- Default 100 keeps all existing rules working without changes.

ALTER TABLE category_rules ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 100;

-- Backfill any NULLs (in case column was added without DEFAULT)
UPDATE category_rules SET priority = 100 WHERE priority IS NULL;


-- ── 2. Remove over-matching / conflicting rules ──────────────────────────────

-- 'mleté'/'mlete' = "ground/minced" — too broad: matches ground coffee,
-- ground nuts, ground spices. The word 'maso' already catches meat context.
DELETE FROM category_rules
WHERE match_text IN ('mleté', 'mlete', 'minced')
  AND category_id = (SELECT id FROM categories WHERE slug = 'protein');

-- 'vejce' conflict: remove from groceries (eggs belong in Protein at p=200)
DELETE FROM category_rules
WHERE match_text = 'vejce'
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries');

-- 'rohlik'/'rohlík' conflict: remove from groceries.
-- "Rohlík" as a bread roll is Carbs; the grocery store name is matched at
-- vendor level (suggestOverallCategory) using 'rohlik.cz'.
DELETE FROM category_rules
WHERE match_text IN ('rohlik', 'rohlík')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries');

-- 'pet' is too short and can substring-match unrelated words.
-- Specific Czech pet terms (granule, krmivo, kocka, pes) are enough.
DELETE FROM category_rules
WHERE match_text = 'pet'
  AND category_id = (SELECT id FROM categories WHERE slug = 'pets');


-- ── 3. Set high priority (200) for specific protein identifiers ───────────────
UPDATE category_rules
SET priority = 200
WHERE category_id = (SELECT id FROM categories WHERE slug = 'protein')
  AND match_text IN (
    'kuřecí','kureci','kuře','kure',
    'hovězí','hovezi',
    'krůtí','kruti',
    'šunka','sunka',
    'vejce',
    'maso',
    'vepřové','veprove',
    'tuňák','tunak','losos','ryba',
    'protein',
    'chicken','beef','turkey','ham','eggs','fish','salmon','tuna','pork'
  );

-- 'steak', 'minced' keep default priority (100)
-- Generic terms like 'eggs' / 'fish' that can appear in other contexts stay at 200
-- because there's no realistic Czech grocery item where "vejce" means non-eggs.


-- ── 4. Lower priority for vendor/store names ─────────────────────────────────
-- These rules are useful for overall-expense category (matched against vendor name)
-- but should not beat specific product rules when matching item descriptions.
UPDATE category_rules
SET priority = 50
WHERE match_text IN (
  'albert','tesco','lidl','billa','kaufland','kosik','penny','coop','globus',
  'amazon','ikea',
  'netflix','spotify','apple','google','microsoft','adobe',
  'supermarket','grocery','market',
  'potraviny'
);


-- ── 5. Set carbs-specific terms to priority 150 ──────────────────────────────
UPDATE category_rules
SET priority = 150
WHERE category_id = (SELECT id FROM categories WHERE slug = 'carbs')
  AND match_text IN (
    'rýže','ryze','rice',
    'těstoviny','testoviny','pasta',
    'chléb','chleb','bread',
    'pečivo','pecivo',
    'brambory','potatoes',
    'rohlík','rohlik',
    'houska','oves','oats',
    'tortilla','wrap','mouka','flour',
    'knedlík','knedlik','nudle','noodles'
  );


-- ── 6. Insert new rules for Rohlik-style grocery invoices ────────────────────
-- Uses a NOT EXISTS guard so it's safe to re-run.

INSERT INTO category_rules (category_id, match_text, language, priority)
SELECT c.id, r.kw, r.lang, r.pri
FROM categories c
CROSS JOIN (VALUES
  -- ── Health / Pharmacy ─────────────────────────────────────────────
  ('health-pharmacy', 'listerine',        'en', 200),
  ('health-pharmacy', 'ustni voda',       'cs', 200),
  ('health-pharmacy', 'ústní voda',       'cs', 200),
  ('health-pharmacy', 'zubni pasta',      'cs', 200),
  ('health-pharmacy', 'zubní pasta',      'cs', 200),
  ('health-pharmacy', 'mouthwash',        'en', 200),
  ('health-pharmacy', 'colgate',          'en', 150),
  ('health-pharmacy', 'oral-b',           'en', 150),

  -- ── Transport ─────────────────────────────────────────────────────
  ('transport', 'doprava',                'cs', 200),
  ('transport', 'delivery fee',           'en', 200),
  ('transport', 'poplatek za dopravu',    'cs', 200),

  -- ── Shopping (household, non-food) ────────────────────────────────
  ('shopping', 'odpadkové pytle',         'cs', 250),
  ('shopping', 'odpadkove pytle',         'cs', 250),
  ('shopping', 'odpadkové sáčky',         'cs', 250),
  ('shopping', 'odpadkove sacky',         'cs', 250),
  ('shopping', 'odpadkov',                'cs', 150),
  ('shopping', 'pytle',                   'cs', 150),
  ('shopping', 'papírové kapesníky',      'cs', 200),
  ('shopping', 'papirove kapesniky',      'cs', 200),
  ('shopping', 'toaletní papír',          'cs', 200),
  ('shopping', 'toaletni papir',          'cs', 200),
  ('shopping', 'mycí prostředek',         'cs', 200),
  ('shopping', 'myci prostredek',         'cs', 200),
  ('shopping', 'prací prášek',            'cs', 200),
  ('shopping', 'praci prasek',            'cs', 200),
  ('shopping', 'washing up',              'en', 150),

  -- ── Other (invoice line items that aren't real products) ──────────
  ('other', 'kredit',                     'cs', 200),
  ('other', 'kredity',                    'cs', 200),
  ('other', 'haléřové vyrovnání',         'cs', 200),
  ('other', 'halerove vyrovnani',         'cs', 200),
  ('other', 'hálérové vyrovnání',         'cs', 200),
  ('other', 'halerove',                   'cs', 150),
  ('other', 'hálérové',                   'cs', 150),
  ('other', 'vratné láhve',               'cs', 200),
  ('other', 'vratne lahve',               'cs', 200),
  ('other', 'záloha lahve',               'cs', 200),
  ('other', 'zaloha lahve',               'cs', 200),
  ('other', 'poplatek',                   'cs', 100),
  ('other', 'sleva',                      'cs', 100),
  ('other', 'discount',                   'en', 100),

  -- ── Groceries: specific Czech food items not in other categories ───
  ('groceries', 'salát',                  'cs', 150),
  ('groceries', 'salat',                  'cs', 150),
  ('groceries', 'mozzarella',             'en', 150),
  ('groceries', 'fazole',                 'cs', 150),
  ('groceries', 'omáčka',                 'cs', 150),
  ('groceries', 'omacka',                 'cs', 150),
  ('groceries', 'sauce',                  'en', 100),
  ('groceries', 'taco',                   'en', 100),
  ('groceries', 'seasoning',              'en', 100),
  ('groceries', 'koření',                 'cs', 100),
  ('groceries', 'koreni',                 'cs', 100),
  ('groceries', 'chilli',                 'en', 100),
  ('groceries', 'semínka',                'cs', 150),
  ('groceries', 'seminka',                'cs', 150),
  ('groceries', 'slunečnicová',           'cs', 150),
  ('groceries', 'slunecnicova',           'cs', 150),
  ('groceries', 'arašídový',              'cs', 150),
  ('groceries', 'arasidovy',              'cs', 150),
  ('groceries', 'arašídy',                'cs', 150),
  ('groceries', 'arasidy',                'cs', 150),
  ('groceries', 'pražené',                'cs', 100),
  ('groceries', 'prazene',                'cs', 100),
  ('groceries', 'tvaroh',                 'cs', 100),
  ('groceries', 'creme',                  'en',  80),
  ('groceries', 'krém',                   'cs',  80),
  ('groceries', 'krem',                   'cs',  80),
  ('groceries', 'ketchup',                'en', 150),
  ('groceries', 'mustard',                'en', 150),
  ('groceries', 'hořčice',                'cs', 150),
  ('groceries', 'horcice',                'cs', 150),
  ('groceries', 'rajčata',                'cs', 150),
  ('groceries', 'rajcata',                'cs', 150),
  ('groceries', 'okurka',                 'cs', 150),
  ('groceries', 'mrkev',                  'cs', 150),
  ('groceries', 'cibule',                 'cs', 150),
  ('groceries', 'česnek',                 'cs', 150),
  ('groceries', 'cesnek',                 'cs', 150)

) AS r(slug, kw, lang, pri)
WHERE c.slug = r.slug
  AND NOT EXISTS (
    SELECT 1 FROM category_rules cr
    WHERE cr.category_id = c.id
      AND LOWER(cr.match_text) = LOWER(r.kw)
  );
