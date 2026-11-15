# BatchBite

Preorder and production platform for small food businesses (SWEN 360, Phase 2: Core Implementation).

Customers browse open production batches, order, and pick a pickup slot. Business owners manage products and batches. Kitchen staff follow the production list. Administrators manage accounts.

## Tech stack

| Part | Technology |
|---|---|
| Frontend | HTML, CSS and plain JavaScript (runs in the browser, served by the backend at http://localhost:3000) |
| Backend | Node.js with Express (`backend/server.js`, port 3000): serves the pages and the API (under `/api`) from one server |
| Database | JSON files in `backend/data/`, read and written through `backend/storage.js` |

## Run it on your computer

You need [Node.js](https://nodejs.org) (LTS version). Everything else is in this repository.

1. **Download** the repository (green **Code** button, then **Download ZIP**) and unzip it. You get a folder called `BatchBite-main`.
2. **Open a terminal in that folder:**
   - **Mac:** open Terminal and run `cd ~/Downloads/BatchBite-main`
   - **Windows:** open Command Prompt and run `cd %USERPROFILE%\Downloads\BatchBite-main`
3. **Install** (first time only):
   ```
   npm install
   ```
4. **Start BatchBite:**
   ```
   npm start
   ```
   Your browser opens BatchBite automatically. Leave this window open while you use the app.
5. **If the browser doesn't open by itself**, go to **http://localhost:3000**.
   - The **first time**, BatchBite asks you to create the **Administrator** account (name, email and password). After that it signs you in.
   - From then on, everything is done in the browser. You don't need the terminal again until you want to stop the app (press **Ctrl+C** in that window).

One server runs everything: it shows the pages and handles the data. The database folder `backend/data` is created automatically the first time.

**If something goes wrong**
- `no such file or directory` or `Could not read package.json`: the terminal is in the wrong folder. Go back to step 2.
- `npm` or `node` not found: install Node.js (LTS) and open a new terminal.
- `EADDRINUSE` (port already in use): BatchBite is already running in another window. Use that one, or close it and run `npm start` again.
- The page doesn't load: check that the `npm start` window is still open.

## Roles and accounts

BatchBite has four roles. On the login page, choose **Who are you?** and then log in.

| Role | How they get an account | What they can do |
|---|---|---|
| Administrator | Created on the first-run setup page the first time BatchBite opens | View all accounts, change roles, activate, deactivate or delete accounts |
| Business Owner | **Sign up** (choose Business Owner) | Products, recipes and batches, pickup slots, Owner Dashboard (all orders, pickup check), **Kitchen Staff** page to create logins for their team, ingredients, Kitchen Dashboard |
| Kitchen Staff | Created by their Business Owner on the **Kitchen Staff** page (no sign-up) | Kitchen Dashboard (order status, delay notices, preparation groups, production tasks, pickup verification), ingredients and recipe calculator |
| Customer | **Sign up** (choose Customer) | Browse open batches, cart, pickup slot, checkout, My Orders (track, change, cancel, QR pickup code) |

**Switching between roles:** click **Switch** in the top bar. It lists every account you have signed in to on this browser, so you can jump between the Administrator, Business Owner, Kitchen Staff and Customer views in one click, or choose **Log in to another account**.

## Try the full order journey (about 10 minutes)

After step 5 above:

1. **Business Owner:** click **Switch**, then **Log in to another account**. Choose **Business Owner**, click **Sign up**, create the account and log in. Open **Kitchen Staff** and create a login for a kitchen team member.
2. **Business Owner:** open **Products & Batches** and add a product with a variant. Click **Recipe** on the product to list its ingredients (optional: products without a recipe can still be ordered, they just don't reserve ingredient stock). Then create a batch with an order deadline and pickup date.
3. **Business Owner:** open **Pickup Slots** and add one or two pickup times for the batch.
4. **Business Owner (optional):** open **Ingredients** to see stock and use the recipe calculator.
5. **Customer:** click **Switch**, then **Log in to another account**. Choose **Customer**, click **Sign up**, create the account and log in. Open **Browse Batches**, add items to the cart, choose a pickup slot and check out.
6. **Customer:** open **My Orders**. Try **Change quantity**, **Cancel order** on a second order, and **Show pickup code**.
7. **Business Owner:** click **Switch** and pick the Business Owner. Open **Owner Dashboard**. Mark the order **Preparing**, then **Ready**, then click **Verify pickup** and paste the customer's code. The order becomes **Collected** on both screens.
8. **Kitchen Staff:** click **Switch**, then **Log in to another account**, choose **Kitchen Staff** and use the login the Business Owner created. Open **Kitchen Dashboard** to move orders through Preparing and Ready, add production tasks with Low, Medium or High priority and mark them complete, and send delay notices. **Notifications** shows each user their order updates.

## Features in this phase

- Register, log in, role-based access (Malaak). Login asks **Who are you?**; Customers and Business Owners can sign up, Kitchen Staff accounts are created by their Business Owner, and **Switch** moves between signed-in accounts in one click
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

**To look at the data:** open any file in a text editor, or open these links in your browser while BatchBite is running: `http://localhost:3000/api/products`, `/api/batches` and `/api/pickupSlots`.

**To start again from nothing:** stop the backend, delete `backend/data`, then run `npm start` again. BatchBite creates a fresh `data` folder and asks for a new Administrator.

`backend/data/` holds real accounts and sessions, so it should not be uploaded to GitHub. Add `backend/data/` to a `.gitignore` file.

## Known limitations

- Payment is simulated. No real card is charged, and the card number is not stored or sent.
- One order can contain items from one batch only.
- The pickup code can be scanned or pasted on the Owner Dashboard. There is no camera scanner, so staff paste the code shown under the QR.
- Pickup slots can't be edited or deleted after they are created (the backend has no route for it).

## Team

Products, batches and ordering: Shaikha Albuflasa. Authentication: Malaak. Backend and database: Nehad. Pickup slots and order status: Marwa. Kitchen and notifications: Aaya.
