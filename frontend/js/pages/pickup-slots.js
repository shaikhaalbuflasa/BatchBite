/*
 * BatchBite - Pickup Slots page (Business Owner)
 * Module: Pickup and Order Management (Marwa)
 * Requirements: FR-12 (owner sets pickup slots with a maximum number of orders),
 *               FR-13 (full slots cannot be chosen), FR-21 (no duplicate submissions)
 *
 * Backend routes used:
 *   GET  /batches            - the owner's batches (pickup date comes from the batch)
 *   GET  /pickupSlots        - all slots; filtered to this owner
 *   POST /pickupSlots        - create a slot { ownerId, batchId, date, startTime, endTime, maxOrders }
 *   GET  /owners/:id/orders  - orders booked into each slot
 */
(async () => {
  const me = await Auth.requireRole(['BusinessOwner']);
  if (!me) return;
  UI.renderHeader(me, 'slots');

  const E = UI.escape;
  const api = (path, options) => Api.request(path, Object.assign({ token: Auth.token() }, options || {}));

  const form = document.getElementById('slot-form');
  const batchSelect = document.getElementById('batchId');
  const dateInput = document.getElementById('date');
  const addBtn = document.getElementById('add-btn');
  const listEl = document.getElementById('slot-list');
  const statsEl = document.getElementById('stats');
  const filterBatch = document.getElementById('filter-batch');

  let batches = [];
  let slots = [];
  let orders = [];
  let availability = 'all';

  /* ---------- helpers ---------- */

  const toMinutes = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const timeLabel = t => {
    const [h, m] = String(t).split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + suffix;
  };
  const batchById = id => batches.find(b => b.id === id);
  const isFull = s => (s.reservedOrders || 0) >= s.maxOrders;
  const activeOrdersIn = slotId => orders.filter(o => o.pickupSlotId === slotId && o.status !== 'Cancelled');

  /* ---------- load ---------- */

  async function load() {
    listEl.innerHTML = '<p class="loading">Loading...</p>';
    try {
      const [allBatches, allSlots, ownerOrders] = await Promise.all([
        api('/batches'),
        api('/pickupSlots'),
        api('/owners/' + me.id + '/orders')
      ]);
      batches = allBatches.filter(b => b.ownerId === me.id)
        .sort((a, b) => String(a.pickupDate).localeCompare(String(b.pickupDate)));
      slots = allSlots.filter(s => s.ownerId === me.id);
      orders = ownerOrders;
      renderForm();
      renderStats();
      renderList();
    } catch (err) {
      listEl.innerHTML = '<p class="form-error">' + E(err.message) + '</p>';
    }
  }

  /* ---------- form ---------- */

  function renderForm() {
    const previous = batchSelect.value;
    if (!batches.length) {
      batchSelect.innerHTML = '<option value="">No batches yet</option>';
      batchSelect.disabled = true;
      addBtn.disabled = true;
      dateInput.value = '';
      form.querySelector('.form-error').textContent = 'Create a batch in Products & Batches first, then add its pickup slots here.';
      form.querySelector('.form-error').hidden = false;
    } else {
      batchSelect.disabled = false;
      addBtn.disabled = false;
      batchSelect.innerHTML = batches.map(b =>
        '<option value="' + b.id + '">' + E(b.name) + ' (pickup ' + E(UI.formatDate(b.pickupDate)) + ')' +
        (b.status !== 'Open' ? ' - closed' : '') + '</option>').join('');
      if (previous && batchById(Number(previous))) batchSelect.value = previous;
      syncDate();
    }

    filterBatch.innerHTML = '<option value="all">All batches</option>' +
      batches.map(b => '<option value="' + b.id + '">' + E(b.name) + '</option>').join('');
  }

  function syncDate() {
    const b = batchById(Number(batchSelect.value));
    dateInput.value = b ? String(b.pickupDate).slice(0, 10) : '';
  }
  batchSelect.addEventListener('change', syncDate);

  function validate(data) {
    if (!data.batchId) return { ok: false, error: 'Choose a batch.', field: 'batchId' };
    if (!/^\d{2}:\d{2}$/.test(data.startTime)) return { ok: false, error: 'Enter a start time.', field: 'startTime' };
    if (!/^\d{2}:\d{2}$/.test(data.endTime)) return { ok: false, error: 'Enter an end time.', field: 'endTime' };
    if (toMinutes(data.endTime) <= toMinutes(data.startTime)) return { ok: false, error: 'The end time must be after the start time.', field: 'endTime' };
    if (!Number.isInteger(data.maxOrders) || data.maxOrders < 1) return { ok: false, error: 'Enter 1 or more.', field: 'maxOrders' };
    if (data.maxOrders > 500) return { ok: false, error: 'Enter 500 or fewer.', field: 'maxOrders' };

    const sameBatch = slots.filter(s => s.batchId === data.batchId);
    if (sameBatch.some(s => s.startTime === data.startTime && s.endTime === data.endTime)) {
      return { ok: false, error: 'This batch already has a slot at this time.', field: 'startTime' };
    }
    const overlap = sameBatch.find(s =>
      toMinutes(data.startTime) < toMinutes(s.endTime) && toMinutes(s.startTime) < toMinutes(data.endTime));
    if (overlap) {
      return { ok: false, error: 'This overlaps the ' + timeLabel(overlap.startTime) + ' to ' + timeLabel(overlap.endTime) + ' slot.', field: 'startTime' };
    }
    return { ok: true };
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    UI.clearErrors(form);
    const raw = UI.formData(form);
    const batch = batchById(Number(raw.batchId));
    const data = {
      ownerId: me.id,
      batchId: batch ? batch.id : null,
      date: batch ? String(batch.pickupDate).slice(0, 10) : '',
      startTime: raw.startTime,
      endTime: raw.endTime,
      maxOrders: Number(raw.maxOrders)
    };

    const check = validate(data);
    if (!check.ok) return UI.showResultError(form, check);

    UI.setBusy(addBtn, true, 'Adding...');            // FR-21: one request per click
    try {
      await api('/pickupSlots', { method: 'POST', body: data });
      UI.toast('Pickup slot ' + timeLabel(data.startTime) + ' to ' + timeLabel(data.endTime) + ' added.');
      // Suggest the next slot straight after this one
      const length = toMinutes(data.endTime) - toMinutes(data.startTime);
      const next = toMinutes(data.endTime);
      const fmt = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
      if (next + length < 24 * 60) {
        form.startTime.value = fmt(next);
        form.endTime.value = fmt(next + length);
      }
      await load();
    } catch (err) {
      UI.showResultError(form, { ok: false, error: err.message });
    } finally {
      UI.setBusy(addBtn, false);
    }
  });

  /* ---------- summary ---------- */

  function renderStats() {
    const capacity = slots.reduce((sum, s) => sum + s.maxOrders, 0);
    const booked = slots.reduce((sum, s) => sum + (s.reservedOrders || 0), 0);
    const full = slots.filter(isFull).length;
    statsEl.innerHTML = [
      ['Pickup slots', slots.length],
      ['Orders booked', booked],
      ['Spaces left', Math.max(0, capacity - booked)],
      ['Full slots', full]
    ].map(([label, value]) => '<div class="stat"><div class="value">' + value + '</div><div class="label">' + label + '</div></div>').join('');
  }

  /* ---------- list ---------- */

  function renderList() {
    const batchFilter = filterBatch.value || 'all';
    let shown = slots.slice();
    if (batchFilter !== 'all') shown = shown.filter(s => s.batchId === Number(batchFilter));
    if (availability === 'open') shown = shown.filter(s => !isFull(s));
    if (availability === 'full') shown = shown.filter(isFull);

    if (!slots.length) {
      listEl.innerHTML = '<div class="card empty">No pickup slots yet. Add your first one with the form.</div>';
      return;
    }
    if (!shown.length) {
      listEl.innerHTML = '<div class="card empty">No slots match these filters.</div>';
      return;
    }

    const groups = batches.filter(b => shown.some(s => s.batchId === b.id));
    listEl.innerHTML = groups.map(b => {
      const own = shown.filter(s => s.batchId === b.id).sort((x, y) => toMinutes(x.startTime) - toMinutes(y.startTime));
      return '<div class="card batch-group">' +
        '<h3>' + E(b.name) + '</h3>' +
        '<p class="muted small">Pickup on ' + E(UI.formatDate(b.pickupDate)) + ' &middot; batch ' + E(b.status) + '</p>' +
        '<div class="slot-list">' + own.map(slotHtml).join('') + '</div>' +
      '</div>';
    }).join('');

    listEl.querySelectorAll('[data-orders]').forEach(btn =>
      btn.addEventListener('click', () => showOrders(Number(btn.dataset.orders))));
  }

  function slotHtml(s) {
    const booked = s.reservedOrders || 0;
    const pct = Math.min(100, Math.round(booked / s.maxOrders * 100));
    const meterClass = pct >= 100 ? 'full' : pct >= 75 ? 'warn' : '';
    const count = activeOrdersIn(s.id).length;
    return '<div class="slot">' +
      '<div class="time">' + E(timeLabel(s.startTime)) + ' to ' + E(timeLabel(s.endTime)) + '</div>' +
      '<div class="meter ' + meterClass + '" role="img" aria-label="' + booked + ' of ' + s.maxOrders + ' booked"><span style="width:' + pct + '%"></span></div>' +
      '<div class="small">' + booked + ' / ' + s.maxOrders + ' booked ' +
        (isFull(s) ? '<span class="order-status st-Cancelled">Full</span>' : '<span class="muted">(' + (s.maxOrders - booked) + ' left)</span>') +
      '</div>' +
      (count ? '<button type="button" class="link-btn small" data-orders="' + s.id + '">View ' + count + ' order' + (count > 1 ? 's' : '') + '</button>' : '') +
    '</div>';
  }

  function showOrders(slotId) {
    const s = slots.find(x => x.id === slotId);
    const list = activeOrdersIn(slotId);
    UI.modal({
      title: 'Orders for ' + timeLabel(s.startTime) + ' to ' + timeLabel(s.endTime),
      bodyHtml: '<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Status</th></tr></thead><tbody>' +
        list.map(o => '<tr><td>#' + o.id + '</td><td>' + E(o.customerName) + '</td><td><span class="order-status st-' + E(o.status) + '">' + E(o.status) + '</span></td></tr>').join('') +
        '</tbody></table></div>',
      confirmText: 'Close',
      cancelText: 'Back'
    });
  }

  /* ---------- filters ---------- */

  filterBatch.addEventListener('change', renderList);
  document.querySelectorAll('[data-filter]').forEach(chip => chip.addEventListener('click', () => {
    availability = chip.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
    renderList();
  }));
  document.getElementById('refresh-btn').addEventListener('click', load);

  load();
})();
