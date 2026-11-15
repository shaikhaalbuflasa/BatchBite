/* Business Owner: products (FR-4) and production batches (FR-5, FR-6) */
(async () => {
  const me = await Auth.requireRole(['BusinessOwner']);
  if (!me) return;
  UI.renderHeader(me, 'products');
  const E = UI.escape, api = (p, o) => Api.request(p, Object.assign({ token: Auth.token() }, o || {}));
  const list = r => Array.isArray(r) ? r : (r.products || r.batches || []);
  const root = document.getElementById('root');
  let prods = [], bats = [];

  async function load() {
    try {
      const [p, b] = await Promise.all([api('/products'), api('/batches')]);
      prods = list(p).filter(x => x.ownerId == me.id);
      bats = list(b).filter(x => x.ownerId == me.id);
      draw();
    } catch (err) { root.innerHTML = '<p class="form-error">' + E(err.message) + '</p>'; }
  }
  const vname = (pid, vid) => { const p = prods.find(x => x.id == pid), v = p && (p.variants || []).find(x => x.id == vid); return p ? p.name + (v ? ' (' + v.name + ')' : '') : 'Product #' + pid; };
  const isOpen = b => b.status === 'Open' && new Date(b.orderDeadline) > new Date();

  function draw() {
    root.innerHTML = '<h2>My products</h2>' + (prods.length ? '<div class="shop-grid">' + prods.map(p =>
      '<div class="card"><h3>' + E(p.name) + ' <span class="pill ' + (p.isAvailable === false ? 'off' : '') + '">' + (p.isAvailable === false ? 'Hidden' : 'Available') + '</span></h3>' +
      '<p class="muted small">' + E(p.description || 'No description yet.') + '</p>' +
      (p.variants || []).map(v => '<div class="line"><span>' + E(v.name) + '</span><span>BD ' + Number(v.price).toFixed(2) + ' &middot; ' + E(v.quantity) + ' in stock</span></div>').join('') +
      '<div class="row-gap" style="margin-top:.8rem"><button class="btn btn-secondary btn-sm" data-edit="' + p.id + '">Edit</button><button class="btn btn-secondary btn-sm" data-toggle="' + p.id + '">' + (p.isAvailable === false ? 'Show in catalogue' : 'Hide') + '</button><button class="btn btn-danger-ghost btn-sm" data-del="' + p.id + '">Delete</button></div></div>').join('') + '</div>'
      : '<div class="card empty">No products yet. Add your first product to get started.</div>') +
      '<div class="page-head" style="margin-top:2rem"><h2>My batches</h2><button class="btn btn-primary" id="new-batch">Create batch</button></div>' +
      (bats.length ? '<div class="shop-grid">' + bats.map(b =>
        '<div class="card"><h3>' + E(b.name) + ' <span class="pill ' + (isOpen(b) ? '' : 'off') + '">' + (isOpen(b) ? 'Open' : 'Closed') + '</span></h3>' +
        '<p class="muted small">Order by ' + UI.formatDate(b.orderDeadline, true) + '<br>Pickup on ' + UI.formatDate(b.pickupDate) + '</p>' +
        (b.products || []).map(i => '<div class="line"><span>' + E(vname(i.productId, i.variantId)) + '</span><span>' + (i.orderedQuantity || 0) + ' / ' + i.maxQuantity + ' ordered</span></div>').join('') + '</div>').join('') + '</div>'
        : '<div class="card empty">No batches yet. Create a batch so customers can order.</div>');
    root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => productForm(prods.find(p => p.id == b.dataset.edit)));
    root.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => toggle(prods.find(p => p.id == b.dataset.toggle)));
    root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => del(prods.find(p => p.id == b.dataset.del)));
    document.getElementById('new-batch').onclick = batchForm;
  }

  const parseVariants = (text, old) => text.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
    const [name, price, qty] = l.split(',').map(s => s.trim());
    return { id: i + 1, name, price: Number(price), quantity: Number(qty) };
  });
  async function productForm(p) {
    const v = p ? (p.variants || []).map(x => [x.name, x.price, x.quantity].join(', ')).join('\n') : '';
    await UI.modal({
      title: p ? 'Edit product' : 'Add product', confirmText: 'Save product',
      bodyHtml: '<div class="field"><label>Name</label><input type="text" name="name" value="' + E(p ? p.name : '') + '"><div class="field-error" data-error-for="name"></div></div>' +
        '<div class="field"><label>Description and ingredients</label><textarea name="description" rows="3">' + E(p ? p.description : '') + '</textarea></div>' +
        '<div class="field"><label>Picture link (optional)</label><input type="text" name="image" value="' + E(p ? p.image : '') + '"></div>' +
        '<div class="field"><label>Variants, one per line: name, price, quantity</label><textarea name="variants" rows="3" placeholder="Box of 6, 4.5, 20">' + E(v) + '</textarea><div class="field-error" data-error-for="variants"></div></div>',
      onSubmit: async form => {
        const f = UI.formData(form), vars = parseVariants(f.variants || '');
        if (!f.name.trim()) return { ok: false, field: 'name', error: 'Enter a product name.' };
        if (!vars.length || vars.some(x => !x.name || !(x.price > 0) || !(x.quantity >= 0) || isNaN(x.quantity))) return { ok: false, field: 'variants', error: 'Use "name, price, quantity" on each line, with a price above 0.' };
        const body = { name: f.name.trim(), description: f.description.trim(), image: f.image.trim(), variants: vars, isAvailable: p ? p.isAvailable !== false : true };
        try {
          if (p) await api('/products/' + p.id, { method: 'PUT', body });
          else { const r = await api('/products', { method: 'POST', body: Object.assign({ ownerId: me.id }, body) }); const np = r.product || r; if (np && np.id) await api('/products/' + np.id, { method: 'PUT', body }); }
          return { ok: true };
        } catch (err) { return { ok: false, error: err.message }; }
      }
    }).then(ok => { if (ok) { UI.toast('Product saved.'); load(); } });
  }
  async function toggle(p) {
    try { await api('/products/' + p.id, { method: 'PUT', body: { name: p.name, description: p.description, image: p.image, variants: p.variants, isAvailable: p.isAvailable === false } }); load(); }
    catch (err) { UI.toast(err.message, 'error'); }
  }
  async function del(p) {
    if (!await UI.confirm({ title: 'Delete ' + p.name + '?', message: 'Customers will no longer see it.', confirmText: 'Delete', danger: true })) return;
    try { await api('/products/' + p.id, { method: 'DELETE' }); UI.toast('Product deleted.'); load(); } catch (err) { UI.toast(err.message, 'error'); }
  }
  async function batchForm() {
    const vs = prods.filter(p => p.isAvailable !== false).flatMap(p => (p.variants || []).map(v => ({ pid: p.id, vid: v.id, label: p.name + ' (' + v.name + ')' })));
    if (!vs.length) return UI.toast('Add an available product first.', 'error');
    await UI.modal({
      title: 'Create batch', confirmText: 'Create batch',
      bodyHtml: '<div class="field"><label>Batch name</label><input type="text" name="name"><div class="field-error" data-error-for="name"></div></div>' +
        '<div class="field"><label>Order deadline</label><input type="datetime-local" name="deadline"><div class="field-error" data-error-for="deadline"></div></div>' +
        '<div class="field"><label>Pickup date</label><input type="date" name="pickup"><div class="field-error" data-error-for="pickup"></div></div>' +
        '<div class="field"><label>Maximum quantity (leave empty to leave a product out)</label>' + vs.map((v, i) => '<div class="line"><span>' + E(v.label) + '</span><input type="number" min="1" name="max' + i + '"></div>').join('') + '</div>',
      onSubmit: async form => {
        const f = UI.formData(form), items = vs.map((v, i) => ({ productId: v.pid, variantId: v.vid, maxQuantity: parseInt(f['max' + i]) })).filter(i => i.maxQuantity > 0);
        if (!f.name.trim()) return { ok: false, field: 'name', error: 'Enter a batch name.' };
        if (!f.deadline) return { ok: false, field: 'deadline', error: 'Choose an order deadline.' };
        if (!f.pickup) return { ok: false, field: 'pickup', error: 'Choose a pickup date.' };
        if (new Date(f.deadline) <= new Date()) return { ok: false, field: 'deadline', error: 'The deadline must be in the future.' };
        if (!items.length) return { ok: false, error: 'Set a maximum quantity for at least one product.' };
        try { await api('/batches', { method: 'POST', body: { ownerId: me.id, name: f.name.trim(), orderDeadline: new Date(f.deadline).toISOString(), pickupDate: f.pickup, products: items } }); return { ok: true }; }
        catch (err) { return { ok: false, error: err.message }; }
      }
    }).then(ok => { if (ok) { UI.toast('Batch created.'); load(); } });
  }
  document.getElementById('new-product').onclick = () => productForm(null);
  load();
})();
