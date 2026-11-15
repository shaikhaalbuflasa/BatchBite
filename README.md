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

1. **Download** the repository (green **Code** button, then **Download ZIP**) and unzip it. You get a folder called `BatchBite-main`.
2. **Open a terminal in your Downloads folder** (or wherever you unzipped it):
   - **Mac:** open Terminal and run `cd ~/Downloads`
   - **Windows:** open Command Prompt and run `cd %USERPROFILE%\Downloads`
3. **Install the backend packages:**
   ```
   cd BatchBite-main/backend
   npm install
   ```
4. **Create the first Administrator account** (you choose the name, email and password):
   ```
   cd ../frontend
   node tools/create-admin.js ../backend/data
   ```
   This also creates the database folder `backend/data` from `backend/data-template` the first time.
5. **Start the backend** (leave this window open):
   ```
   cd ../backend
   node server.js
   ```
   You should see `BatchBite server running at http://localhost:3000`.
6. **Start the frontend** in a second terminal window. Go to the Downloads folder again as in step 2, then:
   ```
   cd BatchBite-main/frontend
   node dev-server.js
   ```
7. **Open http://localhost:5173** in your browser and log in with the Administrator account from step 4. The application is ready to use; nothing else needs to be run.

**If something goes wrong**
- `no such file or directory` or `Could not read package.json`: the terminal is in the wrong folder. Go back to step 2.
- `npm` or `node` not found: install Node.js (LTS) and open a new terminal.
- `EADDRINUSE` (port already in use): BatchBite is already running in another window. Close that window or use it.
- The page shows "backend is not running": start the backend (step 5) and keep its window open.

## Roles and test accounts

New accounts are created as **Customer**. Only an Administrator can change a role.

1. Log in as the Administrator, open **Users**, and change a user's role to **Business Owner** or **Kitchen Staff**.
2. Log in as that user. Each role sees only its own tools on the home page.

| Role | What they can do |
|---|---|
| Administrator | View users, change roles, activate or deactivate and delete accounts |
| Business Owner | Create products and batches, create pickup slots, see all orders and verify pickups on the Owner Dashboard, manage ingredient stock, use the Kitchen Dashboard for their own orders |
| Customer | Browse open batches, use the cart, choose a pickup slot, place an order, track, change or cancel orders and show the pickup QR code |
| Kitchen Staff | Kitchen Dashboard (order status, delay notices, preparation groups, production tasks, pickup verification), ingredient and recipe calculator |

## Try the full order journey (about 10 minutes)

After step 7 above:

1. **Register three accounts** on the sign-up page (for example an owner, a kitchen user and a customer). As the **Administrator**, open **Users** and make one a **Business Owner** and one **Kitchen Staff**.
2. **Business Owner:** open **Products & Batches** and add a product with a variant. Click **Recipe** on the product to list its ingredients (optional: products without a recipe can still be ordered, they just don't reserve ingredient stock). Then create a batch with an order deadline and pickup date.
3. **Business Owner:** open **Pickup Slots** and add one or two pickup times for the batch.
4. **Business Owner (optional):** open **Ingredients** to see stock and use the recipe calculator.
5. **Customer:** open **Browse Batches**, add items to the cart, choose a pickup slot and check out.
6. **Customer:** open **My Orders**. Try **Change quantity**, **Cancel order** on a second order, and **Show pickup code**.
7. **Business Owner:** open **Owner Dashboard**. Mark the order **Preparing**, then **Ready**, then click **Verify pickup** and paste the customer's code. The order becomes **Collected** on both screens.
8. **Kitchen Staff:** open **Kitchen Dashboard** to move orders through Preparing and Ready, add production tasks with Low, Medium or High priority and mark them complete, and send delay notices. **Notifications** shows each user their order updates.

## Features in this phase

- Register, log in, role-based access (Malaak)
- Backend API with JSON persistence, orders, stock and ingredient checks (Nehad)
- **Products:** add, edit, hide and delete products with variants, prices, stock, description and ingredients (Shaikha). Each variant can have a **recipe** (ingredients and amounts) entered from the product card; saving a new recipe keeps the old version for orders already placed
- **Batches:** create batches with an order deadline, pickup date and maximum quantity per product. A batch closes automatically at its deadline or when full (Shaikha)
- **Catalogue and ordering:** browse open batches, cart, pickup slot choice, simulated card payment, order confirmation, no overselling (Shaikha)
- **Pickup slots:** Business Owners add pickup times for each batch with a maximum number of orders. Overlapping or duplicate times are refused, and a slot can't be chosen once it is full (Marwa)
- **My Orders:** Customers see every order with a progress tracker (Confirmed, Preparing, Ready, Collected), change the quantity before the order deadline, cancel a Confirmed order (with a simulated refund) and show a QR pickup code (Marwa)
- **Owner Dashboard:** Business Owners see all orders for their batches with search and filters, counts by status, revenue and production progress, move orders to Preparing and Ready, and verify a customer's pickup code to mark the order Collected (Marwa)

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

**To start again from nothing:** stop the backend, delete `backend/data`, then repeat step 4 above (the backend creates a fresh `data` folder by itself).

`backend/data/` holds real accounts and sessions, so it should not be uploaded to GitHub. Add `backend/data/` to a `.gitignore` file.

## Known limitations

- Payment is simulated. No real card is charged, and the card number is not stored or sent.
- One order can contain items from one batch only.
- The pickup code can be scanned or pasted on the Owner Dashboard. There is no camera scanner, so staff paste the code shown under the QR.
- Pickup slots can't be edited or deleted after they are created (the backend has no route for it).

## Team

Products, batches and ordering: Shaikha Albuflasa. Authentication: Malaak. Backend and database: Nehad. Pickup slots and order status: Marwa. Kitchen and notifications: Aaya.
