/*
 * BatchBite - Authentication and Accounts module (frontend)
 * ---------------------------------------------------------
 * FR-1  Role-based accounts: Customer, BusinessOwner, KitchenStaff, Administrator
 * FR-2  Registration, login/logout and access limited by role
 * FR-3  Administrators manage accounts: change roles, activate / deactivate
 * FR-21 Repeated submissions do not create duplicate records
 *
 * Backend routes used (server.js):
 *   POST /register             { name, email, password }  -> creates a Customer
 *   POST /login                { email, password }        -> { token, user }
 *   POST /logout               Bearer token               -> ends the session
 *   GET  /notifications        Bearer token               -> used to confirm the session is still valid
 *   GET  /users                Administrator              -> list of accounts
 *   PUT  /admin/users/:id      Administrator { role?, isActive? }
 *   DELETE /admin/users/:id    Administrator: deletes an account with no orders or business records
 *
 * Client-side role checks only control what is shown. The backend is the
 * authority and rejects requests from the wrong role with 403.
 */
const Auth = (() => {
  const SESSION_KEY = 'session';
  const SESSION_HOURS = 24; // matches the backend session lifetime

  /* Role names are case-sensitive and must match the backend exactly */
  const ROLES = {
    Administrator: { label: 'Administrator',  level: 4, css: 'admin',    description: 'Manages user accounts, roles and access.' },
    BusinessOwner: { label: 'Business Owner', level: 3, css: 'owner',    description: 'Manages products, production batches, pickup slots and orders.' },
    KitchenStaff:  { label: 'Kitchen Staff',  level: 2, css: 'kitchen',  description: 'Prepares orders and updates their status.' },
    Customer:      { label: 'Customer',       level: 1, css: 'customer', description: 'Browses batches, places orders and tracks them.' }
  };

  /*
   * Screens of the app and the roles allowed to open them.
   * Teammates: when your page is ready, check the href and set ready: true.
   */
  const MODULES = [
    { id: 'browse',    title: 'Browse Batches',     href: 'catalogue.html',       roles: ['Customer'],                      ready: true, text: 'See open production batches and add products to your order.' },
    { id: 'myorders',  title: 'My Orders',          href: 'my-orders.html',       roles: ['Customer'],                      ready: true, text: 'Track your orders, modify or cancel them, and show your pickup QR code.' },
    { id: 'products',  title: 'Products & Batches', href: 'products.html',        roles: ['BusinessOwner'],                 ready: true, text: 'Create and edit products and production batches.' },
    { id: 'slots',     title: 'Pickup Slots',       href: 'pickup-slots.html',    roles: ['BusinessOwner'],                 ready: true, text: 'Create pickup time slots and set their limits.' },
    { id: 'dashboard', title: 'Owner Dashboard',    href: 'owner-dashboard.html', roles: ['BusinessOwner'],                 ready: true, text: 'See your orders, reports and production progress.' },
    { id: 'inventory', title: 'Ingredients',        href: 'ingredients.html',     roles: ['BusinessOwner', 'KitchenStaff'], ready: true,  text: 'Check stock levels and recipe requirements.' },
    { id: 'kitchen',   title: 'Kitchen Dashboard',  href: 'kitchen.html',         roles: ['KitchenStaff', 'BusinessOwner'], ready: true,  text: 'Update order status, manage tasks and verify pickup codes.' },
    { id: 'notifications', title: 'Notifications', href: 'notifications.html', roles: ['Customer', 'BusinessOwner', 'KitchenStaff', 'Administrator'], ready: true, text: 'See order updates such as confirmations, delays and pickups.' },
    { id: 'users',     title: 'Manage Users',       href: 'admin-users.html',     roles: ['Administrator'],                 ready: true,  text: 'View all accounts, change roles, activate or deactivate users and delete accounts.' },
    { id: 'account',   title: 'My Account',         href: 'profile.html',         roles: ['Customer', 'BusinessOwner', 'KitchenStaff', 'Administrator'], ready: true, text: 'See your account details and sign out.' }
  ];

  /* ---------------- client-side validation (mirrors the backend rules) ---------------- */

  function validateName(name) {
    const value = String(name || '').trim();
    if (!value) return 'Full name is required.';
    if (value.length < 2 || value.length > 60) return 'Full name must be 2 to 60 characters.';
    return null;
  }

  function validateEmail(email) {
    const value = String(email || '').trim();
    if (!value) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return 'Enter a valid email address, e.g. name@example.com.';
    return null;
  }

  function validatePassword(password) {
    const value = String(password || '');
    if (!value) return 'Password is required.';
    if (value.length < 8) return 'Password must be at least 8 characters.';
    return null;
  }

  function fail(error, field) {
    return { ok: false, error, field: field || null };
  }

  /* ---------------- session (stored in the browser) ---------------- */

  function getSession() {
    const session = Store.get(SESSION_KEY, null);
    if (!session || !session.token || !session.user) return null;
    if (new Date(session.expiresAt) <= new Date()) {
      Store.remove(SESSION_KEY);
      return null;
    }
    return session;
  }

  function currentUser() {
    const session = getSession();
    return session ? session.user : null;
  }

  function token() {
    const session = getSession();
    return session ? session.token : null;
  }

  function clearSession() {
    Store.remove(SESSION_KEY);
  }

  /* ---------------- registration ---------------- */

  async function register(data) {
    const nameError = validateName(data.name);
    if (nameError) return fail(nameError, 'name');
    const emailError = validateEmail(data.email);
    if (emailError) return fail(emailError, 'email');
    const passwordError = validatePassword(data.password);
    if (passwordError) return fail(passwordError, 'password');
    if (data.password !== data.confirmPassword) return fail('Passwords do not match.', 'confirmPassword');

    try {
      const user = await Api.request('/register', {
        method: 'POST',
        body: { name: data.name.trim(), email: data.email.trim(), password: data.password }
      });
      return { ok: true, user };
    } catch (err) {
      if (/already registered/i.test(err.message)) return fail('An account with this email already exists.', 'email');
      return fail(err.message);
    }
  }

  /* ---------------- login / logout ---------------- */

  async function login(email, password, remember) {
    if (!String(email || '').trim()) return fail('Email is required.', 'email');
    if (!password) return fail('Password is required.', 'password');

    try {
      const result = await Api.request('/login', {
        method: 'POST',
        body: { email: email.trim(), password }
      });
      Store.set(SESSION_KEY, {
        token: result.token,
        user: result.user,
        signedInAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + SESSION_HOURS * 3600000).toISOString()
      }, !!remember);
      Store.set('lastEmail', result.user.email, true);
      return { ok: true, user: result.user };
    } catch (err) {
      if (err.status === 401) {
        return fail('Incorrect email or password, or the account has been deactivated.', 'password');
      }
      return fail(err.message);
    }
  }

  async function logout() {
    const session = getSession();
    clearSession();
    if (!session) return;
    try {
      await Api.request('/logout', { method: 'POST', token: session.token });
    } catch (err) {
      /* the browser session is already cleared; nothing else to do */
    }
  }

  /*
   * Asks the backend whether the stored token is still valid.
   * Returns 'valid', 'expired' (token rejected: expired, logged out or account
   * deactivated) or 'offline' (server could not be reached).
   */
  async function checkSession() {
    const session = getSession();
    if (!session) return 'expired';
    try {
      await Api.request('/notifications', { token: session.token });
      return 'valid';
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        clearSession();
        return 'expired';
      }
      return 'offline';
    }
  }

  function hasRole(user, roles) {
    return !!user && (!roles || roles.length === 0 || roles.includes(user.role));
  }

  function loginRedirect(reason) {
    const back = encodeURIComponent(location.pathname.split('/').pop() + location.search + location.hash);
    location.replace('login.html?next=' + back + (reason ? '&' + reason + '=1' : ''));
  }

  /*
   * Page guard. Call at the top of every protected page:
   *   const me = await Auth.requireRole(['BusinessOwner']);
   *   if (!me) return;
   * Not signed in or session rejected -> login page. Wrong role -> access denied page.
   */
  async function requireRole(roles) {
    const user = currentUser();
    if (!user) { loginRedirect(); return null; }
    if (!hasRole(user, roles)) { location.replace('access-denied.html'); return null; }

    const state = await checkSession();
    if (state === 'expired') { loginRedirect('expired'); return null; }
    if (state === 'offline') UI.serverWarning();
    return user;
  }

  function modulesFor(user) {
    return user ? MODULES.filter(m => m.roles.includes(user.role)) : [];
  }

  /* ---------------- administrator functions (FR-3) ---------------- */

  function adminError(err) {
    if (err.status === 401 || err.status === 403) {
      if (/cannot deactivate|cannot delete|own administrator role/i.test(err.message)) return fail(err.message);
      clearSession();
      loginRedirect('expired');
      return fail('Your session has expired. Please log in again.');
    }
    return fail(err.message);
  }

  async function listUsers() {
    try {
      const users = await Api.request('/users', { token: token() });
      return { ok: true, users };
    } catch (err) {
      return adminError(err);
    }
  }

  async function updateUser(id, changes) {
    try {
      const result = await Api.request('/admin/users/' + encodeURIComponent(id), {
        method: 'PUT',
        token: token(),
        body: changes
      });
      return { ok: true, user: result.user };
    } catch (err) {
      return adminError(err);
    }
  }

  function setRole(id, role) {
    if (!ROLES[role]) return Promise.resolve(fail('Choose a valid role.'));
    return updateUser(id, { role });
  }

  function setActive(id, isActive) {
    return updateUser(id, { isActive: !!isActive });
  }

  async function deleteUser(id) {
    try {
      const result = await Api.request('/admin/users/' + encodeURIComponent(id), {
        method: 'DELETE',
        token: token()
      });
      return { ok: true, user: result.user };
    } catch (err) {
      if (err.status === 404 && !(err.data && err.data.error)) {
        return fail('Deleting accounts is not available on this server yet. Deactivate the account instead.');
      }
      return adminError(err);
    }
  }

  return {
    ROLES, MODULES,
    register, login, logout, currentUser, token, checkSession, hasRole, requireRole, modulesFor,
    listUsers, setRole, setActive, deleteUser,
    validate: { name: validateName, email: validateEmail, password: validatePassword }
  };
})();
