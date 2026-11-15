/*
 * BatchBite - Kitchen Dashboard (Aaya)
 * ------------------------------------
 * FR-18 Kitchen order list with items and customer notes   GET  /kitchen/orders
 * FR-14 Order status updates (Confirmed > Preparing > Ready) PUT  /orders/:id/status   { status }
 * FR-15 Only valid transitions; Collected only via pickup     (checked by the backend; the page only offers the next step)
 * FR-20 Customer notifications (ready and delay notices)      POST /orders/:id/delay    { reason }
 * FR-21 No duplicate submissions (buttons are disabled while a request is running)
 * FR-26 Preparation grouping                                  GET  /production/preparation-groups
 * Production tasks                    GET/POST /productionTasks, PUT .../complete, PUT .../priority, DELETE .../:id
 * FR-25 Pickup verification                                   POST /pickup/verify       { pickupCode }
 *
 * The backend is the authority: after every change the page reloads the data from the server.
 */
(async () => {
  const me = await Auth.requireRole(['KitchenStaff', 'BusinessOwner']);
  if (!me) return;
  UI.renderHeader(me, '');

  const E = UI.escape;
  const api = (path, options) => Api.request(path, Object.assign({ token: Auth.token() }, options || {}));

  const state = { orders: [], groups: [], tasks: [] };
  const NEXT_STEP = {
    Confirmed: { status: 'Preparing', label: 'Start preparing' },
    Preparing: { status: 'Ready', label: 'Mark ready' }
  };
  const PRIORITIES = ['High', 'Medium', 'Low'];
  const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };

  const els = {
    board: document.getElementById('board'),
    groups: document.getElementById('group-rows'),
    tasks: document.getElementById('task-rows'),
    taskForm: document.getElementById('task-form'),
    taskOrder: document.getElementById('task-order'),
    taskStaff: document.getElementById('task-staff'),
    taskStaffHint: document.getElementById('task-staff-hint'),
    pickupForm: document.getElementById('pickup-form'),
    pickupResult: document.getElementById('pickup-result'),
    refresh: document.getElementById('refresh-btn')
  };

  // Kitchen Staff assign tasks to themselves by default; owners enter a Kitchen Staff user ID.
  if (me.role === 'KitchenStaff') {
    els.taskStaff.value = me.id;
    els.taskStaffHint.textContent = 'Your user ID is ' + me.id + '. Change it to assign another Kitchen Staff member.';
  } else {
    els.taskStaffHint.textContent = 'Enter the user ID of an active Kitchen Staff member.';
  }

  /* ---------------- helpers ---------------- */

  function customerFor(orderId) {
    for (const group of state.groups) {
      const entry = group.orders.find(o => o.orderId === orderId);
      if (entry) return entry.customerId;
    }
    return null;
  }

  function pickupText(order) {
    if (!order.pickupDate) return 'Pickup slot not set';
    return 'Pickup ' + order.pickupDate + (order.pickupStartTime ? ', ' + order.pickupStartTime + '–' + order.pickupEndTime : '');
  }

  function staffLabel(id) {
    return id === me.id ? 'You' : 'Staff #' + id;
  }

  function sectionError(target, colspan, err) {
    const text = UI.escape(err.message || 'Could not load this section.');
    if (colspan) target.innerHTML = '<tr><td colspan="' + colspan + '" class="empty">' + text + '</td></tr>';
    else target.innerHTML = '<p class="form-error">' + text + '</p>';
  }

  /* ---------------- loading ---------------- */

  async function loadAll() {
    UI.setBusy(els.refresh, true, 'Refreshing...');
    const [orders, groups, tasks] = await Promise.allSettled([
      api('/kitchen/orders'),
      api('/production/preparation-groups'),
      api('/productionTasks')
    ]);
    UI.setBusy(els.refresh, false);

    // Store both lists first: order cards use the groups (customer ID) and groups use the orders (batch name).
    if (orders.status === 'fulfilled') state.orders = orders.value;
    if (groups.status === 'fulfilled') state.groups = groups.value;

    if (groups.status === 'fulfilled') renderGroups();
    else sectionError(els.groups, 5, groups.reason);

    if (orders.status === 'fulfilled') { renderBoard(); renderTaskOrderOptions(); }
    else sectionError(els.board, 0, orders.reason);

    if (tasks.status === 'fulfilled') { state.tasks = tasks.value; renderTasks(); }
    else sectionError(els.tasks, 6, tasks.reason);

    renderStats();
  }

  /* ---------------- overview ---------------- */

  function renderStats() {
    const count = status => state.orders.filter(o => o.status === status).length;
    const pending = state.tasks.filter(t => t.status === 'Pending');
    document.getElementById('stat-confirmed').textContent = count('Confirmed');
    document.getElementById('stat-preparing').textContent = count('Preparing');
    document.getElementById('stat-ready').textContent = count('Ready');
    document.getElementById('stat-tasks').textContent = pending.length;
    document.getElementById('stat-high').textContent = pending.filter(t => t.priority === 'High').length;
  }

  /* ---------------- order board ---------------- */

  function orderCard(order) {
    const customerId = customerFor(order.orderId);
    const next = NEXT_STEP[order.status];
    const items = order.items.map(item =>
      '<li><span class="qty">' + E(item.quantity) + '×</span>' + E(item.productName) +
      (item.variantName ? ' <span class="muted">(' + E(item.variantName) + ')</span>' : '') +
      (item.notes ? '<span class="note">Note: ' + E(item.notes) + '</span>' : '') + '</li>').join('');

    let actions = '';
    if (next) {
      actions = '<button type="button" class="btn btn-primary btn-sm" data-action="advance" data-id="' + order.orderId + '" data-status="' + next.status + '">' + next.label + '</button>' +
                '<button type="button" class="btn btn-secondary btn-sm" data-action="delay" data-id="' + order.orderId + '">Report delay</button>';
    } else {
      actions = '<span class="awaiting">Waiting for the customer to collect</span>';
    }

    return '<article class="order-card" data-order="' + order.orderId + '">' +
      '<div class="order-card-head"><strong>Order #' + E(order.orderId) + '</strong><span class="st st-' + E(order.status) + '">' + E(order.status) + '</span></div>' +
      '<div class="order-meta">' + E(order.batchName) + (customerId ? ' · Customer #' + E(customerId) : '') + '<br>' + E(pickupText(order)) + '</div>' +
      '<ul class="order-items">' + items + '</ul>' +
      '<div class="order-actions">' + actions + '</div>' +
    '</article>';
  }

  function renderBoard() {
    const columns = [
      { status: 'Confirmed', title: 'Confirmed', empty: 'No new orders to start.' },
      { status: 'Preparing', title: 'Preparing', empty: 'Nothing is being prepared.' },
      { status: 'Ready', title: 'Ready for pickup', empty: 'No orders waiting for pickup.' }
    ];
    if (!state.orders.length) {
      els.board.innerHTML = columns.map(c =>
        '<div class="board-col"><div class="board-col-head"><h3>' + c.title + '</h3><span class="count">0</span></div>' +
        '<div class="board-empty">' + c.empty + '</div></div>').join('');
      return;
    }
    els.board.innerHTML = columns.map(c => {
      const list = state.orders.filter(o => o.status === c.status);
      return '<div class="board-col" data-col="' + c.status + '"><div class="board-col-head"><h3>' + c.title + '</h3><span class="count">' + list.length + '</span></div>' +
        (list.length ? list.map(orderCard).join('') : '<div class="board-empty">' + c.empty + '</div>') + '</div>';
    }).join('');
  }

  async function advanceOrder(button) {
    const orderId = Number(button.dataset.id);
    const status = button.dataset.status;
    if (status === 'Ready') {
      const yes = await UI.confirm({
        title: 'Mark order #' + orderId + ' as ready?',
        message: 'The customer will be notified that the order is ready for pickup.',
        confirmText: 'Mark ready'
      });
      if (!yes) return;
    }
    UI.setBusy(button, true, 'Updating...');
    try {
      await api('/orders/' + orderId + '/status', { method: 'PUT', body: { status } });
      UI.toast('Order #' + orderId + ' is now ' + status + '.');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
    await loadAll();
  }

  async function reportDelay(orderId) {
    const result = await UI.modal({
      title: 'Report a delay for order #' + orderId,
      message: 'The customer receives this message in their BatchBite notifications.',
      bodyHtml: '<div class="field"><label for="m-reason">Reason for the delay</label>' +
                '<textarea id="m-reason" name="reason" maxlength="200" placeholder="e.g. The oven needs extra time; the order will be ready 30 minutes later."></textarea>' +
                '<div class="field-error" data-error-for="reason"></div></div>',
      confirmText: 'Send delay notice',
      onSubmit: async form => {
        const reason = form.querySelector('[name=reason]').value.trim();
        if (!reason) return { ok: false, error: 'Please enter a reason for the delay.', field: 'reason' };
        try {
          const notification = await api('/orders/' + orderId + '/delay', { method: 'POST', body: { reason } });
          return { ok: true, notification };
        } catch (err) {
          return { ok: false, error: err.message, field: 'reason' };
        }
      }
    });
    if (result && result.ok) {
      UI.toast('Delay notice sent to the customer for order #' + orderId + '.');
      await loadAll();
    }
  }

  els.board.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    if (button.dataset.action === 'advance') advanceOrder(button);
    if (button.dataset.action === 'delay') reportDelay(Number(button.dataset.id));
  });

  /* ---------------- preparation groups ---------------- */

  function renderGroups() {
    if (!state.groups.length) {
      els.groups.innerHTML = '<tr><td colspan="5" class="empty">No active orders to group.</td></tr>';
      return;
    }
    const batchName = id => {
      const order = state.orders.find(o => o.batchId === id);
      return order ? order.batchName : 'Batch #' + id;
    };
    els.groups.innerHTML = state.groups.map(g =>
      '<tr><td>' + E(batchName(g.batchId)) + '</td><td><strong>' + E(g.productName) + '</strong></td><td>' + E(g.variantName || '-') + '</td>' +
      '<td class="num"><strong>' + E(g.totalQuantity) + '</strong></td><td>' +
      g.orders.map(o => '#' + E(o.orderId) + ' × ' + E(o.quantity) + (o.notes ? ' <span class="note">' + E(o.notes) + '</span>' : '')).join('<br>') +
      '</td></tr>').join('');
  }

  /* ---------------- production tasks ---------------- */

  function renderTaskOrderOptions() {
    const open = state.orders.filter(o => o.status === 'Confirmed' || o.status === 'Preparing');
    const current = els.taskOrder.value;
    els.taskOrder.innerHTML = open.length
      ? open.map(o => '<option value="' + o.orderId + '">#' + o.orderId + ' · ' + E(o.items.map(i => i.quantity + '× ' + i.productName).join(', ')) + '</option>').join('')
      : '<option value="">No open orders</option>';
    if (current && open.some(o => String(o.orderId) === current)) els.taskOrder.value = current;
  }

  function renderTasks() {
    if (!state.tasks.length) {
      els.tasks.innerHTML = '<tr><td colspan="6" class="empty">No production tasks yet. Add one above.</td></tr>';
      return;
    }
    const list = state.tasks.slice().sort((a, b) =>
      (a.status === 'Completed') - (b.status === 'Completed') ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.id - b.id);

    els.tasks.innerHTML = list.map(task => {
      const pending = task.status === 'Pending';
      const priority = pending
        ? '<select class="mini-select" data-action="priority" data-id="' + task.id + '" aria-label="Priority for ' + E(task.name) + '">' +
            PRIORITIES.map(p => '<option' + (p === task.priority ? ' selected' : '') + '>' + p + '</option>').join('') + '</select>'
        : '<span class="pri pri-' + E(task.priority) + '">' + E(task.priority) + '</span>';
      const actions = pending
        ? '<div class="actions"><button type="button" class="btn btn-primary btn-sm" data-action="complete" data-id="' + task.id + '">Complete</button>' +
          '<button type="button" class="btn btn-danger-ghost btn-sm" data-action="delete" data-id="' + task.id + '">Delete</button></div>'
        : '<span class="muted small">Done ' + E(UI.formatDate(task.completedAt, true)) + '</span>';
      return '<tr' + (pending ? '' : ' class="is-done"') + '>' +
        '<td><strong>' + E(task.name) + '</strong></td>' +
        '<td>#' + E(task.orderId) + '</td>' +
        '<td>' + E(staffLabel(task.assignedTo)) + '</td>' +
        '<td>' + priority + '</td>' +
        '<td><span class="st st-' + E(task.status) + '">' + E(task.status) + '</span></td>' +
        '<td>' + actions + '</td></tr>';
    }).join('');
  }

  els.taskForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = els.taskForm.querySelector('[type=submit]');
    if (button.disabled) return;
    UI.clearErrors(els.taskForm);

    const orderId = Number(els.taskOrder.value);
    const name = els.taskForm.querySelector('[name=name]').value.trim();
    const priority = els.taskForm.querySelector('[name=priority]').value;
    const assignedTo = Number(els.taskStaff.value);

    if (!orderId) return UI.showResultError(els.taskForm, { error: 'There is no open order to attach a task to.', field: 'orderId' });
    if (!name) return UI.showResultError(els.taskForm, { error: 'Enter a task, for example "Bake cupcakes".', field: 'name' });
    if (!Number.isInteger(assignedTo) || assignedTo <= 0) return UI.showResultError(els.taskForm, { error: 'Enter a valid staff user ID.', field: 'assignedTo' });

    UI.setBusy(button, true, 'Adding...');
    try {
      await api('/productionTasks', { method: 'POST', body: { orderId, name, assignedTo, priority } });
      UI.toast('Task added.');
      els.taskForm.querySelector('[name=name]').value = '';
      await loadAll();
    } catch (err) {
      const field = /staff/i.test(err.message) ? 'assignedTo' : /order/i.test(err.message) ? 'orderId' : null;
      UI.showResultError(els.taskForm, { error: err.message, field });
    } finally {
      UI.setBusy(button, false);
    }
  });

  els.tasks.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const task = state.tasks.find(t => t.id === Number(button.dataset.id));
    if (!task) return;

    if (button.dataset.action === 'complete') {
      UI.setBusy(button, true, 'Saving...');
      try {
        await api('/productionTasks/' + task.id + '/complete', { method: 'PUT' });
        UI.toast('"' + task.name + '" marked as completed.');
      } catch (err) { UI.toast(err.message, 'error'); }
      await loadAll();
    }

    if (button.dataset.action === 'delete') {
      const yes = await UI.confirm({
        title: 'Delete task?',
        message: '"' + task.name + '" for order #' + task.orderId + ' will be removed. This cannot be undone.',
        confirmText: 'Delete task',
        danger: true
      });
      if (!yes) return;
      UI.setBusy(button, true, 'Deleting...');
      try {
        await api('/productionTasks/' + task.id, { method: 'DELETE' });
        UI.toast('Task deleted.');
      } catch (err) { UI.toast(err.message, 'error'); }
      await loadAll();
    }
  });

  els.tasks.addEventListener('change', async event => {
    const select = event.target.closest('select[data-action="priority"]');
    if (!select) return;
    const task = state.tasks.find(t => t.id === Number(select.dataset.id));
    select.disabled = true;
    try {
      await api('/productionTasks/' + task.id + '/priority', { method: 'PUT', body: { priority: select.value } });
      UI.toast('"' + task.name + '" is now ' + select.value + ' priority.');
    } catch (err) { UI.toast(err.message, 'error'); }
    await loadAll();
  });

  /* ---------------- pickup verification ---------------- */

  els.pickupForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = els.pickupForm.querySelector('[type=submit]');
    if (button.disabled) return;
    UI.clearErrors(els.pickupForm);
    els.pickupResult.innerHTML = '';

    const input = els.pickupForm.querySelector('[name=pickupCode]');
    const pickupCode = input.value.trim();
    if (!pickupCode) return UI.showResultError(els.pickupForm, { error: 'Enter the pickup code shown by the customer.', field: 'pickupCode' });

    UI.setBusy(button, true, 'Verifying...');
    try {
      const result = await api('/pickup/verify', { method: 'POST', body: { pickupCode } });
      input.value = '';
      els.pickupResult.innerHTML = '<div class="notice-ok">Pickup verified. Order #' + E(result.orderId) + ' is now <strong>' + E(result.status) + '</strong>.</div>';
      UI.toast('Order #' + result.orderId + ' collected.');
      await loadAll();
    } catch (err) {
      els.pickupResult.innerHTML = '<div class="notice-bad">' + E(err.message) + '</div>';
    } finally {
      UI.setBusy(button, false);
    }
  });

  // Clear a field's error message as soon as the user edits it (forms and pop-ups).
  document.addEventListener('input', event => {
    const field = event.target;
    if (!field.name) return;
    const holder = field.closest('form');
    const error = holder && holder.querySelector('[data-error-for="' + field.name + '"]');
    if (error) error.textContent = '';
    field.classList.remove('invalid');
    field.removeAttribute('aria-invalid');
  });

  els.refresh.addEventListener('click', loadAll);
  loadAll();
})();
