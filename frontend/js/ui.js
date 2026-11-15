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

  /* ---------- header with role-based navigation ---------- */

  function renderHeader(user, active) {
    const header = document.getElementById('app-header');
    if (!header || !user) return;
    const links = [{ id: 'home', title: 'Home', href: 'home.html' }];
    if (user.role === 'Administrator') links.push({ id: 'users', title: 'Users', href: 'admin-users.html' });
    links.push({ id: 'profile', title: 'My account', href: 'profile.html' });

    header.innerHTML =
      '<div class="header-inner">' +
        '<a class="brand" href="home.html"><span class="brand-mark">B</span>BatchBite</a>' +
        '<nav class="nav" aria-label="Main">' +
          links.map(l => '<a href="' + l.href + '"' + (l.id === active ? ' class="active" aria-current="page"' : '') + '>' + l.title + '</a>').join('') +
        '</nav>' +
        '<div class="header-user">' +
          '<span class="avatar" aria-hidden="true">' + escape(initials(user.name)) + '</span>' +
          '<span class="header-user-text"><strong>' + escape(user.name) + '</strong>' + roleBadge(user.role) + '</span>' +
          '<button type="button" class="btn btn-secondary btn-sm" id="logout-btn">Log out</button>' +
        '</div>' +
      '</div>';

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
