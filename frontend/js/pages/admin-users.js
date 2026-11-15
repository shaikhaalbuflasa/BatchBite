/* Administrator: user management (FR-3)
 * GET /users lists accounts; PUT /admin/users/:id changes role or isActive.
 */
(async () => {
  const me = await Auth.requireRole(['Administrator']);
  if (!me) return;

  UI.renderHeader(me, 'users');

  const els = {
    stats: document.getElementById('stats'),
    rows: document.getElementById('user-rows'),
    count: document.getElementById('result-count'),
    search: document.getElementById('search'),
    role: document.getElementById('filter-role'),
    status: document.getElementById('filter-status'),
    sort: document.getElementById('sort'),
    refresh: document.getElementById('refresh-btn')
  };

  let users = [];
  const roleKeys = Object.keys(Auth.ROLES).sort((a, b) => Auth.ROLES[b].level - Auth.ROLES[a].level);
  els.role.insertAdjacentHTML('beforeend', roleKeys.map(key =>
    '<option value="' + key + '">' + UI.escape(Auth.ROLES[key].label) + '</option>').join(''));

  // Remember the administrator's filters and sort order in this browser
  const saved = Store.get('adminUserView', {});
  if (saved.role) els.role.value = saved.role;
  if (saved.status) els.status.value = saved.status;
  if (saved.sort) els.sort.value = saved.sort;

  function roleOptions(selected) {
    return roleKeys.map(key =>
      '<option value="' + key + '"' + (key === selected ? ' selected' : '') + '>' + UI.escape(Auth.ROLES[key].label) + '</option>'
    ).join('');
  }

  const level = role => (Auth.ROLES[role] ? Auth.ROLES[role].level : 0);
  const roleLabel = role => (Auth.ROLES[role] ? Auth.ROLES[role].label : role);

  /* ---------- rendering ---------- */

  function renderStats() {
    const count = predicate => users.filter(predicate).length;
    const items = [
      { label: 'Total accounts', value: users.length },
      { label: 'Customers', value: count(u => u.role === 'Customer') },
      { label: 'Business Owners', value: count(u => u.role === 'BusinessOwner') },
      { label: 'Kitchen Staff', value: count(u => u.role === 'KitchenStaff') },
      { label: 'Administrators', value: count(u => u.role === 'Administrator') },
      { label: 'Inactive', value: count(u => !u.isActive) }
    ];
    els.stats.innerHTML = items.map(item =>
      '<div class="stat"><div class="value">' + item.value + '</div><div class="label">' + item.label + '</div></div>').join('');
  }

  function visibleUsers() {
    const term = els.search.value.trim().toLowerCase();
    const role = els.role.value;
    const status = els.status.value;
    const list = users.filter(u =>
      (!term || (u.name + ' ' + u.email).toLowerCase().includes(term)) &&
      (!role || u.role === role) &&
      (!status || (status === 'active') === u.isActive));

    const sorters = {
      level: (a, b) => level(b.role) - level(a.role) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      newest: (a, b) => b.id - a.id
    };
    return list.sort(sorters[els.sort.value] || sorters.level);
  }

  function rowHtml(user) {
    const self = user.id === me.id;
    return '<tr data-id="' + user.id + '"' + (user.isActive ? '' : ' class="is-inactive"') + '>' +
      '<td><div class="user-cell"><span class="avatar">' + UI.escape(UI.initials(user.name)) + '</span>' +
        '<div><strong>' + UI.escape(user.name) + (self ? '<span class="you">You</span>' : '') + '</strong>' +
        '<span>' + UI.escape(user.email) + '</span></div></div></td>' +
      '<td>#' + UI.escape(user.id) + '</td>' +
      '<td><select data-action="role" aria-label="Role for ' + UI.escape(user.name) + '"' +
        (self ? ' disabled title="You cannot change your own role"' : '') + '>' + roleOptions(user.role) + '</select></td>' +
      '<td><label class="switch"' + (self ? ' title="You cannot deactivate your own account"' : '') + '>' +
        '<input type="checkbox" data-action="status"' + (user.isActive ? ' checked' : '') + (self ? ' disabled' : '') +
        ' aria-label="Account active for ' + UI.escape(user.name) + '">' +
        '<span class="track"></span><span class="status status-' + (user.isActive ? 'active' : 'inactive') + '">' +
        (user.isActive ? 'Active' : 'Inactive') + '</span></label></td>' +
      '<td><button type="button" class="btn btn-danger-ghost btn-sm" data-action="delete"' +
        (self ? ' disabled title="You cannot delete your own account"' : '') + '>Delete</button></td>' +
    '</tr>';
  }

  function render() {
    renderStats();
    const list = visibleUsers();
    els.rows.innerHTML = list.length
      ? list.map(rowHtml).join('')
      : '<tr><td colspan="5" class="empty">' + (users.length ? 'No users match your search.' : 'No accounts yet.') + '</td></tr>';
    els.count.textContent = 'Showing ' + list.length + ' of ' + users.length + ' account' + (users.length === 1 ? '' : 's');
  }

  async function load() {
    UI.setBusy(els.refresh, true, 'Refreshing...');
    const result = await Auth.listUsers();
    UI.setBusy(els.refresh, false);
    if (!result.ok) {
      els.rows.innerHTML = '<tr><td colspan="5" class="empty">' + UI.escape(result.error) + '</td></tr>';
      return;
    }
    users = result.users;
    render();
  }

  /* ---------- role and status changes ---------- */

  function setRowBusy(row, busy) {
    row.querySelectorAll('select, input').forEach(control => { control.disabled = busy; });
  }

  els.rows.addEventListener('change', async event => {
    const target = event.target;
    const row = target.closest('tr[data-id]');
    if (!row) return;
    const user = users.find(u => String(u.id) === row.dataset.id);
    if (!user) { render(); return; }

    if (target.dataset.action === 'role') {
      const newRole = target.value;
      const yes = await UI.confirm({
        title: 'Change role?',
        message: 'Change ' + user.name + ' from ' + roleLabel(user.role) + ' to ' + roleLabel(newRole) +
                 '? The new access applies the next time they open a page.',
        confirmText: 'Change role'
      });
      if (!yes) { render(); return; }
      setRowBusy(row, true);
      const result = await Auth.setRole(user.id, newRole);
      if (result.ok) {
        Object.assign(user, result.user);
        UI.toast(user.name + ' is now ' + roleLabel(newRole) + '.');
      } else {
        UI.toast(result.error, 'error');
      }
      render();
    }

    if (target.dataset.action === 'status') {
      const activate = target.checked;
      if (!activate) {
        const yes = await UI.confirm({
          title: 'Deactivate account?',
          message: user.name + ' will be signed out and will not be able to log in until the account is activated again. Their orders and data are kept.',
          confirmText: 'Deactivate',
          danger: true
        });
        if (!yes) { render(); return; }
      }
      setRowBusy(row, true);
      const result = await Auth.setActive(user.id, activate);
      if (result.ok) {
        Object.assign(user, result.user);
        UI.toast(activate ? user.name + ' can log in again.' : user.name + ' has been deactivated.');
      } else {
        UI.toast(result.error, 'error');
      }
      render();
    }
  });

  els.rows.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action="delete"]');
    if (!button || button.disabled) return;
    const row = button.closest('tr[data-id]');
    const user = users.find(u => String(u.id) === row.dataset.id);
    if (!user) { render(); return; }

    const yes = await UI.confirm({
      title: 'Delete account?',
      message: 'This permanently deletes ' + user.name + ' (' + user.email + '). This cannot be undone. ' +
               'Accounts that already have orders or business records cannot be deleted; deactivate them instead.',
      confirmText: 'Delete account',
      danger: true
    });
    if (!yes) return;
    UI.setBusy(button, true, 'Deleting...');
    const result = await Auth.deleteUser(user.id);
    if (result.ok) {
      users = users.filter(u => u.id !== user.id);
      UI.toast(user.name + ' was deleted.');
      render();
    } else {
      UI.setBusy(button, false);
      UI.toast(result.error, 'error');
    }
  });

  /* ---------- toolbar ---------- */

  function saveView() {
    Store.set('adminUserView', { role: els.role.value, status: els.status.value, sort: els.sort.value }, true);
  }

  els.search.addEventListener('input', render);
  [els.role, els.status, els.sort].forEach(control =>
    control.addEventListener('change', () => { saveView(); render(); }));
  els.refresh.addEventListener('click', load);

  load();
})();
