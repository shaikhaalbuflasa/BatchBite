/*
 * BatchBite - Kitchen Staff page (Business Owner)
 * A Business Owner creates logins for their kitchen team; staff can't sign up
 * themselves. Staff then log in by choosing "Kitchen Staff" on the login page.
 * Requirements: FR-1 (role-based accounts), FR-2 (role-limited access), FR-21.
 *
 * Backend routes used:
 *   GET  /owner/staff        - this owner's Kitchen Staff
 *   POST /owner/staff        - create a Kitchen Staff login { name, email, password }
 *   PUT  /owner/staff/:id    - turn a staff member's access on or off { isActive }
 */
(async () => {
  const me = await Auth.requireRole(['BusinessOwner']);
  if (!me) return;
  UI.renderHeader(me, 'staff');

  const E = UI.escape;
  const api = (path, options) => Api.request(path, Object.assign({ token: Auth.token() }, options || {}));
  const form = document.getElementById('staff-form');
  const addBtn = document.getElementById('add-btn');
  const listEl = document.getElementById('staff-list');
  let staff = [];

  UI.bindPasswordToggles(form);

  async function load() {
    try {
      staff = await api('/owner/staff');
      render();
    } catch (err) {
      listEl.innerHTML = '<p class="form-error">' + E(err.message) + '</p>';
    }
  }

  function render() {
    if (!staff.length) {
      listEl.innerHTML = '<div class="card empty">No staff yet. Add your first team member with the form.</div>';
      return;
    }
    listEl.innerHTML = '<div class="table-wrap"><table>' +
      '<thead><tr><th>Staff member</th><th>User ID</th><th>Access</th><th></th></tr></thead><tbody>' +
      staff.map(s => '<tr>' +
        '<td><strong>' + E(s.name) + '</strong><span class="muted small">' + E(s.email) + '</span></td>' +
        '<td>#' + s.id + '</td>' +
        '<td><span class="status ' + (s.isActive ? 'status-active' : 'status-inactive') + '">' + (s.isActive ? 'Active' : 'Turned off') + '</span></td>' +
        '<td><button type="button" class="btn btn-secondary btn-sm" data-toggle="' + s.id + '">' + (s.isActive ? 'Turn off' : 'Turn on') + '</button></td>' +
      '</tr>').join('') +
      '</tbody></table></div>' +
      '<p class="muted small">The user ID is used when you assign production tasks on the Kitchen Dashboard.</p>';

    listEl.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', () => toggle(Number(btn.dataset.toggle), btn)));
  }

  async function toggle(id, button) {
    const s = staff.find(x => x.id === id);
    const turningOff = s.isActive;
    if (turningOff) {
      const yes = await UI.confirm({
        title: 'Turn off access for ' + s.name + '?',
        message: 'They will be signed out and can\'t log in until you turn access back on.',
        confirmText: 'Turn off',
        danger: true
      });
      if (!yes) return;
    }
    UI.setBusy(button, true, 'Saving...');                 // FR-21
    try {
      await api('/owner/staff/' + id, { method: 'PUT', body: { isActive: !s.isActive } });
      UI.toast(s.name + (turningOff ? '\'s access is turned off.' : ' can log in again.'));
      await load();
    } catch (err) {
      UI.toast(err.message, 'error');
      UI.setBusy(button, false);
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    UI.clearErrors(form);
    const data = UI.formData(form);
    const nameError = Auth.validate.name(data.name);
    if (nameError) return UI.showResultError(form, { ok: false, field: 'name', error: nameError });
    const emailError = Auth.validate.email(data.email);
    if (emailError) return UI.showResultError(form, { ok: false, field: 'email', error: emailError });
    const passwordError = Auth.validate.password(data.password);
    if (passwordError) return UI.showResultError(form, { ok: false, field: 'password', error: passwordError });

    UI.setBusy(addBtn, true, 'Creating...');               // FR-21
    try {
      const created = await api('/owner/staff', {
        method: 'POST',
        body: { name: data.name.trim(), email: data.email.trim(), password: data.password }
      });
      form.reset();
      UI.toast(created.name + ' can now log in as Kitchen Staff with ' + created.email + '.');
      await load();
    } catch (err) {
      const field = /email/i.test(err.message) ? 'email' : null;
      UI.showResultError(form, { ok: false, field, error: /already registered/i.test(err.message) ? 'An account with this email already exists.' : err.message });
    } finally {
      UI.setBusy(addBtn, false);
    }
  });

  load();
})();
