/*
 * BatchBite - Owner Dashboard (Business Owner)
 * Module: Pickup and Order Management (Marwa)
 * Requirements: FR-17 (dashboard of orders, cancellations and production progress),
 *               FR-14 / FR-15 (valid status steps only), FR-25 (pickup code check),
 *               FR-27 (counts by status), FR-21 (no duplicate submissions)
 *
 * Backend routes used:
 *   GET  /owners/:id/orders      - orders for this owner's batches (with customer, batch and slot)
 *   GET  /reports/owner/:id      - totals: orders by status, revenue, items, production tasks
 *   GET  /batches                - batch filter
 *   PUT  /orders/:id/status      - move an order one step: Confirmed -> Preparing -> Ready
 *   POST /pickup/verify          - check a customer's pickup code; marks a Ready order Collected
 */
(async () => {
  const me = await Auth.requireRole(['BusinessOwner']);
  if (!me) return;
  UI.renderHeader(me, 'dashboard');

  const E = UI.escape;
  const api = (path, options) => Api.request(path, Object.assign({ token: Auth.token() }, options || {}));
  const money = n => 'BD ' + Number(n || 0).toFixed(2);
  const NEXT = { Confirmed: 'Preparing', Preparing: 'Ready' };

  const ordersEl = document.getElementById('orders');
  const progressEl = document.getElementById('progress');
  const summaryEl = document.getElementById('summary');
  const searchEl = document.getElementById('search');
  const batchEl = document.getElementById('filter-batch');
  const statusEl = document.getElementById('filter-status');

  let orders = [];
  let report = null;
  let batches = [];

  const timeLabel = t => {
    if (!t) return '';
    const [h, m] = String(t).split(':').map(Number);
    return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + (h >= 12 ? ' PM' : ' AM');
  };
  const stat = (label, value) => '<div class="stat"><div class="value">' + value + '</div><div class="label">' + label + '</div></div>';

  /* ---------- load ---------- */

  async function load() {
    try {
      const [ownerOrders, ownerReport, allBatches] = await Promise.all([
        api('/owners/' + me.id + '/orders'),
        api('/reports/owner/' + me.id),
        api('/batches')
      ]);
      orders = ownerOrders;
      report = ownerReport;
      const previous = batchEl.value;
      batches = allBatches.filter(b => b.ownerId === me.id);
      batchEl.innerHTML = '<option value="all">All batches</option>' +
        batches.map(b => '<option value="' + b.id + '">' + E(b.name) + '</option>').join('');
      if (previous) batchEl.value = previous;
      renderStats();
      renderOrders();
    } catch (err) {
      ordersEl.innerHTML = '<p class="form-error">' + E(err.message) + '</p>';
    }
  }

  function renderStats() {
    progressEl.innerHTML =
      stat('Confirmed', report.confirmedOrders) +
      stat('Preparing', report.preparingOrders) +
      stat('Ready for pickup', report.readyOrders) +
      stat('Collected', report.collectedOrders) +
      stat('Cancelled', report.cancelledOrders);
    summaryEl.innerHTML =
      stat('Total orders', report.totalOrders) +
      stat('Revenue (simulated)', money(report.totalRevenue)) +
      stat('Items ordered', report.totalOrdered) +
      stat('Items collected', report.totalCollected) +
      stat('Production tasks done', report.completedProductionTasks + ' / ' + report.totalProductionTasks);
  }

  /* ---------- orders table ---------- */

  function filtered() {
    const q = searchEl.value.trim().toLowerCase().replace(/^#/, '');
    const batch = batchEl.value;
    const status = statusEl.value;
    return orders.filter(o =>
      (batch === 'all' || o.batchId === Number(batch)) &&
      (status === 'all' ||
        (status === 'active' ? !['Collected', 'Cancelled'].includes(o.status) : o.status === status)) &&
      (!q || String(o.id) === q || String(o.customerName).toLowerCase().includes(q)));
  }

  function renderOrders() {
    if (!orders.length) {
      ordersEl.innerHTML = '<div class="card empty">No orders yet. Orders appear here when customers order from your batches.</div>';
      return;
    }
    const list = filtered();
    if (!list.length) {
      ordersEl.innerHTML = '<div class="card empty">No orders match these filters.</div>';
      return;
    }
    ordersEl.innerHTML = '<div class="table-wrap"><table>' +
      '<thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Pickup</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>' +
      list.map(rowHtml).join('') +
      '</tbody></table></div>' +
      '<p class="muted small">Showing ' + list.length + ' of ' + orders.length + ' orders.</p>';

    ordersEl.querySelectorAll('[data-advance]').forEach(btn =>
      btn.addEventListener('click', () => advance(Number(btn.dataset.advance), btn)));
    ordersEl.querySelectorAll('[data-verify]').forEach(btn =>
      btn.addEventListener('click', () => verifyPickup(Number(btn.dataset.verify))));
  }

  function rowHtml(o) {
    const items = o.items.map(i => E(i.productName) + ' (' + E(i.variantName) + ') &times; ' + i.quantity +
      (i.notes ? '<span class="muted small">Note: ' + E(i.notes) + '</span>' : '')).join('<br>');
    let action = '<span class="muted small">-</span>';
    if (NEXT[o.status]) action = '<button type="button" class="btn btn-secondary btn-sm" data-advance="' + o.id + '">Mark ' + NEXT[o.status] + '</button>';
    if (o.status === 'Ready') action = '<button type="button" class="btn btn-primary btn-sm" data-verify="' + o.id + '">Verify pickup</button>';
    return '<tr>' +
      '<td>#' + o.id + '<span class="muted small">' + E(UI.formatDate(o.createdAt, true)) + '</span></td>' +
      '<td>' + E(o.customerName) + '</td>' +
      '<td>' + items + '</td>' +
      '<td>' + (o.pickupDate ? E(UI.formatDate(o.pickupDate)) + '<span class="muted small">' + E(timeLabel(o.pickupStartTime)) + ' to ' + E(timeLabel(o.pickupEndTime)) + '</span>' : '-') +
        '<span class="muted small">' + E(o.batchName) + '</span></td>' +
      '<td>' + money(o.totalAmount) + '</td>' +
      '<td class="status-cell"><span class="order-status st-' + E(o.status) + '">' + E(o.status) + '</span></td>' +
      '<td>' + action + '</td>' +
    '</tr>';
  }

  /* ---------- actions ---------- */

  async function advance(orderId, button) {
    const order = orders.find(o => o.id === orderId);
    const next = NEXT[order.status];
    const yes = await UI.confirm({
      title: 'Mark order #' + orderId + ' as ' + next + '?',
      message: next === 'Ready'
        ? 'The customer will be told their order is ready for pickup.'
        : 'Ingredients for this order will be taken from stock. The customer can no longer change or cancel it.',
      confirmText: 'Mark ' + next
    });
    if (!yes) return;
    UI.setBusy(button, true, 'Saving...');                // FR-21
    try {
      await api('/orders/' + orderId + '/status', { method: 'PUT', body: { status: next } });
      UI.toast('Order #' + orderId + ' is now ' + next + '.');
      await load();
    } catch (err) {
      UI.toast(err.message, 'error');
      UI.setBusy(button, false);
    }
  }

  async function verifyPickup(orderId) {
    const result = await UI.modal({
      title: 'Verify pickup for order #' + orderId,
      message: 'Scan or paste the code from the customer\'s My Orders page. Each code works once.',
      bodyHtml: '<div class="field"><label for="v-code">Pickup code</label>' +
        '<input type="text" id="v-code" name="pickupCode" autocomplete="off" spellcheck="false">' +
        '<div class="field-error" data-error-for="pickupCode"></div></div>',
      confirmText: 'Verify and hand over',
      onSubmit: async form => {
        const code = form.pickupCode.value.trim();
        if (!code) return { ok: false, error: 'Enter the pickup code.', field: 'pickupCode' };
        const submit = form.querySelector('[type=submit]');
        UI.setBusy(submit, true, 'Checking...');          // FR-21
        try {
          const res = await api('/pickup/verify', { method: 'POST', body: { pickupCode: code } });
          if (res.orderId !== orderId) {
            UI.toast('That code belonged to order #' + res.orderId + ', which is now collected.');
          }
          return { ok: true, value: res };
        } catch (err) {
          UI.setBusy(submit, false);
          return { ok: false, error: err.message, field: 'pickupCode' };
        }
      }
    });
    if (result) {
      UI.toast('Pickup verified. Order marked Collected.');
      await load();
    }
  }

  /* ---------- filters ---------- */

  searchEl.addEventListener('input', renderOrders);
  batchEl.addEventListener('change', renderOrders);
  statusEl.addEventListener('change', renderOrders);
  document.getElementById('refresh-btn').addEventListener('click', load);

  load();
})();
