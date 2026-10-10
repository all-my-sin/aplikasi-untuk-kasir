# Retail POS

A production-ready Point of Sale system for small and medium retail stores:
fast cashier screen with barcode scanning, real-time inventory, atomic checkout,
58/80 mm thermal receipts, sales & profit reports, user roles and an audit log.

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS (shadcn/ui-style components) + TanStack Query + React Hook Form + Zod ·
Node.js + Express 5 + TypeScript · PostgreSQL 16 + Prisma 6 · Vitest + Supertest.

---

## Contents

1. [Requirements](#1-requirements)
2. [Installation](#2-installation)
3. [Environment variables](#3-environment-variables)
4. [PostgreSQL setup](#4-postgresql-setup)
5. [Prisma setup](#5-prisma-setup)
6. [Database migration](#6-database-migration)
7. [Seed data](#7-seed-data)
8. [Running in development](#8-running-in-development)
9. [Production build](#9-production-build)
10. [Development login credentials](#10-development-login-credentials)
11. [Barcode scanner setup](#11-barcode-scanner-setup)
12. [Thermal printer setup](#12-thermal-printer-setup)
13. [Deployment](#13-deployment)
14. [Testing & quality checks](#14-testing--quality-checks)
15. [Architecture notes](#15-architecture-notes)
16. [API reference](#16-api-reference)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Requirements

| Tool | Version |
| --- | --- |
| Node.js | 20 or newer (tested on 24) |
| npm | 10 or newer |
| PostgreSQL | 14 or newer (16 recommended), **or** Docker Desktop to run it in a container |
| Browser | A recent Chrome / Edge / Firefox. Chrome or Edge is recommended for printing. |

## 2. Installation

```bash
git clone <your-repo-url> retail-pos
cd retail-pos
npm install          # installs all workspaces and generates the Prisma client
cp .env.example .env # then edit .env (see below)
```

The repository is an npm-workspaces monorepo:

```text
retail-pos/
├── shared/            # Code used by BOTH frontend and backend
│   └── src/           #   Zod schemas, money/tax/discount maths, receipt layout, CSV, DTO types
├── backend/
│   ├── src/
│   │   ├── config/       # env validation
│   │   ├── controllers/  # request/response handlers
│   │   ├── routes/       # URL → middleware → controller wiring
│   │   ├── services/     # business logic (checkout, inventory, reports…)
│   │   ├── middleware/   # auth, role checks, CSRF, error handling
│   │   ├── validators/   # query-string validators
│   │   └── lib/          # prisma client, logger, errors, audit log, dates
│   └── tests/            # API integration tests (real PostgreSQL)
├── frontend/
│   └── src/
│       ├── components/   # UI kit (button, dialog, table…) + receipt, scanner, charts
│       ├── pages/        # one file per screen (POS, Products, Inventory…)
│       ├── layouts/      # sidebar layout
│       ├── hooks/        # auth, cart, barcode scanner, hotkeys…
│       ├── services/     # typed API calls
│       └── lib/          # api client, printing, dates, utils
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── docker-compose.yml    # PostgreSQL for development
└── .env.example
```

## 3. Environment variables

All configuration lives in **one `.env` file at the repository root** (read by the backend, Prisma and the tests).
The server refuses to start with a clear message if a required variable is missing or invalid.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `TEST_DATABASE_URL` | for tests | — | Separate database for automated tests. **It is wiped by the tests** and must differ from `DATABASE_URL`. Created automatically if missing. |
| `JWT_SECRET` | ✅ | — | At least 32 random characters. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | | `12h` | Session lifetime (e.g. `8h`, `1d`) |
| `PORT` | | `4000` | API / production server port |
| `NODE_ENV` | | `development` | `production` in production |
| `CORS_ORIGIN` | | `http://localhost:5173` | Comma-separated allowed browser origins (only needed if the frontend is served from a different origin) |
| `COOKIE_SECURE` | | `true` in production | Set `true` when served over HTTPS. Also enables HSTS and `upgrade-insecure-requests`. Set `false` to run over plain HTTP on a local network. |
| `UPLOAD_DIR` | | `uploads` | Where product images and the store logo are stored (relative to the repo root) |
| `BCRYPT_ROUNDS` | | `12` | Password hashing cost |
| `TRUST_PROXY` | | `false` | Set `true` behind a reverse proxy (nginx, Caddy…) so rate limiting sees real client IPs |

> Never commit `.env`. Only `.env.example` (without secrets) belongs in git.

## 4. PostgreSQL setup

**Option A — Docker (easiest)**

```bash
npm run db:up        # starts postgres:16 on localhost:5433 (see docker-compose.yml)
```

The default `.env.example` already points at this container
(`postgresql://pos:pos_dev_password@localhost:5433/pos`). Change the password in
`docker-compose.yml` and `.env` for anything other than local development.

**Option B — your own PostgreSQL server**

```sql
CREATE USER pos WITH PASSWORD 'choose-a-strong-password';
CREATE DATABASE pos OWNER pos;
-- optional, for the test-suite (or let the tests create it — needs CREATEDB):
CREATE DATABASE pos_test OWNER pos;
```

Then set `DATABASE_URL` / `TEST_DATABASE_URL` in `.env`.

## 5. Prisma setup

The Prisma client is generated automatically by `npm install` (`postinstall`).
To regenerate it manually after changing `prisma/schema.prisma`:

```bash
npm run db:generate
```

Browse the data with Prisma Studio: `npm run db:studio`.

## 6. Database migration

```bash
npm run db:migrate   # development: applies migrations (and creates new ones after schema changes)
npm run db:deploy    # production / CI: applies pending migrations only
```

The initial migration also adds PostgreSQL `CHECK` constraints that Prisma cannot express —
for example `stock >= 0` and `amountPaid >= total` — as a last line of defence for data integrity.

## 7. Seed data

```bash
npm run db:seed
```

Creates (idempotently — safe to run twice):

- an **admin** and a **cashier** account (see below),
- store settings (Toko Sejahtera, Asia/Jakarta, 58 mm receipts),
- 6 categories and 18 products with realistic IDR prices and a mix of in-stock, low-stock and out-of-stock levels,
- ~2 weeks of sample sales (with matching inventory movements) so the dashboard and reports have data.

`npm run db:reset` drops the database, re-applies migrations and re-seeds.

## 8. Running in development

```bash
npm run db:up      # if using Docker
npm run db:migrate
npm run db:seed
npm run dev        # API on :4000 + Vite dev server on :5173
```

Open **http://localhost:5173**. Vite proxies `/api` and `/uploads` to the API, so the
browser only ever talks to one origin.

## 9. Production build

```bash
npm run build      # builds frontend (frontend/dist) and backend (backend/dist/server.js)
npm run db:deploy  # apply migrations to the production database
NODE_ENV=production npm start
```

In production the Express server **also serves the built React app**, so one process on one port
(`PORT`, default 4000) is all you need. Uploaded images are stored in `UPLOAD_DIR` — back this folder up.

## 10. Development login credentials

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `admin123` |
| Cashier | `cashier` | `cashier123` |

> ⚠️ **Development only.** These come from `prisma/seed.ts`. Before going live, sign in as admin,
> create real accounts with strong passwords (Users → New user), then deactivate or reset these two.

## 11. Barcode scanner setup

Most USB and Bluetooth barcode scanners work as a **keyboard** ("HID keyboard mode"): they type the
barcode digits very quickly and press **Enter**. No driver or software is needed.

1. Plug in the scanner. Make sure it is in **USB HID / keyboard** mode and sends an **Enter (CR) suffix**
   after each scan (this is the factory default on most models; otherwise scan the "Add CR suffix"
   code in the scanner's manual).
2. Set the scanner's keyboard layout to match the computer (usually US).
3. Open **POS / Cashier**. The "Scan barcode or search" box is focused automatically — scan a product.

Behaviour:

- Exact **barcode** or **SKU** match → added to the cart; scanning again increases the quantity.
- Not enough stock → a warning shows how many are available; the cart is not changed.
- Unknown barcode → "No product found for code …".
- Scans are also captured when the focus is **not** in a text field (the app detects the fast
  keystroke burst), so cashiers don't have to click the box first.
- **Camera scanning:** the camera button next to the search box scans barcodes with a phone, tablet
  or webcam. Browsers only allow camera access on `https://` or `localhost`.

Keyboard shortcuts on the POS screen: **F2** focus search · **F4** open payment · **Enter** confirm payment · **Esc** close dialog / clear search.

## 12. Thermal printer setup

Receipts are printed through the browser's print dialog from a hidden frame that contains **only
the receipt**, laid out as fixed-width text sized for thermal paper:

| Paper | Printable width | Characters / line |
| --- | --- | --- |
| 58 mm | 48 mm | 32 |
| 80 mm | 72 mm | 48 |

Choose the default size in **Settings → Receipt**; the cashier can switch 58/80 mm in the receipt preview.

**One-time printer setup (Windows / macOS / Linux):**

1. Install the manufacturer's driver for your thermal printer (Epson TM series, Xprinter, etc.).
2. In the driver's **printing preferences**, set the paper to the roll width (58 or 80 mm) and the
   length to "receipt / continuous" if available, so there is no blank page feed.
3. Print a receipt from the app once. In the browser print dialog choose your thermal printer,
   **Margins: None**, **Scale: 100%**, untick **Headers and footers**. Chrome/Edge remember these settings.

**Optional — print without the dialog (kiosk mode):** start Chrome/Edge with
`--kiosk-printing` (e.g. a desktop shortcut:
`"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing http://localhost:4000`).
Receipts then go straight to the **default printer** — make the thermal printer the OS default.

Reprints: open **Transactions**, click a transaction, then **Reprint receipt** (the receipt is marked "REPRINT").

> Direct ESC/POS printing over USB/network (without the browser) is intentionally not used: it requires
> per-model drivers or a local print agent. The browser approach works with any printer that has an OS driver.

## 13. Deployment

**Single server (typical small store)**

1. Install Node.js 20+ and PostgreSQL (or Docker).
2. `npm ci && npm run build`
3. Set a production `.env`: strong `JWT_SECRET`, real `DATABASE_URL`, `NODE_ENV=production`.
4. `npm run db:deploy` (and **don't** run the seed, or change the seeded passwords immediately).
5. Run `npm start` with a process manager so it restarts automatically, e.g.
   `npx pm2 start "npm start" --name pos && npx pm2 save` or a systemd service / Windows service (NSSM).
6. Cashier PCs open `http://<server-ip>:4000`.

**HTTPS (recommended, required for camera scanning on other devices):** put a reverse proxy such as
Caddy or nginx in front, then set `COOKIE_SECURE=true` and `TRUST_PROXY=true`. Example Caddyfile:

```text
pos.example.com {
  reverse_proxy localhost:4000
}
```

**Running over plain HTTP on a LAN** is supported: keep `COOKIE_SECURE=false`.

**Backups:** schedule `pg_dump` of the database and back up the `UPLOAD_DIR` folder.

## 14. Testing & quality checks

```bash
npm run typecheck   # TypeScript, all workspaces
npm run lint        # ESLint
npm test            # shared unit tests + backend integration tests + frontend unit tests
npm run build       # production build
```

Backend tests run against a real PostgreSQL database (`TEST_DATABASE_URL`, created and migrated
automatically) — nothing is mocked. They cover login, sessions & revocation, CSRF, role permissions,
product/category CRUD, CSV import/export, inventory adjustments and stock opname, negative-stock
prevention (application + DB constraint), and the checkout flow in depth: totals, discounts, tax,
change, insufficient payment, stock deduction, price snapshots, **rollback when a late step fails**
(simulated with a DB trigger), **concurrent checkouts that would oversell**, unique sequential
transaction numbers, idempotent retries, voids, and profit/report calculations.

## 15. Architecture notes

**Checkout is one database transaction.** `backend/src/services/transactions.service.ts` locks the
product rows (`SELECT … FOR UPDATE`, in id order to avoid deadlocks), recomputes all prices and
totals from the database (client prices are never trusted), validates stock and payment, then
creates the transaction, items, payment, stock decrements, inventory movements and audit-log entry.
Any failure rolls everything back. A `CHECK (stock >= 0)` constraint backs this up.

**Transaction numbers** (`INV-YYYYMMDD-XXXX`, date in the store time zone) come from a per-day counter
row incremented with an atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` inside the checkout
transaction — unique under concurrency and gap-free (a failed checkout rolls the counter back).

**Idempotency:** the POS sends a random `clientRef` with each payment attempt. A retried or
double-submitted checkout returns the original sale instead of charging twice.

**Historical accuracy:** each transaction item stores the product name, SKU, unit, selling price and
**purchase price at the time of sale**. Reports use these snapshots, so editing a product never
changes past revenue or profit. Products referenced by history are never hard-deleted — "delete"
archives them.

**Money** is stored as integer Rupiah. Totals:
`subtotal = Σ price × qty` → `discount` (fixed or %, capped at subtotal) →
`tax = round((subtotal − discount) × rate%)` (when enabled) → `total`. The same function
(`shared/src/money.ts`) powers the live cart and the server, so they always agree.

**Profit definitions** (completed sales only; voided sales are excluded):

| Metric | Formula |
| --- | --- |
| Item profit | `(sellingPrice − purchasePrice) × quantity` |
| Revenue (net sales) | `Σ subtotal − Σ discounts` (tax excluded) |
| Cost of goods sold | `Σ purchasePrice × quantity` |
| Gross profit | `Revenue − COGS` = `Σ item profit − discounts` |
| Profit margin | `Gross profit / Revenue` |

Best-seller profit per product is item profit before transaction-level discounts.

**Security:** bcrypt password hashing; JWT in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over
HTTPS) — never readable by JavaScript; sessions are re-validated against the database on every
request, so deactivating a user, changing their role or resetting their password signs them out
immediately; role checks on every admin endpoint; cashiers never receive purchase prices or profit
data; login rate limiting (10 failed attempts / 15 min per IP + username); CSRF protection via a
required custom header; Helmet security headers & CSP; Zod validation of every request body and
query; Prisma parameterised queries; uploads restricted to PNG/JPG/WEBP/GIF ≤ 2 MB with random
server-side filenames; CSV exports neutralise spreadsheet formula injection; errors are logged on the
server and users only ever see friendly messages.

**Performance:** all lists are paginated, filtered and sorted in the database; indexes on product
name/category/stock, transaction date/status/cashier, movement product/date and audit-log date;
reports aggregate in SQL.

## 16. API reference

All endpoints are under `/api`, use JSON, and (except login) require the session cookie.
State-changing requests must send the header `X-Requested-With: XMLHttpRequest`.
Errors look like `{ "error": { "message": "…", "code": "…", "fields": { … } } }`.

| Method & path | Role | Description |
| --- | --- | --- |
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` | any | Session |
| `GET /products` | any | List (search, categoryId, stockStatus, isActive, sort, order, page, pageSize) |
| `GET /products/lookup?code=` | any | Exact barcode / SKU lookup (scanner) |
| `GET /products/:id` | any | Product detail |
| `POST /products` · `PUT /products/:id` · `DELETE /products/:id` (archive) | admin | Manage products |
| `GET /products/export` · `POST /products/import` | admin | CSV export / import |
| `GET /categories` | any | List categories |
| `POST /categories` · `PUT /categories/:id` · `DELETE /categories/:id` | admin | Manage categories |
| `GET /inventory` | admin | Stock levels |
| `POST /inventory/adjustments` | admin | Add / remove / set stock (`kind: ADD\|REMOVE\|SET`) |
| `POST /inventory/opname` | admin | Stock count for many products |
| `GET /inventory/movements` | admin | Movement history |
| `GET /transactions` · `GET /transactions/:id` | any (cashiers: own only) | History & detail |
| `POST /transactions` | any | Checkout |
| `POST /transactions/:id/void` | admin | Void sale and return stock |
| `GET /reports/dashboard` · `/sales` · `/profit` · `/products` | admin | Reports (`from`, `to`, `tz`) |
| `GET /reports/export?type=sales\|products\|transactions&format=csv\|xlsx` | admin | Report export |
| `GET /users` · `POST /users` · `PUT /users/:id` | admin | Manage users |
| `PATCH /users/:id/status` · `PATCH /users/:id/password` | admin | Activate/deactivate, reset password |
| `GET /settings` | any | Store settings (needed for receipts) |
| `PUT /settings` | admin | Update settings |
| `POST /uploads` | admin | Upload an image (multipart field `file`) |
| `GET /activity-logs` | admin | Audit log |

## 17. Troubleshooting

| Problem | Fix |
| --- | --- |
| `Invalid environment configuration` on start | Check `.env` — the message lists the missing/invalid variables. |
| `Failed to start server. Is PostgreSQL running…` | Start the database (`npm run db:up`) and check `DATABASE_URL`. |
| Port 5433 already in use | Change the host port in `docker-compose.yml` and in `.env`. |
| Login works but you are immediately signed out (production over HTTP) | Set `COOKIE_SECURE=false`, or serve over HTTPS. |
| Receipt has wide margins / prints on A4 | Set the thermal printer's paper size in its driver and choose **Margins: None** in the print dialog. |
| Scanner types the code but nothing is added | Configure the scanner to send an **Enter** suffix. |
| Camera button says camera is unavailable | Use `https://` (or `localhost`) and allow camera permission. |
