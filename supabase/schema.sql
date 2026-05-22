-- ============================================================
-- Expense Tracker — Database Schema
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID extension (already enabled in Supabase by default)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text UNIQUE NOT NULL,
  color      text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- CATEGORY RULES  (keyword → category mapping)
-- ============================================================
CREATE TABLE IF NOT EXISTS category_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  match_text  text NOT NULL,
  language    text DEFAULT 'any',
  created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid,                      -- nullable; ready for future auth / RLS
  vendor_name          text,
  invoice_number       text,
  invoice_date         date,
  total_amount         numeric NOT NULL,
  tax_amount           numeric,
  currency             text DEFAULT 'CZK',
  category_id          uuid REFERENCES categories(id) ON DELETE SET NULL,
  status               text DEFAULT 'reviewed',
  source_file_name     text,
  raw_extraction_json  jsonb,
  confidence_score     numeric,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS expenses_updated_at ON expenses;
CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- EXPENSE ITEMS  (line items)
-- ============================================================
CREATE TABLE IF NOT EXISTS expense_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id       uuid REFERENCES expenses(id) ON DELETE CASCADE NOT NULL,
  description      text,
  quantity         numeric,
  unit_price       numeric,
  amount           numeric,
  tax_amount       numeric,
  category_id      uuid REFERENCES categories(id) ON DELETE SET NULL,
  confidence_score numeric,
  created_at       timestamptz DEFAULT now()
);

-- ============================================================
-- SEED: Default categories
-- ============================================================
INSERT INTO categories (name, slug, color) VALUES
  ('Groceries',          'groceries',          '#4ade80'),
  ('Restaurants',        'restaurants',        '#f97316'),
  ('Alcohol',            'alcohol',            '#8b5cf6'),
  ('Pets',               'pets',               '#f59e0b'),
  ('Protein',            'protein',            '#ef4444'),
  ('Carbs',              'carbs',              '#eab308'),
  ('Sweets / Snacks',    'sweets-snacks',       '#ec4899'),
  ('Supplements',        'supplements',        '#06b6d4'),
  ('Health / Pharmacy',  'health-pharmacy',    '#10b981'),
  ('Transport',          'transport',          '#3b82f6'),
  ('Housing',            'housing',            '#64748b'),
  ('Utilities',          'utilities',          '#78716c'),
  ('Subscriptions',      'subscriptions',      '#a855f7'),
  ('Shopping',           'shopping',           '#f43f5e'),
  ('Other',              'other',              '#94a3b8')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- SEED: Category rules (English + Czech keywords)
-- ============================================================
INSERT INTO category_rules (category_id, match_text, language)
SELECT id, kw, lang FROM categories c
CROSS JOIN (VALUES
  -- Alcohol
  ('alcohol', 'beer',    'en'), ('alcohol', 'wine',     'en'), ('alcohol', 'vodka',   'en'),
  ('alcohol', 'rum',     'en'), ('alcohol', 'whisky',   'en'), ('alcohol', 'spirits',  'en'),
  ('alcohol', 'pivo',    'cs'), ('alcohol', 'víno',     'cs'), ('alcohol', 'alkohol',  'cs'),
  ('alcohol', 'vino',    'cs'),
  -- Pets
  ('pets', 'dog food',   'en'), ('pets', 'cat food',    'en'), ('pets', 'pet',        'en'),
  ('pets', 'vet',        'en'), ('pets', 'veterinary',  'en'),
  ('pets', 'granule',    'cs'), ('pets', 'krmivo',      'cs'), ('pets', 'pes',        'cs'),
  ('pets', 'kočka',      'cs'), ('pets', 'kocka',       'cs'), ('pets', 'veterinář',  'cs'),
  ('pets', 'veterinar',  'cs'),
  -- Protein
  ('protein', 'chicken',  'en'), ('protein', 'beef',    'en'), ('protein', 'turkey',  'en'),
  ('protein', 'fish',     'en'), ('protein', 'salmon',  'en'), ('protein', 'tuna',    'en'),
  ('protein', 'eggs',     'en'), ('protein', 'protein', 'en'),
  ('protein', 'kuře',     'cs'), ('protein', 'kure',    'cs'), ('protein', 'kuřecí',  'cs'),
  ('protein', 'kureci',   'cs'), ('protein', 'hovězí',  'cs'), ('protein', 'hovezi',  'cs'),
  ('protein', 'krůtí',    'cs'), ('protein', 'kruti',   'cs'), ('protein', 'ryba',    'cs'),
  ('protein', 'vejce',    'cs'),
  -- Carbs
  ('carbs', 'rice',       'en'), ('carbs', 'pasta',     'en'), ('carbs', 'bread',     'en'),
  ('carbs', 'potatoes',   'en'), ('carbs', 'oats',      'en'), ('carbs', 'cereal',    'en'),
  ('carbs', 'rýže',       'cs'), ('carbs', 'ryze',      'cs'), ('carbs', 'těstoviny', 'cs'),
  ('carbs', 'testoviny',  'cs'), ('carbs', 'chléb',     'cs'), ('carbs', 'chleb',     'cs'),
  ('carbs', 'pečivo',     'cs'), ('carbs', 'pecivo',    'cs'), ('carbs', 'brambory',  'cs'),
  ('carbs', 'oves',       'cs'), ('carbs', 'rohlík',    'cs'), ('carbs', 'rohlik',    'cs'),
  -- Sweets / Snacks
  ('sweets-snacks', 'chocolate', 'en'), ('sweets-snacks', 'candy',     'en'),
  ('sweets-snacks', 'cake',      'en'), ('sweets-snacks', 'sweets',    'en'),
  ('sweets-snacks', 'chips',     'en'), ('sweets-snacks', 'biscuit',   'en'),
  ('sweets-snacks', 'čokoláda',  'cs'), ('sweets-snacks', 'cokolada',  'cs'),
  ('sweets-snacks', 'bonbony',   'cs'), ('sweets-snacks', 'dort',      'cs'),
  ('sweets-snacks', 'sladkosti', 'cs'), ('sweets-snacks', 'chipsy',    'cs'),
  -- Restaurants
  ('restaurants', 'restaurant', 'en'), ('restaurants', 'delivery',   'en'),
  ('restaurants', 'pizza',      'en'), ('restaurants', 'burger',     'en'),
  ('restaurants', 'café',       'en'), ('restaurants', 'cafe',       'en'),
  ('restaurants', 'restaurace', 'cs'), ('restaurants', 'rozvoz',     'cs'),
  ('restaurants', 'hospoda',    'cs'), ('restaurants', 'kavárna',    'cs'),
  ('restaurants', 'kavarna',    'cs'),
  -- Groceries
  ('groceries', 'supermarket', 'en'), ('groceries', 'grocery',     'en'),
  ('groceries', 'market',      'en'),
  ('groceries', 'potraviny',   'cs'), ('groceries', 'albert',      'cs'),
  ('groceries', 'tesco',       'cs'), ('groceries', 'lidl',        'cs'),
  ('groceries', 'billa',       'cs'), ('groceries', 'kaufland',    'cs'),
  ('groceries', 'rohlík.cz',   'cs'), ('groceries', 'kosik',       'cs'),
  -- Health / Pharmacy
  ('health-pharmacy', 'pharmacy',  'en'), ('health-pharmacy', 'doctor',    'en'),
  ('health-pharmacy', 'hospital',  'en'), ('health-pharmacy', 'medicine',  'en'),
  ('health-pharmacy', 'lékárna',   'cs'), ('health-pharmacy', 'lekarna',   'cs'),
  ('health-pharmacy', 'lékař',     'cs'), ('health-pharmacy', 'lekar',     'cs'),
  -- Transport
  ('transport', 'uber',     'en'), ('transport', 'taxi',     'en'),
  ('transport', 'fuel',     'en'), ('transport', 'petrol',   'en'),
  ('transport', 'bus',      'en'), ('transport', 'train',    'en'),
  ('transport', 'metro',    'en'), ('transport', 'benzin',   'cs'),
  ('transport', 'nafta',    'cs'), ('transport', 'jízdné',   'cs'),
  ('transport', 'jizdne',   'cs'),
  -- Subscriptions
  ('subscriptions', 'netflix',   'en'), ('subscriptions', 'spotify',   'en'),
  ('subscriptions', 'apple',     'en'), ('subscriptions', 'google',    'en'),
  ('subscriptions', 'microsoft', 'en'), ('subscriptions', 'adobe',     'en'),
  ('subscriptions', 'předplatné', 'cs'), ('subscriptions', 'predplatne', 'cs'),
  -- Shopping
  ('shopping', 'amazon',   'en'), ('shopping', 'ikea',     'en'),
  ('shopping', 'shop',     'en'), ('shopping', 'store',    'en'),
  ('shopping', 'mall',     'en')
) AS t(slug, kw, lang)
WHERE c.slug = t.slug
ON CONFLICT DO NOTHING;

-- ============================================================
-- ROW-LEVEL SECURITY (disabled for now — enable when you add auth)
-- ============================================================
-- ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE expense_items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;

-- When you add auth, add policies like:
-- CREATE POLICY "Users see own expenses"
--   ON expenses FOR ALL USING (auth.uid() = user_id);
