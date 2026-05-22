-- ============================================================
-- Milestone 2 — New categories + improved rules for Rohlík
-- Run this in the Supabase SQL editor.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- ============================================================

-- ── Add priority column if missing ────────────────────────────────────────
ALTER TABLE category_rules ADD COLUMN IF NOT EXISTS priority integer DEFAULT 100;

-- ── New categories ────────────────────────────────────────────────────────
INSERT INTO categories (name, slug, color) VALUES
  ('Personal Care',      'personal-care',      '#f472b6'),
  ('Household',          'household',          '#a78bfa'),
  ('Nuts & Seeds',       'nuts-seeds',         '#d97706'),
  ('Fees / Adjustments', 'fees-adjustments',   '#94a3b8')
ON CONFLICT (slug) DO NOTHING;

-- ── Helper: lookup category id by slug ───────────────────────────────────
-- We use a DO block so we can reuse slug lookups cleanly.
DO $$
DECLARE
  id_alcohol          uuid;
  id_personal_care    uuid;
  id_household        uuid;
  id_protein          uuid;
  id_carbs            uuid;
  id_nuts_seeds       uuid;
  id_groceries        uuid;
  id_fees             uuid;
  id_transport        uuid;
BEGIN
  SELECT id INTO id_alcohol       FROM categories WHERE slug = 'alcohol';
  SELECT id INTO id_personal_care FROM categories WHERE slug = 'personal-care';
  SELECT id INTO id_household     FROM categories WHERE slug = 'household';
  SELECT id INTO id_protein       FROM categories WHERE slug = 'protein';
  SELECT id INTO id_carbs         FROM categories WHERE slug = 'carbs';
  SELECT id INTO id_nuts_seeds    FROM categories WHERE slug = 'nuts-seeds';
  SELECT id INTO id_groceries     FROM categories WHERE slug = 'groceries';
  SELECT id INTO id_fees          FROM categories WHERE slug = 'fees-adjustments';
  SELECT id INTO id_transport     FROM categories WHERE slug = 'transport';

  -- ── Alcohol (priority 200 — beats generic Groceries) ─────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_alcohol, 'red wine',         200),
    (id_alcohol, 'white wine',       200),
    (id_alcohol, 'rosé',             200),
    (id_alcohol, 'rose wine',        200),
    (id_alcohol, 'chardonnay',       200),
    (id_alcohol, 'muscat',           200),
    (id_alcohol, 'sauvignon',        200),
    (id_alcohol, 'primitivo',        200),
    (id_alcohol, 'pinot grigio',     200),
    (id_alcohol, 'cabernet',         200),
    (id_alcohol, 'bordeaux',         200),
    (id_alcohol, 'riesling',         200),
    (id_alcohol, 'prosecco',         200),
    (id_alcohol, 'champagne',        200),
    (id_alcohol, 'cava',             200),
    (id_alcohol, 'ale',              200),
    (id_alcohol, 'lager',            200),
    (id_alcohol, 'stout',            200),
    (id_alcohol, 'beer',             200),
    (id_alcohol, 'pivo',             200),
    (id_alcohol, 'víno',             200),
    (id_alcohol, 'vino',             200),
    (id_alcohol, 'wine',             200),
    (id_alcohol, 'rytíř',            200),
    (id_alcohol, 'rytir',            200),
    (id_alcohol, 'alkohol',          200),
    (id_alcohol, 'vodka',            200),
    (id_alcohol, 'whisky',           200),
    (id_alcohol, 'rum',              200),
    (id_alcohol, 'gin',              200),
    (id_alcohol, 'spirits',          200),
    (id_alcohol, '0.75l',            150)  -- 750ml bottle — likely wine
  ON CONFLICT DO NOTHING;

  -- ── Personal Care (priority 200) ──────────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_personal_care, 'rexona',            200),
    (id_personal_care, 'antiperspirant',    200),
    (id_personal_care, 'deodorant',         200),
    (id_personal_care, 'shower gel',        200),
    (id_personal_care, 'sprchový gel',      200),
    (id_personal_care, 'sprchovy gel',      200),
    (id_personal_care, 'shampoo',           200),
    (id_personal_care, 'šampon',            200),
    (id_personal_care, 'sampon',            200),
    (id_personal_care, 'conditioner',       200),
    (id_personal_care, 'hairspray',         200),
    (id_personal_care, 'lak na vlasy',      200),
    (id_personal_care, 'cotton buds',       200),
    (id_personal_care, 'vatové tyčinky',    200),
    (id_personal_care, 'vatove tycinky',    200),
    (id_personal_care, 'lip oil',           200),
    (id_personal_care, 'lip balm',          200),
    (id_personal_care, 'cosmetic',          200),
    (id_personal_care, 'toothbrush',        200),
    (id_personal_care, 'toothpaste',        200),
    (id_personal_care, 'zubní',             200),
    (id_personal_care, 'zubni',             200),
    (id_personal_care, 'razor',             200),
    (id_personal_care, 'moisturizer',       200),
    (id_personal_care, 'face cream',        200),
    (id_personal_care, 'sunscreen',         200)
  ON CONFLICT DO NOTHING;

  -- ── Household (priority 200) ──────────────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_household, 'air wick',              200),
    (id_household, 'spray refill',          200),
    (id_household, 'odpadkové pytle',       200),
    (id_household, 'odpadkove pytle',       200),
    (id_household, 'trash bags',            200),
    (id_household, 'garbage bags',          200),
    (id_household, 'cleaning spray',        200),
    (id_household, 'dishwasher',            200),
    (id_household, 'myčka',                 200),
    (id_household, 'mycka',                 200),
    (id_household, 'washing powder',        200),
    (id_household, 'prací prášek',          200),
    (id_household, 'praci prasek',          200),
    (id_household, 'fabric softener',       200),
    (id_household, 'aviváž',                200),
    (id_household, 'avivaz',                200),
    (id_household, 'toilet paper',          200),
    (id_household, 'toaletní papír',        200),
    (id_household, 'toaletni papir',        200),
    (id_household, 'kitchen roll',          200),
    (id_household, 'paper towel',           200),
    (id_household, 'kuchyňské utěrky',      200),
    (id_household, 'aluminum foil',         200),
    (id_household, 'alobal',                200)
  ON CONFLICT DO NOTHING;

  -- ── Protein — additional Rohlík-specific terms (priority 200) ─────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_protein, 'kuřecí',        200),
    (id_protein, 'kureci',        200),
    (id_protein, 'chicken',       200),
    (id_protein, 'hovězí',        200),
    (id_protein, 'hovezi',        200),
    (id_protein, 'beef',          200),
    (id_protein, 'krůtí',         200),
    (id_protein, 'kruti',         200),
    (id_protein, 'turkey',        200),
    (id_protein, 'šunka',         200),
    (id_protein, 'sunka',         200),
    (id_protein, 'ham',           200),
    (id_protein, 'vejce',         200),
    (id_protein, 'eggs',          200),
    (id_protein, 'egg',           200),
    (id_protein, 'salmon',        200),
    (id_protein, 'tuna',          200),
    (id_protein, 'fish',          200),
    (id_protein, 'ryba',          200),
    (id_protein, 'maso',          200),
    (id_protein, 'protein',       150)
  ON CONFLICT DO NOTHING;

  -- ── Carbs — additional Rohlík-specific terms (priority 200) ──────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_carbs, 'tagliatelle',     200),
    (id_carbs, 'pasta',           200),
    (id_carbs, 'těstoviny',       200),
    (id_carbs, 'testoviny',       200),
    (id_carbs, 'rýže',            200),
    (id_carbs, 'ryze',            200),
    (id_carbs, 'rice',            200),
    (id_carbs, 'bread',           200),
    (id_carbs, 'chléb',           200),
    (id_carbs, 'chleb',           200),
    (id_carbs, 'pečivo',          200),
    (id_carbs, 'pecivo',          200),
    (id_carbs, 'taco shells',     200),
    (id_carbs, 'tortilla',        200),
    (id_carbs, 'wrap',            200),
    (id_carbs, 'bakery',          200),
    (id_carbs, 'oats',            200),
    (id_carbs, 'oves',            200),
    (id_carbs, 'cereal',          200)
  ON CONFLICT DO NOTHING;

  -- ── Nuts & Seeds (priority 200) ───────────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_nuts_seeds, 'peanut butter',            200),
    (id_nuts_seeds, 'arašídový krém',           200),
    (id_nuts_seeds, 'arasidovy krem',           200),
    (id_nuts_seeds, 'peanuts',                  200),
    (id_nuts_seeds, 'arašídy',                  200),
    (id_nuts_seeds, 'arasidy',                  200),
    (id_nuts_seeds, 'sunflower seeds',          200),
    (id_nuts_seeds, 'slunečnicová semínka',     200),
    (id_nuts_seeds, 'slunecnicova seminka',     200),
    (id_nuts_seeds, 'almonds',                  200),
    (id_nuts_seeds, 'mandle',                   200),
    (id_nuts_seeds, 'walnuts',                  200),
    (id_nuts_seeds, 'vlašské ořechy',           200),
    (id_nuts_seeds, 'vlasske orechy',           200),
    (id_nuts_seeds, 'cashew',                   200),
    (id_nuts_seeds, 'kešu',                     200),
    (id_nuts_seeds, 'nuts',                     180),
    (id_nuts_seeds, 'ořechy',                   180),
    (id_nuts_seeds, 'orechy',                   180),
    (id_nuts_seeds, 'seeds',                    150)
  ON CONFLICT DO NOTHING;

  -- ── Groceries — common Rohlík items (priority 100, lower than above) ──
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_groceries, 'salad',         100),
    (id_groceries, 'salát',         100),
    (id_groceries, 'salat',         100),
    (id_groceries, 'romaine',       100),
    (id_groceries, 'mozzarella',    100),
    (id_groceries, 'cheese',        100),
    (id_groceries, 'sýr',           100),
    (id_groceries, 'syr',           100),
    (id_groceries, 'ketchup',       100),
    (id_groceries, 'sauce',         100),
    (id_groceries, 'soy sauce',     100),
    (id_groceries, 'sójová omáčka', 100),
    (id_groceries, 'sojova omacka', 100),
    (id_groceries, 'seasoning',     100),
    (id_groceries, 'koření',        100),
    (id_groceries, 'koreni',        100),
    (id_groceries, 'beans',         100),
    (id_groceries, 'fazole',        100),
    (id_groceries, 'omáčka',        100),
    (id_groceries, 'omacka',        100),
    (id_groceries, 'yogurt',        100),
    (id_groceries, 'jogurt',        100),
    (id_groceries, 'milk',          100),
    (id_groceries, 'mléko',         100),
    (id_groceries, 'mleko',         100),
    (id_groceries, 'butter',        100),
    (id_groceries, 'máslo',         100),
    (id_groceries, 'maslo',         100)
  ON CONFLICT DO NOTHING;

  -- ── Fees / Adjustments (priority 200) ────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_fees, 'courier tip',         200),
    (id_fees, 'spropitné',           200),
    (id_fees, 'spropitne',           200),
    (id_fees, 'delivery credit',     200),
    (id_fees, 'discount in credits', 200),
    (id_fees, 'return packages',     200),
    (id_fees, 'vratné lahve',        200),
    (id_fees, 'vratne lahve',        200),
    (id_fees, 'kredity',             200),
    (id_fees, 'haléřové',            200),
    (id_fees, 'halerove',            200),
    (id_fees, 'service fee',         200),
    (id_fees, 'poplatek',            200),
    (id_fees, 'penalty',             200),
    (id_fees, 'refund',              200),
    (id_fees, 'vrácení',             200),
    (id_fees, 'vraceni',             200)
  ON CONFLICT DO NOTHING;

  -- ── Transport (priority 200) ──────────────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_transport, 'delivery',    200),
    (id_transport, 'doprava',     200),
    (id_transport, 'transport',   200),
    (id_transport, 'shipping',    200),
    (id_transport, 'doručení',    200),
    (id_transport, 'doruceni',    200)
  ON CONFLICT DO NOTHING;

END $$;

-- ── Update priorities on existing low-priority rules for key terms ────────
-- Ensure alcohol-specific terms beat groceries for common Rohlík wine lines.
UPDATE category_rules SET priority = 200
WHERE match_text IN ('beer', 'wine', 'pivo', 'vino', 'víno', 'alkohol', 'spirits', 'vodka', 'rum', 'whisky')
  AND category_id = (SELECT id FROM categories WHERE slug = 'alcohol');
