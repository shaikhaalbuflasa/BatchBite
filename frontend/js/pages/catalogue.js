/* Customer: browse open batches, cart, order summary, pickup slot, simulated payment (FR-7 to FR-11, FR-13, FR-21) */
(async () => {
  const me = await Auth.requireRole(['Customer']);
  if (!me) return;
  UI.renderHeader(me, 'browse');
  const E = UI.escape, api = (p, o) => Api.request(p, Object.assign({ token: Auth.token() }, o || {}));
  const arr = (r, k) => Array.isArray(r) ? r : (r[k] || []);
  const root = document.getElementById('root'), money = n => 'BD ' + Number(n).toFixed(2);
  const CK = 'batchbite.cart.' + me.id;
  const getCart = () => { try { return JSON.parse(sessionStorage.getItem(CK)) || null; } catch (e) { return null; } };
  const setCart = c => { try { c && c.items.length ? sessionStorage.setItem(CK, JSON.stringify(c)) : sessionStorage.removeItem(CK); } catch (e) {} };
  let prods = [], bats = [], slots = [], placing = false;

  async function load() {
    try {
      const [p, b, s] = await Promise.all([api('/products'), api('/batches'), api('/pickupSlots')]);
      prods = arr(p, 'products'); bats = arr(b, 'batches'); slots = arr(s, 'pickupSlots'); draw();
    } catch (err) { root.innerHTML = '<p class="form-error">' + E(err.message) + '</p>'; }
  }
  const open = b => b.status === 'Open' && new Date(b.orderDeadline) > new Date();
  const find = (pid, vid) => { const p = prods.find(x => x.id == pid); return { p, v: p && (p.variants || []).find(x => x.id == vid) }; };

  function draw() {
    const cart = getCart(), ob = bats.filter(open);
    root.innerHTML = '<div class="layout-2"><div>' + (ob.length ? ob.map(b =>
      '<div class="card"><h2>' + E(b.name) + '</h2><p class="card-sub">Order by ' + UI.formatDate(b.orderDeadline, true) + ' &middot; Pickup on ' + UI.formatDate(b.pickupDate) + '</p>' +
      (b.products || []).map(i => {
        const { p, v } = find(i.productId, i.variantId); if (!p || !v || p.isAvailable === false) return '';
        const left = i.maxQuantity - (i.orderedQuantity || 0);
        return '<div class="line"><span class="line-product">' + ProductPhoto.img(p.image, p.name, 'line-photo') + '<span><strong>' + E(p.name) + '</strong> (' + E(v.name) + ')<br><span class="muted small">' + E(p.description || '') + '</span></span></span><span class="row-gap" style="align-items:center"><span>' + money(v.price) + '<br><span class="muted small">' + (left > 0 ? left + ' left' : 'Sold out') + '</span></span>' +
          (left > 0 ? '<input type="number" min="1" max="' + left + '" value="1" id="q-' + b.id + '-' + i.productId + '-' + i.variantId + '"><button class="btn btn-primary btn-sm" data-add="' + b.id + '|' + i.productId + '|' + i.variantId + '|' + left + '">Add</button>' : '') + '</span></div>';
      }).join('') + '</div>').join('') : '<div class="card empty">No batches are open right now. Please check back soon.</div>') +
      '</div><div class="cart-bar">' + cartHtml(cart) + '</div></div>';
    root.querySelectorAll('[data-add]').forEach(b => b.onclick = () => add(b.dataset.add.split('|')));
    bindCart(cart);
  }
  function cartHtml(cart) {
    if (!cart || !cart.items.length) return '<div class="card"><h2>Your cart</h2><p class="muted">Your cart is empty. Add an item from an open batch.</p></div>';
    const b = bats.find(x => x.id == cart.batchId), total = cart.items.reduce((a, i) => { const { v } = find(i.productId, i.variantId); return a + (v ? v.price * i.quantity : 0); }, 0);
    const sl = slots.filter(s => s.batchId == cart.batchId);
    return '<div class="card"><h2>Your cart</h2><p class="card-sub">' + E(b ? b.name : 'Batch') + '</p>' + cart.items.map((i, n) => {
      const { p, v } = find(i.productId, i.variantId);
      return '<div class="line"><span>' + E(p ? p.name : '?') + ' (' + E(v ? v.name : '?') + ')</span><span class="row-gap" style="align-items:center"><input type="number" min="1" value="' + i.quantity + '" data-qty="' + n + '"><button class="btn btn-danger-ghost btn-sm" data-rm="' + n + '">Remove</button></span></div>';
    }).join('') +
      '<div class="field" style="margin-top:1rem"><label>Pickup slot</label><select id="slot"><option value="">Choose a pickup slot</option>' + sl.map(s => { const full = s.isAvailable === false || s.reservedOrders >= s.maxOrders; return '<option value="' + s.id + '"' + (full ? ' disabled' : '') + '>' + E(s.startTime) + ' to ' + E(s.endTime) + (full ? ' (full)' : ' (' + (s.maxOrders - s.reservedOrders) + ' spots left)') + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Card number (simulated, no real payment)</label><input type="text" id="card" inputmode="numeric" placeholder="1234 5678 9012 3456" autocomplete="off"><div class="field-error" id="card-err"></div></div>' +
      '<div class="line"><strong>Estimated total</strong><strong>' + money(total) + '</strong></div><p class="muted small">The final price is confirmed by the server when you place the order.</p>' +
      '<button class="btn btn-primary btn-block" id="place">Pay and place order</button> <button class="link-btn" id="clear">Empty cart</button></div>';
  }
  function bindCart(cart) {
    if (!cart || !cart.items.length) return;
    root.querySelectorAll('[data-qty]').forEach(el => el.onchange = () => { const q = parseInt(el.value); if (q > 0) cart.items[el.dataset.qty].quantity = q; setCart(cart); draw(); });
    root.querySelectorAll('[data-rm]').forEach(el => el.onclick = () => { cart.items.splice(el.dataset.rm, 1); setCart(cart); draw(); });
    document.getElementById('clear').onclick = () => { setCart(null); draw(); };
    document.getElementById('place').onclick = () => place(cart);
  }
  async function add([bid, pid, vid, left]) {
    const q = parseInt(document.getElementById('q-' + bid + '-' + pid + '-' + vid).value);
    if (!(q > 0)) return UI.toast('Enter a quantity of 1 or more.', 'error');
    let cart = getCart();
    if (cart && cart.batchId != bid) {
      if (!await UI.confirm({ title: 'Start a new cart?', message: 'Your cart holds items from another batch. An order can only contain one batch.', confirmText: 'Replace cart' })) return;
      cart = null;
    }
    cart = cart || { batchId: +bid, items: [] };
    const ex = cart.items.find(i => i.productId == pid && i.variantId == vid);
    if ((ex ? ex.quantity : 0) + q > left) return UI.toast('Only ' + left + ' left in this batch.', 'error');
    if (ex) ex.quantity += q; else cart.items.push({ productId: +pid, variantId: +vid, quantity: q });
    setCart(cart); UI.toast('Added to cart.'); draw();
  }
  async function place(cart) {
    if (placing) return;
    const sid = document.getElementById('slot').value, card = document.getElementById('card').value.replace(/\s/g, ''), err = document.getElementById('card-err');
    if (!sid) return UI.toast('Choose a pickup slot first.', 'error');
    if (!/^\d{16}$/.test(card)) { err.textContent = 'Enter a 16-digit card number (any digits work in this demo).'; return; }
    err.textContent = ''; placing = true; const btn = document.getElementById('place'); UI.setBusy(btn, true, 'Placing order...');
    try {
      const o = await api('/orders', { method: 'POST', body: { customerId: me.id, batchId: cart.batchId, pickupSlotId: +sid, items: cart.items } });
      setCart(null);
      await UI.modal({ title: 'Order confirmed', message: 'Order #' + o.id + ' total ' + money(o.totalAmount) + '. Payment: ' + (o.paymentStatus || 'Paid (Simulated)') + '. We will notify you when it is ready.', confirmText: 'Done' });
      await load();
    } catch (e) { UI.toast(e.message, 'error'); await load(); }
    finally { placing = false; }
  }
  load();
})();
