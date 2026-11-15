# BatchBite Frontend – Pickup and Order Management Module (Marwa)

Covers **FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17, FR-21, FR-22 and FR-25**. Connected to `backend/server.js`; no backend changes were needed for these pages.

## Pages
| Page | Role | What it does |
|---|---|---|
| `pickup-slots.html` + `js/pages/pickup-slots.js` | Business Owner | Add pickup slots per batch (date taken from the batch), see booked / maximum per slot, filter by batch or availability, see which orders are in a slot |
| `my-orders.html` + `js/pages/my-orders.js` | Customer | Order history with a status tracker, change quantity before the deadline, cancel a Confirmed order, show the QR pickup code |
| `owner-dashboard.html` + `js/pages/owner-dashboard.js` | Business Owner | All orders for the owner's batches, counts by status, revenue and production summary, search and filters, move orders to Preparing and Ready, verify pickup codes |
| `css/orders.css` | – | Styles for the three pages, using the shared palette |
| `js/vendor/qrcode.js` | – | QR code generator (qrcode-generator by Kazuhiko Arase, MIT licence), runs in the browser with no internet needed |

`js/auth.js`: only the `MODULES` list changed (My Orders and Owner Dashboard set to `ready: true`).

## Backend routes used
| Route | Used for |
|---|---|
| `GET /batches`, `GET /pickupSlots` | Batch names, pickup dates and slot capacity |
| `POST /pickupSlots` | Create a slot `{ ownerId, batchId, date, startTime, endTime, maxOrders }` |
| `GET /customers/:id/orders` | The signed-in customer's orders |
| `PUT /orders/:id/cancel` | Cancel a Confirmed order; stock and slot place are released |
| `PUT /orders/:id/modify` | Change the quantity of a single-item Confirmed order before the deadline |
| `GET /owners/:id/orders` | Orders for the owner's batches with customer, batch and pickup time |
| `GET /reports/owner/:id` | Counts by status, revenue, items and production tasks |
| `PUT /orders/:id/status` | Confirmed → Preparing → Ready (the backend refuses skipped steps) |
| `POST /pickup/verify` | Check a pickup code; only a Ready order becomes Collected, and each code works once |

## Rules kept
- The pickup date always comes from the batch, so a slot can't be put on the wrong day. Start must be before end, and overlapping or duplicate times in the same batch are refused before the request is sent.
- Customers only see the buttons the backend allows: change and cancel only while the order is Confirmed (change also needs the batch deadline not to have passed and a single item).
- Every button is disabled while its request runs, so a double click sends one request (FR-21).
- Every page uses `Auth.requireRole`, so the wrong role sees Access Denied; the backend also checks the role and that the data belongs to the signed-in user.
