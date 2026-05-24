-- Add "peanutbutter" (one word) to Nuts & Seeds rules.
-- "peanut butter" (two words) already exists; this covers brand names like
-- "Yutto Peanutbutter" where the matcher does substring search without spaces.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).

INSERT INTO category_rules (category_id, match_text, language, priority)
SELECT id, 'peanutbutter', 'en', 300
FROM categories WHERE slug = 'nuts-seeds'
ON CONFLICT DO NOTHING;
