/*
 * BatchBite - Recipe editor for the Products page (Business Owner)
 * Lets the owner give each product variant a recipe from inside the app,
 * so no test-data script is needed before customers can order.
 * Requirements: FR-4 (ingredient information), FR-10 / FR-24 (ingredient stock
 * is reserved and the purchasing list is worked out from recipes), FR-23 (old
 * recipe versions are kept for orders already placed), FR-21 (no duplicates).
 *
 * Backend routes used:
 *   GET  /recipes       - the owner's recipes (active and older versions)
 *   GET  /ingredients   - the owner's ingredients and stock
 *   POST /ingredients   - add an ingredient typed in the recipe that doesn't exist yet
 *   POST /recipes       - save the recipe { productId, variantId, yieldQuantity, ingredients }
 *
 * Used by js/pages/products.js:  RecipeEditor.open(product, user)  -> resolves true when saved
 */
window.RecipeEditor = (() => {
  const E = UI.escape;
  const api = (path, options) => Api.request(path, Object.assign({ token: Auth.token() }, options || {}));
  const UNITS = ['g', 'kg', 'ml', 'L', 'pcs'];

  /** Active recipe for one variant, or null. */
  function activeRecipe(recipes, productId, variantId) {
    return recipes.find(r => r.productId === productId && r.variantId === variantId && r.isActive !== false) || null;
  }

  function rowHtml(index, ingredients, line) {
    const existing = line && ingredients.find(i => i.id === line.ingredientId);
    const name = existing ? existing.name : (line && line.name) || '';
    const unit = existing ? existing.unit : (line && line.unit) || 'g';
    return '<div class="recipe-row" data-row="' + index + '">' +
      '<div class="field"><label>Ingredient</label><input type="text" list="recipe-ingredients" data-k="name" value="' + E(name) + '" placeholder="e.g. Flour"></div>' +
      '<div class="field"><label>Amount</label><input type="number" data-k="quantity" min="0" step="any" value="' + E(line ? line.quantity : '') + '" placeholder="250"></div>' +
      '<div class="field"><label>Unit</label><select data-k="unit">' +
        UNITS.concat(UNITS.includes(unit) ? [] : [unit]).map(u => '<option' + (u === unit ? ' selected' : '') + '>' + E(u) + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label>In stock</label><input type="number" data-k="stock" min="0" step="any" placeholder="e.g. 5000"></div>' +
      '<button type="button" class="link-btn small" data-remove="' + index + '" aria-label="Remove ingredient">Remove</button>' +
    '</div>';
  }

  /** Fill unit and stock from an existing ingredient, and lock them (stock is managed on the Ingredients page). */
  function syncRow(row, ingredients) {
    const nameInput = row.querySelector('[data-k=name]');
    const match = ingredients.find(i => i.name.toLowerCase() === nameInput.value.trim().toLowerCase());
    const unit = row.querySelector('[data-k=unit]');
    const stock = row.querySelector('[data-k=stock]');
    if (match) {
      if (![...unit.options].some(o => o.value === match.unit)) unit.add(new Option(match.unit));
      unit.value = match.unit;
      unit.disabled = true;
      stock.value = match.quantityAvailable;
      stock.disabled = true;
      stock.title = 'Change stock on the Ingredients page';
    } else {
      unit.disabled = false;
      if (stock.disabled) stock.value = '';
      stock.disabled = false;
      stock.title = '';
    }
  }

  function showModal(product, me, recipes, ingredients) {
    const variants = product.variants || [];
    if (!variants.length) {
      UI.toast('Add a variant to this product first.', 'error');
      return Promise.resolve(false);
    }

    return UI.modal({
      title: 'Recipe for ' + product.name,
      message: 'List what goes into this product. Ingredient stock is reserved when a customer orders and used when the kitchen starts preparing.',
      bodyHtml:
        '<datalist id="recipe-ingredients">' + ingredients.map(i => '<option value="' + E(i.name) + '">').join('') + '</datalist>' +
        '<div class="form-grid">' +
          '<div class="field"><label for="r-variant">Variant</label><select id="r-variant" name="variantId">' +
            variants.map(v => '<option value="' + v.id + '">' + E(v.name) + (activeRecipe(recipes, product.id, v.id) ? ' (has recipe)' : '') + '</option>').join('') +
          '</select></div>' +
          '<div class="field"><label for="r-yield">This recipe makes</label><input type="number" id="r-yield" name="yieldQuantity" min="1" step="1" value="1">' +
            '<div class="field-error" data-error-for="yieldQuantity"></div></div>' +
        '</div>' +
        '<div id="recipe-rows"></div>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="add-row">Add ingredient</button>' +
        '<p class="small muted" style="margin-top:.6rem">New ingredient names are added to your Ingredients list with the stock you enter. Existing ones keep their stock.</p>',
      confirmText: 'Save recipe',
      onSubmit: async form => {
        const variantId = Number(form.variantId.value);
        const yieldQuantity = Number(form.yieldQuantity.value);
        if (!Number.isInteger(yieldQuantity) || yieldQuantity < 1) {
          return { ok: false, field: 'yieldQuantity', error: 'Enter a whole number of 1 or more.' };
        }

        const rows = [...form.querySelectorAll('.recipe-row')].map(row => ({
          name: row.querySelector('[data-k=name]').value.trim(),
          quantity: Number(row.querySelector('[data-k=quantity]').value),
          unit: row.querySelector('[data-k=unit]').value,
          stock: row.querySelector('[data-k=stock]').value
        })).filter(r => r.name || r.quantity);

        if (!rows.length) return { ok: false, error: 'Add at least one ingredient.' };
        const names = new Set();
        for (const r of rows) {
          if (!r.name) return { ok: false, error: 'Every line needs an ingredient name.' };
          if (!(r.quantity > 0)) return { ok: false, error: 'Enter an amount above 0 for ' + r.name + '.' };
          const key = r.name.toLowerCase();
          if (names.has(key)) return { ok: false, error: r.name + ' is listed twice.' };
          names.add(key);
          const exists = ingredients.some(i => i.name.toLowerCase() === key);
          if (!exists && (r.stock === '' || !(Number(r.stock) >= 0))) {
            return { ok: false, error: 'Enter how much ' + r.name + ' you have in stock.' };
          }
        }

        const submit = form.querySelector('[type=submit]');
        UI.setBusy(submit, true, 'Saving...');                  // FR-21
        try {
          const lines = [];
          for (const r of rows) {
            let ingredient = ingredients.find(i => i.name.toLowerCase() === r.name.toLowerCase());
            if (!ingredient) {
              const created = await api('/ingredients', {
                method: 'POST',
                body: { ownerId: me.id, name: r.name, unit: r.unit, quantityAvailable: Number(r.stock) }
              });
              ingredient = created.ingredient || created;
              ingredients.push(ingredient);
            }
            lines.push({ ingredientId: ingredient.id, quantity: r.quantity });
          }
          await api('/recipes', {
            method: 'POST',
            body: { productId: product.id, variantId, yieldQuantity, ingredients: lines }
          });
          return { ok: true };
        } catch (err) {
          UI.setBusy(submit, false);
          return { ok: false, error: err.message };
        }
      }
    });
  }

  /* UI.modal() adds the window to the page straight away, so the rows can be wired up right after. */
  function wire(product, recipes, ingredients) {
    const box = document.getElementById('recipe-rows');
    const variantSelect = document.getElementById('r-variant');
    const yieldInput = document.getElementById('r-yield');
    let count = 0;

    function addRow(line) {
      box.insertAdjacentHTML('beforeend', rowHtml(count++, ingredients, line));
      const row = box.lastElementChild;
      syncRow(row, ingredients);
    }

    function fill() {
      box.innerHTML = '';
      const current = activeRecipe(recipes, product.id, Number(variantSelect.value));
      yieldInput.value = current ? current.yieldQuantity : 1;
      const lines = current ? current.ingredients : [];
      if (lines.length) lines.forEach(addRow); else { addRow(); addRow(); }
    }

    box.addEventListener('input', e => { if (e.target.dataset.k === 'name') syncRow(e.target.closest('.recipe-row'), ingredients); });
    box.addEventListener('click', e => {
      if (!e.target.dataset.remove) return;
      e.target.closest('.recipe-row').remove();
      if (!box.children.length) addRow();
    });
    document.getElementById('add-row').addEventListener('click', () => addRow());
    variantSelect.addEventListener('change', fill);
    fill();
  }

  /** Public entry point: opens the editor and wires the rows. */
  async function openEditor(product, me) {
    let recipes = [];
    let ingredients = [];
    try {
      [recipes, ingredients] = await Promise.all([api('/recipes'), api('/ingredients')]);
      ingredients = ingredients.filter(i => i.ownerId === me.id);
    } catch (err) {
      UI.toast(err.message, 'error');
      return false;
    }
    const waiting = showModal(product, me, recipes, ingredients);
    if (document.getElementById('recipe-rows')) wire(product, recipes, ingredients);
    return !!(await waiting);
  }

  return { open: openEditor, activeRecipe };
})();
