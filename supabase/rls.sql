-- ============================================================
-- RLS Policies — Expense Tracker
-- Run this in the Supabase SQL editor.
-- Requires: expenses.user_id column (already present in schema.sql as nullable uuid)
-- Requires: category_rules table needs a priority column (see below)
-- ============================================================

-- ── Add priority column to category_rules if not already present ──────────
ALTER TABLE category_rules ADD COLUMN IF NOT EXISTS priority integer DEFAULT 100;

-- ── Enable RLS on all tables ──────────────────────────────────────────────
ALTER TABLE expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_rules  ENABLE ROW LEVEL SECURITY;

-- ── expenses: users own their rows ────────────────────────────────────────
DROP POLICY IF EXISTS "expenses_select_own"  ON expenses;
DROP POLICY IF EXISTS "expenses_insert_own"  ON expenses;
DROP POLICY IF EXISTS "expenses_update_own"  ON expenses;
DROP POLICY IF EXISTS "expenses_delete_own"  ON expenses;

CREATE POLICY "expenses_select_own"
  ON expenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "expenses_insert_own"
  ON expenses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "expenses_update_own"
  ON expenses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "expenses_delete_own"
  ON expenses FOR DELETE
  USING (auth.uid() = user_id);

-- ── expense_items: access only through parent expense owned by the user ───
DROP POLICY IF EXISTS "expense_items_select_own"  ON expense_items;
DROP POLICY IF EXISTS "expense_items_insert_own"  ON expense_items;
DROP POLICY IF EXISTS "expense_items_update_own"  ON expense_items;
DROP POLICY IF EXISTS "expense_items_delete_own"  ON expense_items;

CREATE POLICY "expense_items_select_own"
  ON expense_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expenses
      WHERE expenses.id = expense_items.expense_id
        AND expenses.user_id = auth.uid()
    )
  );

CREATE POLICY "expense_items_insert_own"
  ON expense_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses
      WHERE expenses.id = expense_items.expense_id
        AND expenses.user_id = auth.uid()
    )
  );

CREATE POLICY "expense_items_update_own"
  ON expense_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM expenses
      WHERE expenses.id = expense_items.expense_id
        AND expenses.user_id = auth.uid()
    )
  );

CREATE POLICY "expense_items_delete_own"
  ON expense_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM expenses
      WHERE expenses.id = expense_items.expense_id
        AND expenses.user_id = auth.uid()
    )
  );

-- ── categories: readable by authenticated users, not editable ─────────────
DROP POLICY IF EXISTS "categories_select_authenticated"  ON categories;
DROP POLICY IF EXISTS "categories_select_anon"           ON categories;

CREATE POLICY "categories_select_authenticated"
  ON categories FOR SELECT
  TO authenticated
  USING (true);

-- Also allow anon to read categories (needed for the upload page pre-auth).
CREATE POLICY "categories_select_anon"
  ON categories FOR SELECT
  TO anon
  USING (true);

-- ── category_rules: readable by authenticated users ───────────────────────
DROP POLICY IF EXISTS "category_rules_select_authenticated"  ON category_rules;
DROP POLICY IF EXISTS "category_rules_select_anon"           ON category_rules;

CREATE POLICY "category_rules_select_authenticated"
  ON category_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "category_rules_select_anon"
  ON category_rules FOR SELECT
  TO anon
  USING (true);

-- ── Grants ────────────────────────────────────────────────────────────────
-- categories and rules: readable by both roles
GRANT SELECT ON public.categories      TO anon, authenticated;
GRANT SELECT ON public.category_rules  TO anon, authenticated;

-- expenses and items: authenticated users only (RLS does the row-level filtering)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_items TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
