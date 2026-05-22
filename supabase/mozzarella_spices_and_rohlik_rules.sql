-- ============================================================
-- Milestone 3 patch — Spices/Condiments + protein dairy + Rohlík rules
-- Self-contained: inserts all required categories first, then rules.
-- Safe to re-run (ON CONFLICT DO NOTHING, ADD COLUMN IF NOT EXISTS).
-- Run in the Supabase SQL editor.
-- ============================================================

-- ── Step 1: Ensure priority column exists ────────────────────────────────────
ALTER TABLE category_rules ADD COLUMN IF NOT EXISTS priority integer DEFAULT 100;

-- ── Step 2: Insert ALL required categories (idempotent) ──────────────────────
INSERT INTO categories (name, slug, color) VALUES
  ('Groceries',          'groceries',          '#4ade80'),
  ('Alcohol',            'alcohol',            '#8b5cf6'),
  ('Protein',            'protein',            '#ef4444'),
  ('Carbs',              'carbs',              '#eab308'),
  ('Sweets / Snacks',    'sweets-snacks',      '#ec4899'),
  ('Supplements',        'supplements',        '#06b6d4'),
  ('Health / Pharmacy',  'health-pharmacy',    '#10b981'),
  ('Transport',          'transport',          '#3b82f6'),
  ('Housing',            'housing',            '#64748b'),
  ('Utilities',          'utilities',          '#78716c'),
  ('Subscriptions',      'subscriptions',      '#a855f7'),
  ('Shopping',           'shopping',           '#f43f5e'),
  ('Personal Care',      'personal-care',      '#f472b6'),
  ('Household',          'household',          '#a78bfa'),
  ('Nuts & Seeds',       'nuts-seeds',         '#d97706'),
  ('Fees / Adjustments', 'fees-adjustments',   '#94a3b8'),
  ('Spices / Condiments','spices-condiments',  '#f59e0b'),
  ('Other',              'other',              '#94a3b8')
ON CONFLICT (slug) DO NOTHING;

-- ── Step 3: Insert rules inside a DO block with null-safety guards ────────────
DO $$
DECLARE
  id_protein         uuid;
  id_spices          uuid;
  id_groceries       uuid;
  id_alcohol         uuid;
  id_carbs           uuid;
  id_personal_care   uuid;
  id_household       uuid;
  id_nuts_seeds      uuid;
  id_fees            uuid;
  id_transport       uuid;
BEGIN
  SELECT id INTO id_protein       FROM categories WHERE slug = 'protein';
  SELECT id INTO id_spices        FROM categories WHERE slug = 'spices-condiments';
  SELECT id INTO id_groceries     FROM categories WHERE slug = 'groceries';
  SELECT id INTO id_alcohol       FROM categories WHERE slug = 'alcohol';
  SELECT id INTO id_carbs         FROM categories WHERE slug = 'carbs';
  SELECT id INTO id_personal_care FROM categories WHERE slug = 'personal-care';
  SELECT id INTO id_household     FROM categories WHERE slug = 'household';
  SELECT id INTO id_nuts_seeds    FROM categories WHERE slug = 'nuts-seeds';
  SELECT id INTO id_fees          FROM categories WHERE slug = 'fees-adjustments';
  SELECT id INTO id_transport     FROM categories WHERE slug = 'transport';

  -- Guard: fail loudly instead of inserting null category_ids
  IF id_protein       IS NULL THEN RAISE EXCEPTION 'Category not found: protein';        END IF;
  IF id_spices        IS NULL THEN RAISE EXCEPTION 'Category not found: spices-condiments'; END IF;
  IF id_groceries     IS NULL THEN RAISE EXCEPTION 'Category not found: groceries';      END IF;
  IF id_alcohol       IS NULL THEN RAISE EXCEPTION 'Category not found: alcohol';        END IF;
  IF id_carbs         IS NULL THEN RAISE EXCEPTION 'Category not found: carbs';          END IF;
  IF id_personal_care IS NULL THEN RAISE EXCEPTION 'Category not found: personal-care'; END IF;
  IF id_household     IS NULL THEN RAISE EXCEPTION 'Category not found: household';      END IF;
  IF id_nuts_seeds    IS NULL THEN RAISE EXCEPTION 'Category not found: nuts-seeds';     END IF;
  IF id_fees          IS NULL THEN RAISE EXCEPTION 'Category not found: fees-adjustments'; END IF;
  IF id_transport     IS NULL THEN RAISE EXCEPTION 'Category not found: transport';      END IF;

  -- ── PROTEIN: dairy + meat at priority 250 ────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_protein, 'mozzarella',        250),
    (id_protein, 'cheese',            250),
    (id_protein, 'cheese threads',    250),
    (id_protein, 'curd',              250),
    (id_protein, 'tvaroh',            250),
    (id_protein, 'tvarůžky',          250),
    (id_protein, 'tvaruzky',          250),
    (id_protein, 'high protein curd', 260),
    (id_protein, 'protein curd',      260),
    (id_protein, 'quark',             250),
    (id_protein, 'cottage',           250),
    (id_protein, 'ricotta',           250),
    (id_protein, 'sýr',               250),
    (id_protein, 'syr',               250),
    (id_protein, 'chicken',           250),
    (id_protein, 'kuřecí',            250),
    (id_protein, 'kureci',            250),
    (id_protein, 'beef',              250),
    (id_protein, 'hovězí',            250),
    (id_protein, 'hovezi',            250),
    (id_protein, 'turkey',            250),
    (id_protein, 'krůtí',             250),
    (id_protein, 'kruti',             250),
    (id_protein, 'ham',               250),
    (id_protein, 'šunka',             250),
    (id_protein, 'sunka',             250),
    (id_protein, 'salmon',            250),
    (id_protein, 'tuna',              250),
    (id_protein, 'fish',              250),
    (id_protein, 'ryba',              250),
    (id_protein, 'maso',              250),
    (id_protein, 'eggs',              250),
    (id_protein, 'vejce',             250),
    (id_protein, 'egg',               250)
  ON CONFLICT DO NOTHING;

  -- ── SPICES / CONDIMENTS at priority 250 ──────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_spices, 'sauce',              250),
    (id_spices, 'sauces',             250),
    (id_spices, 'ketchup',            250),
    (id_spices, 'kečup',              250),
    (id_spices, 'kecup',              250),
    (id_spices, 'seasoning',          250),
    (id_spices, 'seasoning mix',      260),
    (id_spices, 'spice',              250),
    (id_spices, 'spices',             250),
    (id_spices, 'chilli',             250),
    (id_spices, 'chili',              250),
    (id_spices, 'soy sauce',          260),
    (id_spices, 'taco sauce',         260),
    (id_spices, 'fajita seasoning',   260),
    (id_spices, 'tex mex',            250),
    (id_spices, 'omáčka',             250),
    (id_spices, 'omacka',             250),
    (id_spices, 'koření',             250),
    (id_spices, 'koreni',             250),
    (id_spices, 'kotányi',            250),
    (id_spices, 'kotanyi',            250),
    (id_spices, 'santa maria',        250),
    (id_spices, 'heinz',              250),
    (id_spices, 'mustard',            250),
    (id_spices, 'hořčice',            250),
    (id_spices, 'horcice',            250),
    (id_spices, 'mayonnaise',         250),
    (id_spices, 'majonéza',           250),
    (id_spices, 'majoneza',           250),
    (id_spices, 'vinegar',            250),
    (id_spices, 'ocet',               250),
    (id_spices, 'dressing',           250),
    (id_spices, 'marinade',           250)
  ON CONFLICT DO NOTHING;

  -- ── ALCOHOL at priority 250 ───────────────────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_alcohol, 'red wine',      250),
    (id_alcohol, 'white wine',    250),
    (id_alcohol, 'rosé',          250),
    (id_alcohol, 'rose wine',     250),
    (id_alcohol, 'chardonnay',    250),
    (id_alcohol, 'muscat',        250),
    (id_alcohol, 'sauvignon',     250),
    (id_alcohol, 'primitivo',     250),
    (id_alcohol, 'pinot grigio',  250),
    (id_alcohol, 'cabernet',      250),
    (id_alcohol, 'bordeaux',      250),
    (id_alcohol, 'riesling',      250),
    (id_alcohol, 'prosecco',      250),
    (id_alcohol, 'beer',          250),
    (id_alcohol, 'pivo',          250),
    (id_alcohol, 'wine',          250),
    (id_alcohol, 'víno',          250),
    (id_alcohol, 'vino',          250),
    (id_alcohol, 'alkohol',       250),
    (id_alcohol, 'vodka',         250),
    (id_alcohol, 'whisky',        250),
    (id_alcohol, 'rum',           250),
    (id_alcohol, 'gin',           250),
    (id_alcohol, 'rytíř',         250),
    (id_alcohol, 'rytir',         250),
    (id_alcohol, '0.75l',         200)
  ON CONFLICT DO NOTHING;

  -- ── CARBS at priority 250 ─────────────────────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_carbs, 'tagliatelle',  250),
    (id_carbs, 'pasta',        250),
    (id_carbs, 'těstoviny',    250),
    (id_carbs, 'testoviny',    250),
    (id_carbs, 'rice',         250),
    (id_carbs, 'rýže',         250),
    (id_carbs, 'ryze',         250),
    (id_carbs, 'bread',        250),
    (id_carbs, 'chléb',        250),
    (id_carbs, 'chleb',        250),
    (id_carbs, 'pečivo',       250),
    (id_carbs, 'pecivo',       250),
    (id_carbs, 'taco shells',  250),
    (id_carbs, 'tortilla',     250),
    (id_carbs, 'wrap',         250),
    (id_carbs, 'bakery',       200),
    (id_carbs, 'oats',         200),
    (id_carbs, 'oves',         200),
    (id_carbs, 'cereal',       200)
  ON CONFLICT DO NOTHING;

  -- ── PERSONAL CARE at priority 250 ────────────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_personal_care, 'rexona',           250),
    (id_personal_care, 'antiperspirant',   250),
    (id_personal_care, 'deodorant',        250),
    (id_personal_care, 'shower gel',       250),
    (id_personal_care, 'sprchový gel',     250),
    (id_personal_care, 'sprchovy gel',     250),
    (id_personal_care, 'shampoo',          250),
    (id_personal_care, 'šampon',           250),
    (id_personal_care, 'sampon',           250),
    (id_personal_care, 'hairspray',        250),
    (id_personal_care, 'lak na vlasy',     250),
    (id_personal_care, 'cotton buds',      250),
    (id_personal_care, 'vatové tyčinky',   250),
    (id_personal_care, 'vatove tycinky',   250),
    (id_personal_care, 'lip oil',          250),
    (id_personal_care, 'lip balm',         250),
    (id_personal_care, 'cosmetic',         250),
    (id_personal_care, 'toothbrush',       250),
    (id_personal_care, 'toothpaste',       250),
    (id_personal_care, 'zubní',            250),
    (id_personal_care, 'zubni',            250),
    (id_personal_care, 'moisturizer',      250),
    (id_personal_care, 'sunscreen',        250)
  ON CONFLICT DO NOTHING;

  -- ── HOUSEHOLD at priority 250 ─────────────────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_household, 'air wick',            250),
    (id_household, 'spray refill',        250),
    (id_household, 'odpadkové pytle',     250),
    (id_household, 'odpadkove pytle',     250),
    (id_household, 'trash bags',          250),
    (id_household, 'garbage bags',        250),
    (id_household, 'cleaning spray',      250),
    (id_household, 'dishwasher',          250),
    (id_household, 'washing powder',      250),
    (id_household, 'prací prášek',        250),
    (id_household, 'praci prasek',        250),
    (id_household, 'fabric softener',     250),
    (id_household, 'aviváž',              250),
    (id_household, 'avivaz',              250),
    (id_household, 'toilet paper',        250),
    (id_household, 'toaletní papír',      250),
    (id_household, 'toaletni papir',      250),
    (id_household, 'kitchen roll',        250),
    (id_household, 'paper towel',         250),
    (id_household, 'alobal',              250)
  ON CONFLICT DO NOTHING;

  -- ── NUTS & SEEDS at priority 250 ─────────────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_nuts_seeds, 'peanut butter',          250),
    (id_nuts_seeds, 'arašídový krém',         250),
    (id_nuts_seeds, 'arasidovy krem',         250),
    (id_nuts_seeds, 'peanuts',                250),
    (id_nuts_seeds, 'arašídy',                250),
    (id_nuts_seeds, 'arasidy',                250),
    (id_nuts_seeds, 'sunflower seeds',        250),
    (id_nuts_seeds, 'slunečnicová semínka',   250),
    (id_nuts_seeds, 'slunecnicova seminka',   250),
    (id_nuts_seeds, 'almonds',                250),
    (id_nuts_seeds, 'mandle',                 250),
    (id_nuts_seeds, 'walnuts',                250),
    (id_nuts_seeds, 'cashew',                 250),
    (id_nuts_seeds, 'kešu',                   250),
    (id_nuts_seeds, 'nuts',                   200),
    (id_nuts_seeds, 'ořechy',                 200),
    (id_nuts_seeds, 'orechy',                 200),
    (id_nuts_seeds, 'seeds',                  180)
  ON CONFLICT DO NOTHING;

  -- ── FEES / ADJUSTMENTS at priority 250 ───────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_fees, 'courier tip',         250),
    (id_fees, 'spropitné',           250),
    (id_fees, 'spropitne',           250),
    (id_fees, 'delivery credit',     250),
    (id_fees, 'discount in credits', 250),
    (id_fees, 'return packages',     250),
    (id_fees, 'vratné lahve',        250),
    (id_fees, 'vratne lahve',        250),
    (id_fees, 'kredity',             250),
    (id_fees, 'haléřové',            250),
    (id_fees, 'halerove',            250),
    (id_fees, 'service fee',         250),
    (id_fees, 'poplatek',            250),
    (id_fees, 'refund',              250),
    (id_fees, 'vrácení',             250),
    (id_fees, 'vraceni',             250)
  ON CONFLICT DO NOTHING;

  -- ── TRANSPORT at priority 250 ─────────────────────────────────────────────
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_transport, 'delivery',   250),
    (id_transport, 'doprava',    250),
    (id_transport, 'transport',  250),
    (id_transport, 'shipping',   250),
    (id_transport, 'doručení',   250),
    (id_transport, 'doruceni',   250)
  ON CONFLICT DO NOTHING;

  -- ── GROCERIES at priority 100 (catch-all, loses to specific categories) ───
  INSERT INTO category_rules (category_id, match_text, priority) VALUES
    (id_groceries, 'salad',      100),
    (id_groceries, 'salát',      100),
    (id_groceries, 'salat',      100),
    (id_groceries, 'romaine',    100),
    (id_groceries, 'vegetables', 100),
    (id_groceries, 'fruit',      100),
    (id_groceries, 'beans',      100),
    (id_groceries, 'fazole',     100),
    (id_groceries, 'yogurt',     100),
    (id_groceries, 'jogurt',     100),
    (id_groceries, 'milk',       100),
    (id_groceries, 'mléko',      100),
    (id_groceries, 'mleko',      100),
    (id_groceries, 'butter',     100),
    (id_groceries, 'máslo',      100),
    (id_groceries, 'maslo',      100)
  ON CONFLICT DO NOTHING;

  -- ── Fix stale rules that pointed to Groceries but should be Protein/Spices ─
  UPDATE category_rules
  SET category_id = id_protein, priority = 250
  WHERE match_text IN ('mozzarella', 'cheese', 'sýr', 'syr')
    AND category_id = id_groceries;

  UPDATE category_rules
  SET category_id = id_spices, priority = 250
  WHERE match_text IN ('sauce', 'ketchup', 'seasoning', 'koření', 'koreni', 'omáčka', 'omacka', 'soy sauce')
    AND category_id = id_groceries;

END $$;
