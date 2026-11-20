# Gas Inventory

A role-aware gas inventory dashboard built with React, Vite, Tailwind CSS, Django REST Framework, JWT authentication, and PostgreSQL.

## Roles

- **Superadmin:** full access, including user management and creating Superadmin accounts.
- **Head:** dashboard access and user management for non-Superadmin accounts; can create Staff and Head accounts.
- **Staff:** dashboard access and business operations; cannot access user management.

The API enforces the user-management restriction. Dashboard metrics are read from the database and initially show zero until operational records are added.

Newly created accounts are marked to change their temporary password at first sign-in. The frontend blocks workspace access with a password-change prompt until the user sets a valid replacement. The authenticated endpoint is `POST /api/auth/change-password/` with `current_password` and `new_password`.

Accounts created or reset from the Team page receive a unique randomly generated temporary password. It is shown to the administrator once and must be changed at first sign-in.

On the Team page, Superadmin and Head users can view member details, edit names and roles, enable or disable accounts, and reset passwords. Head users cannot modify Superadmin accounts; only Superadmins can assign the Superadmin role. The last active Superadmin cannot be disabled or demoted.

## Backend setup

Requirements: Python 3.11+ and PostgreSQL.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create a PostgreSQL database and set the connection variables before starting Django:

```powershell
$env:POSTGRES_DB = "gas_inventory"
$env:POSTGRES_USER = "postgres"
$env:POSTGRES_PASSWORD = "your-local-password"
$env:POSTGRES_HOST = "localhost"
$env:POSTGRES_PORT = "5432"
$env:DJANGO_SECRET_KEY = "replace-with-a-long-random-secret"
```

Apply migrations, create the initial Superadmin interactively, then start the API:

```powershell
python manage.py migrate
python manage.py create_superadmin
python manage.py runserver
```

The API runs at `http://localhost:8000`. JWT login is at `POST /api/auth/token/`; the authenticated profile is at `GET /api/auth/me/`. The dashboard is at `GET /api/dashboard/`, and user listing/creation is at `/api/users/` for Superadmin and Head roles. Authenticated users can manage customers, products, inventory movements, sales, purchases, and expenses through `/api/customers/`, `/api/products/`, `/api/inventory-movements/`, `/api/sales/`, `/api/purchases/`, and `/api/expenses/`. `POST /api/checkout/` creates a sale with product lines and deducts filled stock atomically. Checkout lines may include `empty_returned` to record returned cylinders; those are added to the product's separate empty-cylinder count without changing the sale price. Inventory movements can adjust filled or empty stock and reject removals beyond the available count.

## Frontend setup

Requirements: Node.js 20+.

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

The Vite app runs at `http://localhost:5173`. Set `VITE_API_URL` in `frontend/.env` if the API is hosted elsewhere.

## Quick local demo without PostgreSQL

For a local demo only, Django can use SQLite instead of PostgreSQL:

```powershell
cd backend
$env:DJANGO_DB_ENGINE = "sqlite"
python manage.py migrate
python manage.py create_superadmin
python manage.py runserver
```

In another terminal:

```powershell
cd frontend
npm run dev
```

SQLite is intended for local evaluation; use PostgreSQL for normal deployment.

## One-click Windows start

Double-click `Start-Gas-Inventory.bat` in the project root. The launcher creates a Python virtual environment when needed, installs dependencies, applies SQLite migrations, starts Django and Vite, and opens the app at `http://127.0.0.1:5173`.

## Current scope

The frontend includes login, dashboard shortcuts, point of sale, inventory, purchases, customers, reports, and team management. POS checkout asks for the customer name and amount paid, creates or reuses a matching customer profile, calculates change, and saves payment details with the sale. The Customers list shows each customer's sale count and total paid. Product SKUs are generated from the normalized product name and the date the product is added (`NAME-YYYYMMDD`); a numeric suffix keeps same-day duplicates unique. Reports summarize daily sales, recorded purchases, and expenses; profit reporting is not included because sale cost data is not yet modeled.
