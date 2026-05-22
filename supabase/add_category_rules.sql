-- ============================================================
-- Category Rules Patch — add missing English + Czech keywords
-- Run in Supabase SQL Editor AFTER the main schema.sql
-- Safe to run multiple times (ON CONFLICT DO NOTHING)
-- ============================================================

INSERT INTO category_rules (category_id, match_text, language)
SELECT c.id, kw, lang
FROM categories c
CROSS JOIN (VALUES
  -- ── Alcohol ──────────────────────────────────────────────
  ('alcohol', 'gin',          'en'),
  ('alcohol', 'prosecco',     'en'),
  ('alcohol', 'sekt',         'cs'),
  ('alcohol', 'lihoviny',     'cs'),

  -- ── Pets ─────────────────────────────────────────────────
  ('pets', 'litter',          'en'),
  ('pets', 'kocici',          'cs'),
  ('pets', 'kocka',           'cs'),
  ('pets', 'psí',             'cs'),
  ('pets', 'psi',             'cs'),
  ('pets', 'stelivo',         'cs'),
  ('pets', 'kočičí',          'cs'),

  -- ── Protein ──────────────────────────────────────────────
  ('protein', 'pork',         'en'),
  ('protein', 'ham',          'en'),
  ('protein', 'steak',        'en'),
  ('protein', 'maso',         'cs'),
  ('protein', 'vepřové',      'cs'),
  ('protein', 'veprove',      'cs'),
  ('protein', 'šunka',        'cs'),
  ('protein', 'sunka',        'cs'),
  ('protein', 'tuňák',        'cs'),
  ('protein', 'tunak',        'cs'),
  ('protein', 'losos',        'cs'),
  ('protein', 'minced',       'en'),
  ('protein', 'mleté',        'cs'),
  ('protein', 'mlete',        'cs'),

  -- ── Carbs ────────────────────────────────────────────────
  ('carbs', 'flour',          'en'),
  ('carbs', 'tortilla',       'en'),
  ('carbs', 'wrap',           'en'),
  ('carbs', 'noodles',        'en'),
  ('carbs', 'mouka',          'cs'),
  ('carbs', 'nudle',          'cs'),
  ('carbs', 'knedlík',        'cs'),
  ('carbs', 'knedlik',        'cs'),
  ('carbs', 'houska',         'cs'),

  -- ── Sweets / Snacks ──────────────────────────────────────
  ('sweets-snacks', 'cookie',       'en'),
  ('sweets-snacks', 'ice cream',    'en'),
  ('sweets-snacks', 'waffle',       'en'),
  ('sweets-snacks', 'sušenka',      'cs'),
  ('sweets-snacks', 'susenka',      'cs'),
  ('sweets-snacks', 'oplatka',      'cs'),
  ('sweets-snacks', 'zmrzlina',     'cs'),
  ('sweets-snacks', 'tyčinka',      'cs'),
  ('sweets-snacks', 'tyčinky',      'cs'),
  ('sweets-snacks', 'tacinky',      'cs'),

  -- ── Groceries ────────────────────────────────────────────
  ('groceries', 'fruit',        'en'),
  ('groceries', 'vegetable',    'en'),
  ('groceries', 'milk',         'en'),
  ('groceries', 'yogurt',       'en'),
  ('groceries', 'cheese',       'en'),
  ('groceries', 'butter',       'en'),
  ('groceries', 'ovoce',        'cs'),
  ('groceries', 'zelenina',     'cs'),
  ('groceries', 'mléko',        'cs'),
  ('groceries', 'mleko',        'cs'),
  ('groceries', 'jogurt',       'cs'),
  ('groceries', 'sýr',          'cs'),
  ('groceries', 'syr',          'cs'),
  ('groceries', 'máslo',        'cs'),
  ('groceries', 'maslo',        'cs'),
  ('groceries', 'vejce',        'cs'),
  ('groceries', 'rohlik',       'cs'),
  ('groceries', 'rohlík',       'cs'),
  ('groceries', 'globus',       'cs'),
  ('groceries', 'penny',        'cs'),
  ('groceries', 'coop',         'cs'),

  -- ── Health / Pharmacy ────────────────────────────────────
  ('health-pharmacy', 'vitamin',    'en'),
  ('health-pharmacy', 'vitamín',    'cs'),
  ('health-pharmacy', 'vitamin',    'cs'),
  ('health-pharmacy', 'doktor',     'cs'),
  ('health-pharmacy', 'ordinace',   'cs'),

  -- ── Supplements ──────────────────────────────────────────
  ('supplements', 'creatine',   'en'),
  ('supplements', 'whey',       'en'),
  ('supplements', 'bcaa',       'en'),
  ('supplements', 'kreatin',    'cs'),
  ('supplements', 'doplněk',    'cs'),
  ('supplements', 'doplnek',    'cs'),

  -- ── Transport ────────────────────────────────────────────
  ('transport', 'lítačka',      'cs'),
  ('transport', 'litacka',      'cs'),
  ('transport', 'vlak',         'cs'),
  ('transport', 'autobus',      'cs'),
  ('transport', 'parking',      'en'),
  ('transport', 'parkování',    'cs'),
  ('transport', 'parkovani',    'cs'),

  -- ── Restaurants ──────────────────────────────────────────
  ('restaurants', 'bistro',     'en'),
  ('restaurants', 'sushi',      'en'),
  ('restaurants', 'kebab',      'en'),
  ('restaurants', 'bufet',      'cs'),
  ('restaurants', 'jídelna',    'cs'),
  ('restaurants', 'jidelna',    'cs'),
  ('restaurants', 'wolt',       'cs'),
  ('restaurants', 'dáme jídlo', 'cs'),
  ('restaurants', 'dame jidlo', 'cs')

) AS t(slug, kw, lang)
WHERE c.slug = t.slug
ON CONFLICT DO NOTHING;
