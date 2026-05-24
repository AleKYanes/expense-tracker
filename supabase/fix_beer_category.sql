-- Add match_text rules for Svijanský Rytíř Czech lager (12% ABV).
-- "svijanský" matches the brewery; "rytíř" matches the brand name.
-- Both belong in Alcohol, not Drinks.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).

INSERT INTO category_rules (category_id, match_text, language, priority)
SELECT id, 'svijanský', 'cs', 300
FROM categories WHERE slug = 'alcohol'
ON CONFLICT DO NOTHING;

INSERT INTO category_rules (category_id, match_text, language, priority)
SELECT id, 'rytíř', 'cs', 300
FROM categories WHERE slug = 'alcohol'
ON CONFLICT DO NOTHING;
