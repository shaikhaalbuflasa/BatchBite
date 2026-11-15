# BatchBite Frontend – Authentication & Accounts Module

Covers **FR-1, FR-2, FR-3, FR-21** and **NFR-3 (Security)**. Connected to the backend in `backend/server.js`.

## Run it (two terminals)
1. **Backend** (first time only: `npm install` and `cp -R data-template data`):
   ```
   cd backend
   node server.js            # http://localhost:3000
   ```
2. **First Administrator** (only once, on a new `data` folder, with the backend stopped):
   ```
   cd frontend
   node tools/create-admin.js ../backend/data
   ```
   The backend only lets people register as Customers and only an Administrator can change roles, so the first Administrator is created with this script. The password is hashed exactly like `server.js` and is never printed or saved in plain text.
3. **Frontend**:
   ```
   cd frontend
   node dev-server.js        # http://localhost:5173
   ```
   `dev-server.js` serves the pages and forwards every `/api/...` request to the backend, so the browser never hits a CORS error and `server.js` does not need to change. No npm packages are needed.

Open http://localhost:5173, log in as the Administrator, then give other registered users the Business Owner or Kitchen Staff role from **Manage users**.

## Backend routes used
| Route | Used for |
|---|---|
| `POST /register` | Sign-up (always creates a Customer) |
| `POST /login` | Log in, returns token + user |
| `POST /logout` | Ends the session on the server |
| `GET /notifications` | Confirms the saved session is still valid when a protected page opens |
| `GET /users` | Manage users list (Administrator) |
| `PUT /admin/users/:id` | Change `role` or `isActive` (Administrator) |
| `DELETE /admin/users/:id` | Delete an account with no orders or business records (Administrator) – **new, see BACKEND-CHANGE-delete-user.md** |

Roles are case-sensitive: `Customer`, `BusinessOwner`, `KitchenStaff`, `Administrator`.

## Files
| File | Purpose |
|---|---|
| `js/config.js` | `API_BASE` (default `/api`, through dev-server.js) |
| `js/api.js` | One request helper for all modules: JSON, Bearer token, error messages |
| `js/storage.js` | Browser storage: session, last email, admin filters |
| `js/auth.js` | Register, login/logout, session check, page guard, roles, admin functions |
| `js/ui.js` | Top bar with role-based menu, messages, confirmation windows, form helpers |
| `login.html`, `register.html`, `home.html`, `admin-users.html`, `profile.html`, `access-denied.html`, `index.html` | Pages |
| `css/style.css`, `fonts/` | Strawberry Lemonade palette, Playfair Display + Poppins |
| `dev-server.js` | Serves the frontend and forwards `/api` to the backend |
| `tools/create-admin.js` | Creates the first Administrator |

## Browser storage
| Key | Contents |
|---|---|
| `batchbite.session` | `token`, `user {id, name, email, role, isActive}`, `signedInAt`, `expiresAt` (24 h, same as the backend). Saved in localStorage when *Keep me signed in* is ticked, otherwise in sessionStorage (cleared when the browser closes). |
| `batchbite.lastEmail` | Pre-fills the login email |
| `batchbite.adminUserView` | Manage users filter and sort choices |

## How teammates connect their pages
```html
<header id="app-header"></header>
...
<script src="js/config.js"></script>
<script src="js/api.js"></script>
<script src="js/storage.js"></script>
<script src="js/auth.js"></script>
<script src="js/ui.js"></script>
<script>
  (async () => {
    const me = await Auth.requireRole(['BusinessOwner']);   // roles allowed on this page
    if (!me) return;
    UI.renderHeader(me, '');
    const orders = await Api.request('/owners/' + me.id + '/orders', { token: Auth.token() });
    // ...
  })();
</script>
```
- Use `me.id` for `customerId` / `ownerId`, never a typed-in ID.
- Show `err.message` from a failed `Api.request` to the user; `err.status` is the HTTP code.
- When your page is ready, find its card in `Auth.MODULES` (js/auth.js), check the `href` and set `ready: true`.
- Reuse `btn-primary` (Strawberry), `btn-secondary` (Butter Yellow), `card` and the CSS colour variables so every page matches.

## Not available in the backend (not built in the frontend)
Creating accounts with other roles directly, password reset, and editing name/email. Accounts that already have orders or business records are deactivated instead of deleted, so their history is kept.
