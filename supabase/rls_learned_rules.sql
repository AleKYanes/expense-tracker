-- ============================================================
-- Allow signed-in users to write category_rules.
-- Needed for the "learned rules" feature (v0.2.7): when you change a
-- product's category in the UI, the app stores a high-priority rule
-- keyed to that product's description so future scans classify it
-- the same way.
-- Safe to run multiple times.
-- ============================================================

DROP POLICY IF EXISTS "category_rules_insert_authenticated" ON category_rules;
DROP POLICY IF EXISTS "category_rules_update_authenticated" ON category_rules;
DROP POLICY IF EXISTS "category_rules_delete_authenticated" ON category_rules;

CREATE POLICY "category_rules_insert_authenticated"
  ON category_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "category_rules_update_authenticated"
  ON category_rules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "category_rules_delete_authenticated"
  ON category_rules FOR DELETE
  TO authenticated
  USING (true);

GRANT INSERT, UPDATE, DELETE ON public.category_rules TO authenticated;
