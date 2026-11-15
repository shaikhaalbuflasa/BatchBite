# BatchBite Frontend – Kitchen Dashboard, Ingredients and Notifications

Covers **FR-14, FR-15, FR-18, FR-20, FR-21, FR-24, FR-25 and FR-26**. Connected to the backend in `backend/server.js`. No backend changes were needed.

## Files in this module
| File | Purpose |
|---|---|
| `kitchen.html`, `js/pages/kitchen.js` | Kitchen Dashboard: overview, order board, status updates, delay notices, preparation groups, production tasks, pickup verification |
| `ingredients.html`, `js/pages/ingredients.js` | Inventory, recipe calculator, purchasing list, owner-only stock tools |
| `notifications.html`, `js/pages/notifications.js` | Notifications for every role: list, unread highlight, mark as read |
| `css/kitchen.css` | Styles for the three pages (uses the shared palette from `css/style.css`) |
| `js/auth.js` | Only the `MODULES` list changed: Kitchen Dashboard and Ingredients set to ready, Notifications card added |

## Run it
Same as the main README: start `backend/server.js` (port 3000), then `frontend/dev-server.js` (port 5173), and open http://localhost:5173.

## Try it
1. Log in as the Administrator and, in **Manage users**, give one account the **Business Owner** role and one the **Kitchen Staff** role.
2. As the Business Owner: create a product, a batch and a pickup slot.
3. Optional: on **Products & Batches**, click **Recipe** on a product to list its ingredients, so stock is reserved and the recipe calculator has data.
4. As a Customer: place an order from **Browse Batches**.
5. As Kitchen Staff: open **Kitchen Dashboard** from the home page.

## Backend routes used
| Route | Used for |
|---|---|
| `GET /kitchen/orders` | Confirmed, Preparing and Ready orders with items, notes and pickup slot |
| `PUT /orders/:id/status` | Confirmed → Preparing → Ready (backend rejects skipped steps and Collected) |
| `POST /orders/:id/delay` | Delay notice with a reason, sent to the customer |
| `GET /production/preparation-groups` | Same product and variant grouped across orders |
| `GET/POST /productionTasks`, `PUT /productionTasks/:id/complete`, `PUT /productionTasks/:id/priority`, `DELETE /productionTasks/:id` | Production tasks |
| `POST /pickup/verify` | Pickup code check; marks the order Collected |
| `GET /ingredients`, `GET /recipes`, `GET /recipes/:id/calculate?quantity=N` | Inventory, recipes, requirement and purchasing list calculation |
| `POST /ingredients`, `PUT /ingredients/:id/stock` | Business Owner only: add ingredient, set stock |
| `GET /notifications`, `PUT /notifications/:id/read` | Notifications |

## Rules kept
- Kitchen Staff only see the next valid status step; the backend decides. Stock is never reduced by hand: the backend reserves ingredients when an order is placed and consumes them when the order moves to Preparing.
- Business Owner stock tools are hidden from Kitchen Staff, and the backend also refuses them (HTTP 403).
- Every button is disabled while its request runs, so a double click sends one request. After each change the page reloads the data from the backend.
- Pickup codes are never shown, logged or stored by these pages; the field is cleared after a successful check.

## Limitations
- The backend does not return customer names to the kitchen, so cards show the customer ID.
- Only an Administrator can list users, so tasks are assigned by Kitchen Staff user ID. Kitchen Staff default to their own ID.
- Recipes are created from the **Recipe** button on the Products page (`POST /recipes`). `tools/add-test-recipe.js` is still there for quick test data but is no longer needed.
