-- ============================================================
-- Vendor → Groceries rules for the overall expense category
-- Safe to run multiple times (NOT EXISTS guard per rule).
--
-- These rules exist so that supermarket orders get an overall
-- category of "Groceries" via the vendor-name match, instead of
-- a plurality vote across 30+ line items landing on something
-- misleading like "Protein".
--
-- CAUTION: category_rules are matched against line-item
-- descriptions too, not just vendor names. Only add vendor
-- strings here that cannot appear in a product name — e.g.
-- 'rohlik' alone would match the bread roll "Rohlík tukový",
-- and 'kosik' would match "košík" (basket). Use the legal
-- entity name or a distinctive suffix like '.cz' instead.
-- ============================================================

INSERT INTO category_rules (category_id, match_text, language, priority)
SELECT c.id, t.match_text, t.language, t.priority
FROM (VALUES
  ('velka pecka',    'cs', 500),  -- Rohlík.cz operator (VELKÁ PECKA s.r.o.)
  ('velká pecka',    'cs', 500),
  ('rohlik.cz',      'cs', 500),
  ('kosik.cz',       'cs', 500),
  ('billa',          'cs', 500),
  ('kaufland',       'cs', 500),
  ('albert',         'cs', 500),
  ('lidl',           'cs', 500),
  ('penny market',   'cs', 500),
  ('globus',         'cs', 500),
  ('makro',          'cs', 500),
  ('tesco stores',   'cs', 500)
) AS t(match_text, language, priority)
CROSS JOIN categories c
WHERE c.slug = 'groceries'
  AND NOT EXISTS (
    SELECT 1 FROM category_rules r
    WHERE r.category_id = c.id AND r.match_text = t.match_text
  );
