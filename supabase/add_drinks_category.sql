-- ============================================================
-- Add "Drinks" category
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- ============================================================

-- Insert category
INSERT INTO categories (name, slug, color)
VALUES ('Drinks', 'drinks', '#38bdf8')
ON CONFLICT (slug) DO NOTHING;

-- Insert category rules
INSERT INTO category_rules (category_id, match_text, language, priority)
SELECT id, match_text, language, priority
FROM (VALUES
  ('leros',                'cs', 250),
  ('leros',                'en', 250),
  ('deep sleep',           'en', 250),
  ('herbal tea',           'en', 250),
  ('čaj',                  'cs', 250),
  ('bylinkový',            'cs', 250),
  ('non-alcoholic beer',   'en', 250),
  ('nealkoholické',        'cs', 250),
  ('nealkoholické pivo',   'cs', 300),
  ('coca cola',            'en', 300),
  ('coca-cola',            'en', 300),
  ('pepsi',                'en', 250),
  ('sprite',               'en', 250),
  ('fanta',                'en', 250),
  ('juice',                'en', 200),
  ('džus',                 'cs', 200),
  ('energy drink',         'en', 250),
  ('red bull',             'en', 300),
  ('monster',              'en', 250),
  ('tonic',                'en', 200),
  ('sparkling water',      'en', 200),
  ('mineral water',        'en', 200),
  ('minerální voda',       'cs', 200),
  ('wrigley',              'en', 250),
  ('orbit',                'en', 250),
  ('žvýkačky',             'cs', 250),
  ('chewing gum',          'en', 250)
) AS t(match_text, language, priority)
CROSS JOIN categories
WHERE categories.slug = 'drinks';
