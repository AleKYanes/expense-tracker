# Expense Tracker

Upload invoices and receipts (PDF/images), extract expense data automatically with AWS Textract — with a dedicated parser for Rohlík delivery notes — categorize line items, and review your spending on a dashboard. Built with Next.js, Supabase, and Tailwind CSS.

## Features

- **Invoice scanning** — upload a PDF or photo; AWS Textract extracts vendor, date, totals, and line items. Czech receipts are supported (incl. DeepL translation of item names).
- **Rohlík parser** — a text-based fallback parser for Rohlík delivery-note PDFs that Textract struggles with.
- **Automatic categorization** — line items are matched to categories with priority rules.
- **Dashboard** — monthly total, invoice count, top category highlight, spending by category, and top vendors.
- **Export** — download your expenses as CSV, JSON, or XLSX.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` with your Supabase and AWS credentials (Supabase URL/anon key, AWS region/keys/S3 bucket).

3. Run the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm test` — run the test suite (vitest)
- `npm run lint` — lint

## Version history

- **v0.2.7** — Inline category editing: change any line item's category on the invoice page, the overall expense category, or a whole product from a category page. Edits propagate to every saved item of the same product and store a learned rule (the exact product description at top priority), so future scans classify that product the way you chose. Run `supabase/rls_learned_rules.sql` once to allow rule writes.
- **v0.2.6** — New Fruits & Veggies and Dairy categories; "Drinks" renamed to "Non-Alcoholic Drinks"; cat products always go to Pets (rules of ≤3 characters now match whole words only, so `cat` no longer hits "Muscat" and `lék` no longer hits "mlékárna"); expenses list sortable by date added or invoice date. Run `supabase/fruits_veggies_dairy_drinks.sql` then `supabase/fix_past_item_categories.sql` to migrate rules and recategorize saved invoices, and `supabase/more_rules_and_recats.sql` for a further batch of rules (personal care, ice cream, drink ice, salt/sugar, Grana Padano, Felix cat food…) and June-invoice fixes.
- **v0.2.5.5** — Category detail pages (`/categories/<slug>`): the month's products in a category ranked by money spent or purchase frequency (toggle), with quantities and the contributing expenses; dashboard category bars and top-category card link to them. Smarter overall category: vendor rules (run `supabase/grocery_vendor_rules.sql`) label supermarket orders as Groceries, the line-item vote is weighted by amount instead of item count, and mixed baskets with no dominant category fall back to Groceries instead of a misleading winner.
- **v0.2.5** — Pay-period budget card (13 000 CZK, payday on the 15th or the Friday before a weekend), 6-month spending trend chart, month navigation on the dashboard, click-through from category bars to a filtered expense list, duplicate-invoice warning on save, and correct handling of mixed currencies in dashboard totals.
- **v0.2.0** — Top-category highlight on the dashboard, app version shown in the navbar, lint cleanup.
- **v0.1.0** — Initial version: invoice upload + Textract scanning, Rohlík PDF fallback parser, categories, dashboard, exports.
