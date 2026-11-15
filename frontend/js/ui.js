/*
 * BatchBite - shared UI helpers
 * Header/navigation, toasts, modals, form errors and button states.
 */
const UI = (() => {

  function escape(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDate(iso, withTime) {
    if (!iso) return '-';
    const date = new Date(iso);
    const options = withTime
      ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'short', year: 'numeric' };
    return date.toLocaleString('en-GB', options);
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  }

  function roleBadge(role) {
    const info = Auth.ROLES[role];
    return '<span class="badge badge-' + escape(info ? info.css : 'customer') + '">' + escape(info ? info.label : role) + '</span>';
  }

  /* ---------- header with role-based navigation ----------
   * Follows the Phase 1 wireframes: each role has its own tabs. On a phone the
   * tabs sit in a bar at the bottom of the screen; on a laptop they sit in the top menu.
   * A tab is only shown when its page is ready (Auth.MODULES ready flag).
   */

  const ICONS = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    cart: '<path d="M3 4h2l2.4 11h10.8L21 7H6.2"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
    orders: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    products: '<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9"/>',
    batches: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    stock: '<path d="M6 3h12l-1 5H7z"/><path d="M7 8v11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c2.5 0 4.5 1.5 5.5 4.5"/>'
  };

  function moduleReady(id) {
    const module = (typeof Auth !== 'undefined' && Auth.MODULES || []).find(m => m.id === id);
    return !!module && module.ready;
  }

  /* Tabs per role, in the order of the wireframes. `module` = card id in Auth.MODULES. */
  function tabsFor(role) {
    const T = (id, title, href, icon, module, target) => ({ id, title, href, icon, module, target });
    const tabs = {
      Customer: [
        T('home', 'Home', 'home.html', 'home'),
        T('cart', 'Cart', 'catalogue.html#cart', 'cart', 'browse', '.cart-bar'),
        moduleReady('myorders') ? T('orders', 'Orders', 'my-orders.html', 'orders', 'myorders')
                                : T('updates', 'Updates', 'notifications.html', 'bell', 'notifications'),
        T('profile', 'Profile', 'profile.html', 'profile')
      ],
      BusinessOwner: [
        T('home', 'Home', 'home.html', 'home'),
        T('products', 'Products', 'products.html', 'products', 'products'),
        T('batches', 'Batches', 'products.html#batches', 'batches', 'products', '#new-batch'),
        moduleReady('dashboard') ? T('orders', 'Orders', 'owner-dashboard.html', 'orders', 'dashboard')
                                 : T('orders', 'Orders', 'kitchen.html', 'orders', 'kitchen'),
        T('profile', 'Profile', 'profile.html', 'profile')
      ],
      KitchenStaff: [
        T('orders', 'Orders', 'kitchen.html', 'orders', 'kitchen'),
        T('stock', 'Ingredients', 'ingredients.html', 'stock', 'inventory'),
        T('updates', 'Updates', 'notifications.html', 'bell', 'notifications'),
        T('profile', 'Profile', 'profile.html', 'profile')
      ],
      Administrator: [
        T('home', 'Home', 'home.html', 'home'),
        T('users', 'Users', 'admin-users.html', 'users', 'users'),
        T('profile', 'Profile', 'profile.html', 'profile')
      ]
    }[role] || [T('home', 'Home', 'home.html', 'home'), T('profile', 'Profile', 'profile.html', 'profile')];

    const list = tabs.filter(tab => !tab.module || moduleReady(tab.module));
    // Kitchen Staff start on the Kitchen Dashboard; until it is ready, give them Home instead.
    if (!list.some(tab => tab.id === 'home') && !list.some(tab => tab.id === 'orders')) {
      list.unshift(T('home', 'Home', 'home.html', 'home'));
    }
    return list;
  }

  function activeTab(tabs) {
    const page = location.pathname.split('/').pop() || 'index.html';
    const hash = location.hash;
    const exact = tabs.find(tab => tab.href === page + hash);
    if (exact) return exact.id;
    const samePage = tabs.find(tab => tab.href.split('#')[0] === page && !tab.href.includes('#'));
    if (samePage) return samePage.id;
    const anyOnPage = tabs.find(tab => tab.href.split('#')[0] === page);
    return anyOnPage ? anyOnPage.id : null;
  }

  // Tabs such as Cart and Batches jump to a section of a page that is drawn after loading.
  function scrollToTarget(selector) {
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.querySelector(selector);
      if (el || ++tries > 40) {
        clearInterval(timer);
        if (el) (el.closest('.page-head') || el).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  function renderHeader(user, active) {
    const header = document.getElementById('app-header');
    if (!header || !user) return;
    const tabs = tabsFor(user.role);
    const current = activeTab(tabs);
    const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</svg>';
    const link = (tab, withIcon) => '<a href="' + tab.href + '" data-tab="' + tab.id + '"' +
      (tab.id === current ? ' class="active" aria-current="page"' : '') + '>' +
      (withIcon ? icon(tab.icon) : '') + '<span>' + tab.title + '</span></a>';

    header.innerHTML =
      '<div class="header-inner">' +
        '<a class="brand" href="home.html"><span class="brand-mark">B</span>BatchBite</a>' +
        '<nav class="nav" aria-label="Main">' + tabs.map(tab => link(tab, false)).join('') + '</nav>' +
        '<div class="header-user">' +
          '<span class="avatar" aria-hidden="true">' + escape(initials(user.name)) + '</span>' +
          '<span class="header-user-text"><strong>' + escape(user.name) + '</strong>' + roleBadge(user.role) + '</span>' +
          '<button type="button" class="btn btn-secondary btn-sm" id="switch-btn" title="Switch between your accounts and roles">Switch</button>' +
          '<button type="button" class="btn btn-secondary btn-sm" id="logout-btn">Log out</button>' +
        '</div>' +
      '</div>';

    let bar = document.getElementById('tab-bar');
    if (!bar) {
      bar = document.createElement('nav');
      bar.id = 'tab-bar';
      bar.setAttribute('aria-label', 'Main');
      document.body.appendChild(bar);
    }
    bar.style.setProperty('--tabs', tabs.length);
    bar.innerHTML = tabs.map(tab => link(tab, true)).join('');
    document.body.classList.add('has-tab-bar');

    // Section tabs (Cart, Batches): scroll on the same page, or after the page loads.
    header.onclick = bar.onclick = event => {
      const a = event.target.closest('a[data-tab]');
      const tab = a && tabs.find(t => t.id === a.dataset.tab);
      if (tab && tab.target && tab.href.split('#')[0] === (location.pathname.split('/').pop() || 'index.html')) {
        event.preventDefault();
        history.replaceState(null, '', tab.href);
        scrollToTarget(tab.target);
        renderHeader(user, active);
      }
    };
    const landed = tabs.find(tab => tab.target && tab.href === (location.pathname.split('/').pop() + location.hash));
    if (landed) scrollToTarget(landed.target);

    document.getElementById('switch-btn').addEventListener('click', () => switchAccount(user));

    document.getElementById('logout-btn').addEventListener('click', () => {
      confirm({
        title: 'Log out?',
        message: 'You will need to sign in again to use BatchBite.',
        confirmText: 'Log out'
      }).then(async yes => {
        if (!yes) return;
        await Auth.logout();
        location.replace('login.html?loggedOut=1');
      });
    });
  }

  /* ---------- switch account ----------
   * Lists every account signed in on this browser (Auth.savedAccounts) so the
   * user can jump between Administrator, Business Owner, Kitchen Staff and
   * Customer views in one click, or sign in to another account.
   */
  function switchAccount(user) {
    if (!document.querySelector('link[href="css/accounts.css"]')) {
      document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="css/accounts.css">');
    }
    const accounts = Auth.savedAccounts();
    const row = a => {
      const isCurrent = a.user.id === user.id;
      return '<button type="button" class="account-row' + (isCurrent ? ' current' : '') + '" data-account="' + a.user.id + '"' + (isCurrent ? ' disabled' : '') + '>' +
        '<span class="avatar" aria-hidden="true">' + escape(initials(a.user.name)) + '</span>' +
        '<span class="account-text"><strong>' + escape(a.user.name) + '</strong><span class="muted small">' + escape(a.user.email) + '</span></span>' +
        roleBadge(a.user.role) +
        (isCurrent ? '<span class="small muted">Current</span>' : (a.locked ? '<span class="small muted" title="Password needed">&#128274; Password</span>' : '')) +
      '</button>';
    };
    modal({
      title: 'Switch account',
      message: 'Accounts you have signed in to on this browser. Pick one to see BatchBite as that role.',
      bodyHtml: '<div class="account-list">' + accounts.map(row).join('') + '</div>' +
        '<a class="btn btn-secondary btn-block" href="login.html?add=1" id="add-account">Log in to another account</a>',
      confirmText: 'Close',
      cancelText: 'Cancel'
    });
    document.querySelectorAll('[data-account]').forEach(btn => btn.addEventListener('click', () => {
      const next = Auth.switchTo(Number(btn.dataset.account));
      if (!next) { toast('That account has signed out. Please log in again.', 'error'); return; }
      if (next.needsPassword) {
        const open = document.querySelector('.modal-backdrop');
        if (open) open.remove();
        askAdminPassword(next.user, next.persistent);
        return;
      }
      location.href = 'home.html';
    }));
  }

  /* Switching back to an Administrator always asks for the password again. */
  function askAdminPassword(admin, persistent) {
    modal({
      title: 'Enter the Administrator password',
      message: 'For security, ' + admin.name + ' (' + admin.email + ') needs the password every time you switch to the Administrator account.',
      bodyHtml: '<div class="field"><label for="admin-password">Password</label>' +
        '<div class="password-wrap"><input type="password" id="admin-password" name="password" autocomplete="current-password">' +
        '<button type="button" data-toggle-password="admin-password" aria-label="Show password" aria-pressed="false">Show</button></div>' +
        '<div class="field-error" data-error-for="password"></div></div>',
      confirmText: 'Switch to Administrator',
      onSubmit: async form => {
        if (!form.password.value) return { ok: false, field: 'password', error: 'Enter the password.' };
        const submit = form.querySelector('[type=submit]');
        setBusy(submit, true, 'Checking...');
        const result = await Auth.login(admin.email, form.password.value, persistent, 'Administrator');
        if (!result.ok) {
          setBusy(submit, false);
          return { ok: false, field: 'password', error: /incorrect|deactivated/i.test(result.error || '') ? 'That password is not correct.' : result.error };
        }
        return { ok: true };
      }
    }).then(done => { if (done) location.href = 'home.html'; });
    bindPasswordToggles(document.querySelector('.modal'));
  }

  /* ---------- server unreachable banner ---------- */

  function serverWarning(message) {
    if (document.getElementById('server-warning')) return;
    const banner = document.createElement('div');
    banner.id = 'server-warning';
    banner.className = 'server-warning';
    banner.setAttribute('role', 'alert');
    banner.textContent = message || 'The BatchBite server cannot be reached right now. Some information may be out of date.';
    const main = document.querySelector('main');
    (main || document.body).prepend(banner);
  }

  /* ---------- toast messages ---------- */

  function toast(message, type) {
    let holder = document.getElementById('toasts');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'toasts';
      holder.setAttribute('role', 'status');
      holder.setAttribute('aria-live', 'polite');
      document.body.appendChild(holder);
    }
    const item = document.createElement('div');
    item.className = 'toast toast-' + (type || 'success');
    item.textContent = message;
    holder.appendChild(item);
    setTimeout(() => item.classList.add('hide'), 3200);
    setTimeout(() => item.remove(), 3600);
  }

  /* ---------- modal dialog (no browser alerts) ---------- */

  function modal(options) {
    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
          '<h2 id="modal-title">' + escape(options.title) + '</h2>' +
          (options.message ? '<p class="muted">' + escape(options.message) + '</p>' : '') +
          '<form class="modal-body" novalidate>' + (options.bodyHtml || '') +
            '<div class="form-error" role="alert" hidden></div>' +
            '<div class="modal-actions">' +
              '<button type="button" class="btn btn-secondary" data-cancel>' + escape(options.cancelText || 'Cancel') + '</button>' +
              '<button type="submit" class="btn ' + (options.danger ? 'btn-danger' : 'btn-primary') + '">' + escape(options.confirmText || 'Confirm') + '</button>' +
            '</div>' +
          '</form>' +
        '</div>';
      document.body.appendChild(backdrop);
      const form = backdrop.querySelector('form');
      const firstInput = form.querySelector('input, select');
      (firstInput || form.querySelector('[type=submit]')).focus();

      function close(value) {
        document.removeEventListener('keydown', onKey);
        backdrop.remove();
        resolve(value);
      }
      function onKey(event) { if (event.key === 'Escape') close(null); }
      document.addEventListener('keydown', onKey);
      backdrop.querySelector('[data-cancel]').addEventListener('click', () => close(null));
      backdrop.addEventListener('click', event => { if (event.target === backdrop) close(null); });

      form.addEventListener('submit', event => {
        event.preventDefault();
        clearErrors(form);
        if (!options.onSubmit) return close(true);
        Promise.resolve(options.onSubmit(form)).then(result => {
          if (result && result.ok === false) {
            showResultError(form, result);
            return;
          }
          close(result || true);
        });
      });
    });
  }

  function confirm(options) {
    return modal(options).then(value => !!value);
  }

  /* ---------- forms ---------- */

  function clearErrors(form) {
    form.querySelectorAll('.field-error').forEach(el => { el.textContent = ''; });
    form.querySelectorAll('.invalid').forEach(el => { el.classList.remove('invalid'); el.removeAttribute('aria-invalid'); });
    const general = form.querySelector('.form-error');
    if (general) { general.textContent = ''; general.hidden = true; }
  }

  function showResultError(form, result) {
    const input = result.field ? form.querySelector('[name="' + result.field + '"]') : null;
    const slot = result.field ? form.querySelector('[data-error-for="' + result.field + '"]') : null;
    if (input && slot) {
      input.classList.add('invalid');
      input.setAttribute('aria-invalid', 'true');
      slot.textContent = result.error;
      input.focus();
    } else {
      const general = form.querySelector('.form-error');
      if (general) { general.textContent = result.error; general.hidden = false; }
      else toast(result.error, 'error');
    }
  }

  /* Disables the button while an action runs, preventing double submissions (FR-21) */
  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = busyText || 'Please wait...';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.label || button.textContent;
      button.disabled = false;
    }
  }

  function formData(form) {
    const data = {};
    new FormData(form).forEach((value, key) => { data[key] = typeof value === 'string' ? value : ''; });
    form.querySelectorAll('input[type=checkbox]').forEach(box => { data[box.name] = box.checked; });
    return data;
  }

  /* Show / hide password buttons */
  function bindPasswordToggles(root) {
    (root || document).querySelectorAll('[data-toggle-password]').forEach(button => {
      button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.togglePassword);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.textContent = show ? 'Hide' : 'Show';
        button.setAttribute('aria-pressed', String(show));
      });
    });
  }

  return { serverWarning, escape, formatDate, initials, roleBadge, renderHeader, toast, modal, confirm, clearErrors, showResultError, setBusy, formData, bindPasswordToggles };
})();
