# BatchBite

Preorder and production platform for small food businesses (SWEN 360, Phase 2: Core Implementation).

Customers browse open production batches, order, and pick a pickup slot. Business owners manage products and batches. Kitchen staff follow the production list. Administrators manage accounts.

## Tech stack

| Part | Technology |
|---|---|
| Frontend | HTML, CSS and plain JavaScript (runs in the browser, served by `frontend/dev-server.js` on port 5173) |
| Backend | Node.js with Express (`backend/server.js`, port 3000) |
| Database | JSON files in `backend/data/`, read and written through `backend/storage.js` |

## Run it on your computer

You need [Node.js](https://nodejs.org) (LTS version). Everything else is in this repository.

1. **Download** the repository (Code, then Download ZIP) and unzip it.
2. **Install the backend packages.** In a terminal:
   ```
   cd BatchBite-main/backend
   npm install
   ```
3. **Create your database folder** (a copy of the empty template):
   ```
   cp -R data-template data
   ```
4. **Create the first Administrator account** (you choose the name, email and password):
   ```
   cd ../frontend
   node tools/create-admin.js ../backend/data
   ```
5. **Start the backend** (leave this terminal open):
   ```
   cd ../backend
   node server.js
   ```
   You should see `BatchBite server running at http://localhost:3000`.
6. **Start the frontend** in a second terminal:
   ```
   cd BatchBite-main/frontend
   node dev-server.js
   ```
7. **Open http://localhost:5173** in your browser.

## Roles and test accounts

New accounts are created as **Customer**. Only an Administrator can change a role.

1. Log in as the Administrator, open **Users**, and change a user's role to **Business Owner** or **Kitchen Staff**.
2. Log in as that user. Each role sees only its own tools on the home page.

| Role | What they can do |
|---|---|
| Administrator | View users, change roles, activate or deactivate and delete accounts |
| Business Owner | Create products and batches, create pickup slots |
| Customer | Browse open batches, use the cart, choose a pickup slot, place an order |
| Kitchen Staff | Kitchen and production tools (backend ready, screens being integrated) |

## Features in this phase

- Register, log in, role-based access (Malaak)
- Backend API with JSON persistence, orders, stock and ingredient checks (Nehad)
- **Products:** add, edit, hide and delete products with variants, prices, stock, description and ingredients (Shaikha)
- **Batches:** create batches with an order deadline, pickup date and maximum quantity per product. A batch closes automatically at its deadline or when full (Shaikha)
- **Catalogue and ordering:** browse open batches, cart, pickup slot choice, simulated card payment, order confirmation, no overselling (Shaikha)
- **Pickup slots:** the page in `pickup-slots.html` is a temporary version used for testing until the final version is merged (Marwa)

## Database guide

All saved data lives in **`backend/data/`** as one JSON file per collection:

| File | Contents |
|---|---|
| `users.json` | Accounts and roles (contains login details, keep private) |
| `products.json` | Products and their variants |
| `batches.json` | Batches, deadlines, pickup dates, ordered quantities |
| `pickupSlots.json` | Pickup slots and how many orders each holds |
| `orders.json` | Orders, items, totals, status history |
| `recipes.json`, `ingredients.json` | Recipes and ingredient stock |
| `notifications.json`, `stockHolds.json`, `productionTasks.json` | Notifications, temporary stock holds, kitchen tasks |
| `sessions.json` | Login sessions. **Never share or commit this file.** |

**To look at the data:** open any file in a text editor, or open these links in your browser while the backend is running: `http://localhost:3000/products`, `/batches` and `/pickupSlots`.

**To start again from nothing:** stop the backend, delete `backend/data`, then repeat steps 3 and 4 above.

`backend/data/` holds real accounts and sessions, so it should not be uploaded to GitHub. Add `backend/data/` to a `.gitignore` file.

## Known limitations

- There is no screen for creating **recipes** yet. The backend refuses an order when the product has no active recipe ("Active recipe not found"). For testing, run `node tools/add-test-recipe.js ../backend/data` from the `frontend` folder, which adds a sample recipe and ingredients for every product.
- Payment is simulated. No real card is charged, and the card number is not stored or sent.
- One order can contain items from one batch only.
- Order tracking, the kitchen board and notification screens are still being integrated.

## Team

Products, batches and ordering: Shaikha Albuflasa. Authentication: Malaak. Backend and database: Nehad. Pickup slots and order status: Marwa. Kitchen and notifications: Aaya.
