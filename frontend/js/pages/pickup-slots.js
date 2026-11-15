/* TEMPORARY owner page to create pickup slots (FR-12). Marwa's final version replaces this file. */
(async () => {
  const me = await Auth.requireRole(['BusinessOwner']);
  if (!me) return;
  UI.renderHeader(me, 'slots');
  const E = UI.escape, api = (p, o) => Api.request(p, Object.assign({ token: Auth.token() }, o || {}));
  const arr = (r, k) => Array.isArray(r) ? r : (r[k] || []);
  const root = document.getElementById('root');
  let bats = [], slots = [];
  async function load() {
    try {
      const [b, s] = await Promise.all([api('/batches'), api('/pickupSlots')]);
      bats = arr(b, 'batches').filter(x => x.ownerId == me.id); slots = arr(s, 'pickupSlots').filter(x => x.ownerId == me.id); draw();
    } catch (err) { root.innerHTML = '<p class="form-error">' + E(err.message) + '</p>'; }
  }
  function draw() {
    root.innerHTML = '<div class="card"><h2>Add a pickup slot</h2>' + (bats.length ?
      '<div class="field"><label>Batch</label><select id="sb">' + bats.map(b => '<option value="' + b.id + '">' + E(b.name) + ' (pickup ' + E(String(b.pickupDate).slice(0, 10)) + ')</option>').join('') + '</select></div>' +
      '<div class="field"><label>Start time (for example 12:00)</label><input type="text" id="st" placeholder="12:00"></div>' +
      '<div class="field"><label>End time (for example 12:30)</label><input type="text" id="en" placeholder="12:30"></div>' +
      '<div class="field"><label>Maximum orders in this slot</label><input type="number" id="mx" min="1" value="5"></div>' +
      '<div class="form-error" id="err" hidden></div><button class="btn btn-primary" id="add">Add slot</button>'
      : '<p class="muted">Create a batch first, then add its pickup slots here.</p>') + '</div>' +
      '<h2 style="margin-top:1.5rem">My slots</h2>' + (slots.length ? '<div class="shop-grid">' + slots.map(s => {
        const b = bats.find(x => x.id == s.batchId);
        return '<div class="card"><h3>' + E(s.startTime) + ' to ' + E(s.endTime) + '</h3><p class="muted small">' + E(b ? b.name : 'Batch #' + s.batchId) + ' &middot; ' + E(s.date) + '</p><p>' + (s.reservedOrders || 0) + ' / ' + s.maxOrders + ' booked</p></div>';
      }).join('') + '</div>' : '<div class="card empty">No slots yet.</div>');
    const add = document.getElementById('add');
    if (add) add.onclick = async () => {
      const b = bats.find(x => x.id == document.getElementById('sb').value), st = document.getElementById('st').value.trim(), en = document.getElementById('en').value.trim(), mx = parseInt(document.getElementById('mx').value), err = document.getElementById('err');
      const bad = !/^\d{2}:\d{2}$/.test(st) || !/^\d{2}:\d{2}$/.test(en) ? 'Type times as HH:MM, for example 12:00.' : st >= en ? 'The end time must be after the start time.' : !(mx > 0) ? 'Enter a maximum of 1 or more.' : '';
      if (bad) { err.textContent = bad; err.hidden = false; return; }
      err.hidden = true; UI.setBusy(add, true, 'Adding...');
      try { await api('/pickupSlots', { method: 'POST', body: { ownerId: me.id, batchId: b.id, date: String(b.pickupDate).slice(0, 10), startTime: st, endTime: en, maxOrders: mx } }); UI.toast('Slot added.'); await load(); }
      catch (e) { err.textContent = e.message; err.hidden = false; UI.setBusy(add, false); }
    };
  }
  load();
})();
