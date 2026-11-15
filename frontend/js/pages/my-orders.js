/*
 * BatchBite - My Orders page (Customer)
 * Module: Pickup and Order Management (Marwa)
 * Requirements: FR-14 (order status tracking), FR-16 (order history),
 *               FR-11 (cancelling releases stock and pickup capacity),
 *               FR-22 (change quantity before the cutoff), FR-25 (pickup QR code),
 *               FR-21 (no duplicate submissions)
 *
 * Backend routes used:
 *   GET /customers/:id/orders   - this customer's orders, newest first
 *   GET /batches, /pickupSlots  - batch name, deadline and pickup time for each order
 *   PUT /orders/:id/cancel      - cancel a Confirmed order
 *   PUT /orders/:id/modify      - change the quantity of a Confirmed single-item order { quantity }
 *
 * Status rules come from the backend; this page only shows the buttons the backend allows.
 */
(async () => {
  const me = await Auth.requireRole(['Customer']);
  if (!me) return;
  UI.renderHeader(me, 'myorders');

  const E = UI.escape;
  const api = (path, options) => Api.request(path, Object.assign({ token: Auth.token() }, options || {}));
  const money = n => 'BD ' + Number(n || 0).toFixed(2);
  const STEPS = ['Confirmed', 'Preparing', 'Ready', 'Collected'];

  const listEl = document.getElementById('orders');
  const statsEl = document.getElementById('stats');

  let orders = [];
  let batches = [];
  let slots = [];
  let filter = 'active';

  /* ---------- helpers ---------- */

  const batchOf = o => batches.find(b => b.id === o.batchId);
  const slotOf = o => slots.find(s => s.id === o.pickupSlotId);
  const isActive = o => o.status !== 'Collected' && o.status !== 'Cancelled';
  const timeLabel = t => {
    if (!t) return '';
    const [h, m] = String(t).split(':').map(Number);
    return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + (h >= 12 ? ' PM' : ' AM');
  };
  const beforeCutoff = o => {
    const b = batchOf(o);
    return !!b && b.status === 'Open' && new Date(b.orderDeadline) > new Date();
  };
  const canCancel = o => o.status === 'Confirmed';
  const canModify = o => o.status === 'Confirmed' && o.items.length === 1 && beforeCutoff(o);

  /* ---------- load ---------- */

  async function load() {
    try {
      const [myOrders, allBatches, allSlots] = await Promise.all([
        api('/customers/' + me.id + '/orders'),
        api('/batches'),
        api('/pickupSlots')
      ]);
      orders = myOrders;
      batches = allBatches;
      slots = allSlots;
      renderStats();
      render();
    } catch (err) {
      listEl.innerHTML = '<p class="form-error">' + E(err.message) + '</p>';
    }
  }

  function renderStats() {
    const count = s => orders.filter(o => o.status === s).length;
    statsEl.innerHTML = [
      ['Active orders', orders.filter(isActive).length],
      ['Ready for pickup', count('Ready')],
      ['Collected', count('Collected')],
      ['Cancelled', count('Cancelled')]
    ].map(([label, value]) => '<div class="stat"><div class="value">' + value + '</div><div class="label">' + label + '</div></div>').join('');
  }

  /* ---------- render ---------- */

  function render() {
    let shown = orders;
    if (filter === 'active') shown = orders.filter(isActive);
    if (filter === 'past') shown = orders.filter(o => !isActive(o));

    if (!orders.length) {
      listEl.innerHTML = '<div class="card empty">You have no orders yet. <a href="catalogue.html">Browse open batches</a> to place your first one.</div>';
      return;
    }
    if (!shown.length) {
      listEl.innerHTML = '<div class="card empty">No orders here.</div>';
      return;
    }
    listEl.innerHTML = shown.map(orderHtml).join('');

    listEl.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === Number(btn.dataset.id));
      if (btn.dataset.action === 'cancel') cancelOrder(order, btn);
      if (btn.dataset.action === 'modify') modifyOrder(order, btn);
      if (btn.dataset.action === 'qr') showQr(order);
    }));
  }

  function trackerHtml(o) {
    if (o.status === 'Cancelled') {
      const when = (o.statusHistory || []).find(h => h.status === 'Cancelled');
      return '<p class="small muted">Cancelled' + (when ? ' on ' + E(UI.formatDate(when.timestamp, true)) : '') +
        '. Your batch place and pickup slot were released and the payment refunded (simulated).</p>';
    }
    const current = STEPS.indexOf(o.status);
    return '<ol class="tracker" aria-label="Order progress">' + STEPS.map((step, i) => {
      const when = (o.statusHistory || []).find(h => h.status === step);
      const cls = i < current ? 'done' : i === current ? 'done current' : '';
      return '<li class="' + cls + '"' + (i === current ? ' aria-current="step"' : '') + '>' + step +
        (when ? '<time>' + E(UI.formatDate(when.timestamp, true)) + '</time>' : '') + '</li>';
    }).join('') + '</ol>';
  }

  function orderHtml(o) {
    const b = batchOf(o);
    const s = slotOf(o);
    const items = o.items.map(i =>
      '<div class="line"><span>' + E(i.productName) + ' <span class="muted">(' + E(i.variantName) + ')</span> &times; ' + i.quantity +
      (i.notes ? '<br><span class="muted small">Note: ' + E(i.notes) + '</span>' : '') +
      '</span><span>' + money(i.subtotal) + '</span></div>').join('');

    const actions = [];
    if (o.status !== 'Cancelled' && o.status !== 'Collected') {
      actions.push('<button type="button" class="btn btn-primary" data-action="qr" data-id="' + o.id + '">Show pickup code</button>');
    }
    if (canModify(o)) actions.push('<button type="button" class="btn btn-secondary" data-action="modify" data-id="' + o.id + '">Change quantity</button>');
    if (canCancel(o)) actions.push('<button type="button" class="btn btn-danger" data-action="cancel" data-id="' + o.id + '">Cancel order</button>');

    let note = '';
    if (o.status === 'Confirmed' && o.items.length > 1) note = 'Orders with more than one item can be cancelled but not changed.';
    else if (o.status === 'Confirmed' && !beforeCutoff(o)) note = 'The order deadline has passed, so the quantity can no longer be changed.';
    else if (o.status === 'Preparing') note = 'The kitchen has started your order, so it can no longer be changed or cancelled.';
    else if (o.status === 'Ready') note = 'Your order is ready. Show your pickup code at the counter.';

    return '<article class="card order-card">' +
      '<div class="order-top">' +
        '<div><h3>Order #' + o.id + '</h3><p class="muted small">Placed ' + E(UI.formatDate(o.createdAt, true)) + (b ? ' &middot; ' + E(b.name) : '') + '</p></div>' +
        '<span class="order-status st-' + E(o.status) + '">' + E(o.status) + '</span>' +
      '</div>' +
      trackerHtml(o) +
      '<div class="order-items">' + items +
        '<div class="line"><strong>Total</strong><strong>' + money(o.totalAmount) + '</strong></div></div>' +
      '<div class="order-meta">' +
        '<div><span>Pickup</span>' + (s ? E(UI.formatDate(s.date)) + ', ' + E(timeLabel(s.startTime)) + ' to ' + E(timeLabel(s.endTime)) : 'Slot #' + o.pickupSlotId) + '</div>' +
        '<div><span>Payment</span>' + (o.status === 'Cancelled' ? 'Refunded (simulated)' : E(o.paymentStatus || 'Paid (Simulated)')) + '</div>' +
        (b && o.status === 'Confirmed' ? '<div><span>Change by</span>' + E(UI.formatDate(b.orderDeadline, true)) + '</div>' : '') +
      '</div>' +
      (note ? '<p class="small muted">' + note + '</p>' : '') +
      (actions.length ? '<div class="order-actions">' + actions.join('') + '</div>' : '') +
    '</article>';
  }

  /* ---------- actions ---------- */

  async function cancelOrder(order, button) {
    const yes = await UI.confirm({
      title: 'Cancel order #' + order.id + '?',
      message: 'Your pickup slot and batch place will be released and ' + money(order.totalAmount) + ' refunded (simulated). This cannot be undone.',
      confirmText: 'Cancel order',
      cancelText: 'Keep order',
      danger: true
    });
    if (!yes) return;
    UI.setBusy(button, true, 'Cancelling...');           // FR-21
    try {
      await api('/orders/' + order.id + '/cancel', { method: 'PUT' });
      UI.toast('Order #' + order.id + ' cancelled. ' + money(order.totalAmount) + ' refunded (simulated).');
      await load();
    } catch (err) {
      UI.toast(err.message, 'error');
      UI.setBusy(button, false);
    }
  }

  async function modifyOrder(order, button) {
    const item = order.items[0];
    let newQuantity = item.quantity;
    const result = await UI.modal({
      title: 'Change quantity for order #' + order.id,
      message: item.productName + ' (' + item.variantName + '), ' + money(item.unitPrice) + ' each.',
      bodyHtml:
        '<div class="field"><label for="m-qty">Quantity</label>' +
        '<input type="number" id="m-qty" name="quantity" min="1" max="99" value="' + item.quantity + '">' +
        '<div class="field-error" data-error-for="quantity"></div></div>' +
        '<p class="small muted" id="m-diff">New total: ' + money(order.totalAmount) + '</p>',
      confirmText: 'Save change',
      onSubmit: async form => {
        newQuantity = Number(form.quantity.value);
        if (!Number.isInteger(newQuantity) || newQuantity < 1) return { ok: false, error: 'Enter a whole number of 1 or more.', field: 'quantity' };
        if (newQuantity === item.quantity) return { ok: false, error: 'This is the current quantity.', field: 'quantity' };
        const submit = form.querySelector('[type=submit]');
        UI.setBusy(submit, true, 'Saving...');          // FR-21
        try {
          await api('/orders/' + order.id + '/modify', { method: 'PUT', body: { quantity: newQuantity } });
          return { ok: true };
        } catch (err) {
          UI.setBusy(submit, false);
          return { ok: false, error: err.message };
        }
      }
    });

    if (result) {
      const diff = Math.round((newQuantity - item.quantity) * item.unitPrice * 100) / 100;
      UI.toast('Order #' + order.id + ' updated. ' + (diff < 0
        ? money(-diff) + ' refunded (simulated).'
        : money(diff) + ' charged (simulated).'));
      await load();
    }
  }

  // Update the "New total" line inside the change-quantity window as the customer types
  document.addEventListener('input', event => {
    if (event.target.id !== 'm-qty') return;
    const order = orders.find(o => document.getElementById('modal-title').textContent.endsWith('#' + o.id));
    const out = document.getElementById('m-diff');
    if (!order || !out) return;
    const q = Number(event.target.value);
    if (!Number.isInteger(q) || q < 1) { out.textContent = 'Enter a whole number of 1 or more.'; return; }
    const unit = order.items[0].unitPrice;
    const diff = (q - order.items[0].quantity) * unit;
    out.textContent = 'New total: ' + money(q * unit) +
      (diff < 0 ? ' (refund ' + money(-diff) + ', simulated)' : diff > 0 ? ' (extra ' + money(diff) + ', simulated)' : '');
  });

  function qrImage(text) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createDataURL(8, 2);
  }

  function showQr(order) {
    const s = slotOf(order);
    UI.modal({
      title: 'Pickup code for order #' + order.id,
      message: order.status === 'Ready'
        ? 'Your order is ready. Show this code at the counter. It can be used only once.'
        : 'Show this code when you collect your order. Staff can scan it once the order is Ready.',
      bodyHtml: '<div class="qr-box">' +
        '<img alt="QR pickup code for order ' + order.id + '" src="' + qrImage(order.pickupCode) + '">' +
        (s ? '<p class="small">' + E(UI.formatDate(s.date)) + ', ' + E(timeLabel(s.startTime)) + ' to ' + E(timeLabel(s.endTime)) + '</p>' : '') +
        '<code id="qr-text">' + E(order.pickupCode) + '</code>' +
        '<button type="button" class="link-btn small copy-btn" id="copy-code">Copy code</button>' +
      '</div>',
      confirmText: 'Done',
      cancelText: 'Close'
    });
    const copy = document.getElementById('copy-code');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(order.pickupCode); UI.toast('Pickup code copied.'); }
      catch (err) { UI.toast('Select the code and copy it.', 'error'); }
    });
  }

  /* ---------- filters ---------- */

  document.querySelectorAll('[data-filter]').forEach(chip => chip.addEventListener('click', () => {
    filter = chip.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
    render();
  }));
  document.getElementById('refresh-btn').addEventListener('click', load);

  load();
})();
