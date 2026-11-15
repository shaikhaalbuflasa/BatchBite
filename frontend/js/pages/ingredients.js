/*
 * BatchBite - Ingredient Management (Aaya)
 * ----------------------------------------
 * FR-24 Ingredient requirements and purchasing list
 *   GET  /ingredients                      inventory (Kitchen Staff: all, Business Owner: own)
 *   GET  /recipes                          recipe list
 *   GET  /recipes/:id/calculate?quantity=N  required vs free stock + purchasing list
 * Business Owner only (hidden from Kitchen Staff, also blocked by the backend):
 *   POST /ingredients                      add an ingredient
 *   PUT  /ingredients/:id/stock            set available stock after a delivery or stock count
 *
 * Stock is never reduced by hand here: the backend reserves ingredients when an order is placed
 * and consumes them when the order moves to Preparing.
 */
(async () => {
  const me = await Auth.requireRole(['KitchenStaff', 'BusinessOwner']);
  if (!me) return;
  UI.renderHeader(me, '');

  const E = UI.escape;
  const api = (path, options) => Api.request(path, Object.assign({ token: Auth.token() }, options || {}));
  const isOwner = me.role === 'BusinessOwner';

  const state = { ingredients: [], recipes: [] };
  const els = {
    head: document.getElementById('inv-head'),
    rows: document.getElementById('inv-rows'),
    addForm: document.getElementById('add-form'),
    calcForm: document.getElementById('calc-form'),
    recipe: document.getElementById('calc-recipe'),
    result: document.getElementById('calc-result'),
    refresh: document.getElementById('refresh-btn')
  };
  const COLS = isOwner ? 6 : 5;

  // Round to at most 2 decimals for display (recipes can produce fractions).
  const fmt = n => {
    const v = Math.round(Number(n) * 100) / 100;
    return v.toLocaleString('en-GB', { maximumFractionDigits: 2 });
  };

  els.head.innerHTML = '<tr><th>Ingredient</th><th class="num">Available</th><th class="num">Reserved</th><th class="num">Free to use</th><th>Unit</th>' +
    (isOwner ? '<th>Update stock</th>' : '') + '</tr>';
  if (isOwner) {
    els.addForm.hidden = false;
  } else {
    document.getElementById('inventory-sub').textContent =
      'Available stock, the amount reserved for confirmed orders, and what is free to use. Stock changes are made by the business owner.';
  }

  /* ---------------- loading ---------------- */

  async function loadAll() {
    UI.setBusy(els.refresh, true, 'Refreshing...');
    const [ingredients, recipes] = await Promise.allSettled([api('/ingredients'), api('/recipes')]);
    UI.setBusy(els.refresh, false);

    if (ingredients.status === 'fulfilled') { state.ingredients = ingredients.value; renderInventory(); }
    else els.rows.innerHTML = '<tr><td colspan="' + COLS + '" class="empty">' + E(ingredients.reason.message) + '</td></tr>';

    if (recipes.status === 'fulfilled') { state.recipes = recipes.value.filter(r => r.isActive !== false); renderRecipes(); }
    else els.recipe.innerHTML = '<option value="">' + E(recipes.reason.message) + '</option>';
  }

  /* ---------------- inventory ---------------- */

  function renderInventory() {
    if (!state.ingredients.length) {
      els.rows.innerHTML = '<tr><td colspan="' + COLS + '" class="empty">No ingredients recorded yet.' +
        (isOwner ? ' Add your first ingredient above.' : '') + '</td></tr>';
      return;
    }
    const list = state.ingredients.slice().sort((a, b) => a.name.localeCompare(b.name));
    els.rows.innerHTML = list.map(i => {
      const free = i.quantityAvailable - i.quantityReserved;
      const low = free <= 0;
      return '<tr' + (low ? ' class="is-short"' : '') + '>' +
        '<td><strong>' + E(i.name) + '</strong></td>' +
        '<td class="num">' + fmt(i.quantityAvailable) + '</td>' +
        '<td class="num">' + fmt(i.quantityReserved) + '</td>' +
        '<td class="num"><span class="' + (low ? 'short' : 'ok') + '">' + fmt(free) + '</span></td>' +
        '<td>' + E(i.unit) + '</td>' +
        (isOwner ? '<td><button type="button" class="btn btn-secondary btn-sm" data-action="stock" data-id="' + i.id + '">Update stock</button></td>' : '') +
      '</tr>';
    }).join('');
  }

  async function updateStock(ingredient) {
    const result = await UI.modal({
      title: 'Update stock: ' + ingredient.name,
      message: 'Enter the total amount now on the shelf (for example after a delivery or a stock count). ' +
               fmt(ingredient.quantityReserved) + ' ' + ingredient.unit + ' is reserved for confirmed orders.',
      bodyHtml: '<div class="field"><label for="m-stock">Available stock (' + E(ingredient.unit) + ')</label>' +
                '<input type="number" id="m-stock" name="quantityAvailable" min="0" step="any" value="' + E(ingredient.quantityAvailable) + '">' +
                '<div class="field-error" data-error-for="quantityAvailable"></div></div>',
      confirmText: 'Save stock',
      onSubmit: async form => {
        const raw = form.querySelector('[name=quantityAvailable]').value;
        const value = Number(raw);
        if (raw === '' || !Number.isFinite(value) || value < 0) {
          return { ok: false, error: 'Enter a stock amount of 0 or more.', field: 'quantityAvailable' };
        }
        if (value < ingredient.quantityReserved) {
          return { ok: false, error: 'Stock cannot be lower than the reserved amount (' + fmt(ingredient.quantityReserved) + ').', field: 'quantityAvailable' };
        }
        try {
          await api('/ingredients/' + ingredient.id + '/stock', { method: 'PUT', body: { ownerId: me.id, quantityAvailable: value } });
          return { ok: true };
        } catch (err) {
          return { ok: false, error: err.message, field: 'quantityAvailable' };
        }
      }
    });
    if (result) {
      UI.toast('Stock for ' + ingredient.name + ' updated.');
      await loadAll();
    }
  }

  els.rows.addEventListener('click', event => {
    const button = event.target.closest('button[data-action="stock"]');
    if (!button) return;
    const ingredient = state.ingredients.find(i => i.id === Number(button.dataset.id));
    if (ingredient) updateStock(ingredient);
  });

  els.addForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!isOwner) return;
    const button = els.addForm.querySelector('[type=submit]');
    if (button.disabled) return;
    UI.clearErrors(els.addForm);

    const name = els.addForm.querySelector('[name=name]').value.trim();
    const unit = els.addForm.querySelector('[name=unit]').value.trim();
    const raw = els.addForm.querySelector('[name=quantityAvailable]').value;
    const quantityAvailable = Number(raw);

    if (!name) return UI.showResultError(els.addForm, { error: 'Enter the ingredient name.', field: 'name' });
    if (!unit) return UI.showResultError(els.addForm, { error: 'Enter a unit such as g, ml or pcs.', field: 'unit' });
    if (raw === '' || !Number.isFinite(quantityAvailable) || quantityAvailable < 0) {
      return UI.showResultError(els.addForm, { error: 'Enter a starting stock of 0 or more.', field: 'quantityAvailable' });
    }

    UI.setBusy(button, true, 'Adding...');
    try {
      await api('/ingredients', { method: 'POST', body: { ownerId: me.id, name, unit, quantityAvailable } });
      UI.toast(name + ' added to the inventory.');
      els.addForm.reset();
      await loadAll();
    } catch (err) {
      UI.showResultError(els.addForm, { error: err.message, field: /exists/i.test(err.message) ? 'name' : null });
    } finally {
      UI.setBusy(button, false);
    }
  });

  /* ---------------- recipe calculator ---------------- */

  function renderRecipes() {
    const current = els.recipe.value;
    els.recipe.innerHTML = state.recipes.length
      ? state.recipes.map(r => '<option value="' + r.id + '">' + E(r.name) + ' (makes ' + E(r.yieldQuantity) + ')</option>').join('')
      : '<option value="">No recipes recorded yet</option>';
    if (current && state.recipes.some(r => String(r.id) === current)) els.recipe.value = current;
  }

  function renderCalculation(calc) {
    const shortages = calc.ingredients.filter(i => i.shortageQuantity > 0);
    const rows = calc.ingredients.map(i => {
      const short = i.shortageQuantity > 0;
      return '<tr' + (short ? ' class="is-short"' : '') + '>' +
        '<td><strong>' + E(i.ingredientName) + '</strong></td>' +
        '<td class="num">' + fmt(i.requiredQuantity) + ' ' + E(i.unit) + '</td>' +
        '<td class="num">' + fmt(i.availableQuantity) + ' ' + E(i.unit) + '</td>' +
        '<td>' + (short ? '<span class="short">Short by ' + fmt(i.shortageQuantity) + ' ' + E(i.unit) + '</span>' : '<span class="ok">Enough</span>') + '</td></tr>';
    }).join('');

    const purchasing = calc.purchasingList && calc.purchasingList.length
      ? '<div class="card"><h3>Purchasing list</h3><p class="card-sub">Buy these before starting this production.</p>' +
          '<div class="table-wrap"><table><thead><tr><th>Ingredient</th><th class="num">Amount to buy</th></tr></thead><tbody>' +
          calc.purchasingList.map(p => '<tr><td><strong>' + E(p.ingredientName) + '</strong></td><td class="num">' + fmt(p.shortageQuantity) + ' ' + E(p.unit) + '</td></tr>').join('') +
          '</tbody></table></div></div>'
      : '<div class="notice-ok">There is enough free stock for this production. Nothing needs to be bought.</div>';

    els.result.innerHTML =
      '<div class="k-grid">' +
        '<div class="card"><h3>' + E(calc.recipeName) + ' × ' + E(calc.requestedQuantity) + '</h3>' +
          '<p class="card-sub">Recipe makes ' + E(calc.recipeYield) + ' per batch. ' +
          (shortages.length ? shortages.length + ' ingredient' + (shortages.length > 1 ? 's are' : ' is') + ' short.' : 'All ingredients are covered.') + '</p>' +
          '<div class="table-wrap"><table><thead><tr><th>Ingredient</th><th class="num">Required</th><th class="num">Free stock</th><th>Status</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div></div>' +
        purchasing +
      '</div>';
  }

  els.calcForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = els.calcForm.querySelector('[type=submit]');
    if (button.disabled) return;
    UI.clearErrors(els.calcForm);
    els.result.innerHTML = '';

    const recipeId = Number(els.recipe.value);
    const raw = els.calcForm.querySelector('[name=quantity]').value;
    const quantity = Number(raw);
    if (!recipeId) return UI.showResultError(els.calcForm, { error: 'There is no recipe to calculate.', field: 'recipeId' });
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return UI.showResultError(els.calcForm, { error: 'Enter a whole number of 1 or more.', field: 'quantity' });
    }

    UI.setBusy(button, true, 'Calculating...');
    try {
      const calc = await api('/recipes/' + recipeId + '/calculate?quantity=' + quantity);
      renderCalculation(calc);
    } catch (err) {
      UI.showResultError(els.calcForm, { error: err.message });
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
