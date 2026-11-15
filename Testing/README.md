# BatchBite – Testing

Each module was tested in Google Chrome with the frontend connected to the team backend, using scripts that click through the real pages the way a user would, plus direct API checks for the backend rules. The test registers for each module are below. To repeat any test by hand, follow **Try the full order journey** in the main README.

| Module | Owner | Test cases | Result |
|---|---|---|---|
| Accounts and authentication | Malaak | 29 (TC-01 to TC-29), see `frontend/AUTH-MODULE.md` and the Phase 2 report | All pass |
| Products, batches and ordering | Shaikha | 13, see the Phase 2 report | All pass |
| Pickup and order management | Marwa | 24 (PO-01 to PO-24), below | All pass |
| Kitchen dashboard and notifications | Aaya | see `frontend/KITCHEN-MODULE.md` | |
| Full journey and setup (integration) | Team | 12 (IT-01 to IT-12), below | All pass |

## Pickup and Order Management (Marwa)

Tested on 15 November 2026 on a fresh database set up exactly as in the README.

| ID | Test case | Input / steps | Expected result | Result |
|---|---|---|---|---|
| PO-01 | Slot date from batch | Owner opens Pickup Slots and picks a batch | Pickup date filled in from the batch and can't be changed | Pass |
| PO-02 | End before start | Start 12:00, end 11:00 | "The end time must be after the start time" under End time; nothing saved | Pass |
| PO-03 | Add slot | Start 12:00, end 12:30, maximum 1 | Slot saved and shown as 0 / 1 booked; next time (12:30 to 13:00) suggested | Pass |
| PO-04 | Double submission | Double-click Add slot | Exactly one slot saved (FR-21) | Pass |
| PO-05 | Overlapping slot | Add 12:15 to 12:45 in the same batch | "This overlaps the 12:00 PM to 12:30 PM slot"; nothing saved | Pass |
| PO-06 | Full slot (FR-13) | Second customer orders into the 1-order slot | Backend refuses: "Pickup slot is unavailable"; slot shown as Full | Pass |
| PO-07 | Order history (FR-16) | Customer with 3 orders opens My Orders | All 3 orders with items, notes, total, pickup time and payment status | Pass |
| PO-08 | Status tracker (FR-14) | Open My Orders after each status change | Tracker shows the current step and the time of each completed step | Pass |
| PO-09 | Change quantity (FR-22) | Change order from 1 to 4 | New total shown while typing (BD 18.00); saved; extra charge shown (simulated) | Pass |
| PO-10 | Cancel order (FR-11) | Cancel a Confirmed order and confirm | Status Cancelled; slot place released (2 → 1 booked); refund shown (simulated) | Pass |
| PO-11 | Filters | Choose "Collected and cancelled" | Only finished orders shown | Pass |
| PO-12 | Pickup QR code (FR-25) | Click Show pickup code | QR code and the order's unique code shown | Pass |
| PO-13 | Owner dashboard (FR-17) | Owner opens Owner Dashboard | All orders, including cancelled, with customer, items, pickup and total | Pass |
| PO-14 | Counts by status | Same as above | Confirmed, Preparing, Ready, Collected and Cancelled counts match the orders | Pass |
| PO-15 | Valid status steps (FR-15) | Mark Preparing, then Mark Ready | Each click moves one step only; the customer is notified when Ready | Pass |
| PO-16 | Late cancellation | Customer tries to cancel a Ready order | Backend refuses; Cancel button not shown | Pass |
| PO-17 | Wrong pickup code | Verify pickup with "wrongcode" | "Invalid pickup code"; order stays Ready | Pass |
| PO-18 | Correct pickup code | Paste the customer's code | Order becomes Collected on both pages | Pass |
| PO-19 | Code used twice | Verify the same code again | "Pickup code has already been used" | Pass |
| PO-20 | Status filter | Filter the dashboard by Cancelled | Only the cancelled order shown | Pass |
| PO-21 | Role restriction (pages) | Customer opens Owner Dashboard; Owner opens My Orders | Access Denied page for both | Pass |
| PO-22 | Another customer's orders | Customer B's token calls GET /customers/A/orders | Backend refuses (403) | Pass |
| PO-23 | Protect order history | Administrator deletes a customer who has orders | Refused (409); told to deactivate instead | Pass |
| PO-24 | Mobile layout | My Orders at 390 px width | No horizontal scrolling; no browser console errors on any page | Pass |

## Full journey and setup (integration)

Tested on 15 November 2026 by downloading the repository, following the README exactly, and then using only the app in the browser (no other commands).

| ID | Test case | Input / steps | Expected result | Result |
|---|---|---|---|---|
| IT-01 | Setup without copy step | `npm install`, `create-admin.js`, start backend and frontend | `backend/data` created automatically from `data-template`; app opens at http://localhost:5173 | Pass |
| IT-02 | Backend started first | Start `server.js` with no `data` folder | Data folder created on start; no crash | Pass |
| IT-03 | Roles from the app | Register 3 users; Administrator sets Business Owner and Kitchen Staff in Users | Roles saved; each role sees only its tools; no "Being integrated" cards | Pass |
| IT-04 | Recipe in the app | Owner clicks Recipe, adds Flour 300 g and Chocolate 200 g, makes 6 | Recipe saved; new ingredients added with their stock; card shows "Recipe added" | Pass |
| IT-05 | Recipe validation | New ingredient with no stock entered | "Enter how much Chocolate you have in stock"; nothing saved | Pass |
| IT-06 | Recipe versions (FR-23) | Save a new recipe for the same variant | Old version kept but inactive; new version active | Pass |
| IT-07 | Order with recipe (FR-10) | Customer orders 2 of a product whose recipe makes 6 | Order placed; 100 g Flour reserved | Pass |
| IT-08 | Order without recipe | Customer orders a variant with no recipe | Order placed with no ingredient reservation (no "Active recipe not found") | Pass |
| IT-09 | Stock used when preparing | Kitchen moves the order to Preparing | Reserved Flour taken from stock (5000 → 4900 g) | Pass |
| IT-10 | Stock released on cancel (FR-11) | Customer cancels an order with a recipe | Reserved ingredients released | Pass |
| IT-11 | Production task priority | Kitchen adds a High task, changes it to Low, completes it | Saved with each change; status Completed | Pass |
| IT-12 | Data kept between sessions | Restart the backend | Users, products, orders and tasks still there (`backend/data`) | Pass |
