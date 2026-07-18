-- ============================================================
-- Recategorize already-saved expense items (all invoices)
-- Safe to run multiple times. Run AFTER fruits_veggies_dairy_drinks.sql
-- (it needs the 'fruits-veggies' and 'dairy' categories to exist).
--
-- Matches by product description so the same product gets the same
-- category on every invoice, past and present.
-- ============================================================

-- Cat products → Pets
UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'pets')
WHERE description ILIKE ANY (ARRAY[
  'Inaba Churu%',
  'Felix Party mix%'
]);

-- Cleaning & household → Household
UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'household')
WHERE description ILIKE ANY (ARRAY[
  'Bref %',
  'Vileda %',
  'Frosch %',
  'Jar Dishwashing%',
  'Moddia kitchen towels%'
]);

-- Personal care → Personal Care
UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'personal-care')
WHERE description ILIKE ANY (ARRAY[
  'Herbal Essence%',
  'Ziaja %',
  'Sanytol %',
  'Isana %'
]);

-- Produce → Fruits & Veggies
UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'fruits-veggies')
WHERE description ILIKE ANY (ARRAY[
  'Banana %',
  'Potato %',
  'Red pepper%',
  'Roman salad%',
  'Little gem%'
]);

-- Dairy → Dairy
UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'dairy')
WHERE description ILIKE ANY (ARRAY[
  'Miil Butter%',
  'Miil Mozzarella%',
  'Miil Milk%',
  'Miil Fresh cream%',
  'Miil Cooking cream%',
  'Miil Skyr%',
  'Milko Greek yogurt%',
  'Bohušovická mlékárna%',
  'Deli Q Snack Gouda%'
]);

-- Grains & sweeteners (by macros) → Carbs
UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'carbs')
WHERE description ILIKE ANY (ARRAY[
  'Yutto Oat flakes%',
  'Kitchin BIO Fusilli%',
  'Alnatura Organic Grade C maple syrup%',
  'Medokomerc Honey%'
]);

-- Pantry & frozen → Groceries
UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'groceries')
WHERE description ILIKE ANY (ARRAY[
  'Buitoni %',
  'Kitchin Sweet corn%'
]);

-- Sports drinks → Non-Alcoholic Drinks
UPDATE expense_items
SET category_id = (SELECT id FROM categories WHERE slug = 'drinks')
WHERE description ILIKE 'Gatorade %';

-- Overall category of supermarket orders → Groceries
-- (matches what the vendor rules now produce for new invoices)
UPDATE expenses
SET category_id = (SELECT id FROM categories WHERE slug = 'groceries')
WHERE vendor_name ILIKE '%PECKA%';
