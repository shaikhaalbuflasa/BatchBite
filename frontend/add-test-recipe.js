/* TEST DATA ONLY: gives every product variant a recipe so orders can be placed.
   Run:  node add-test-recipe.js            (uses ~/Downloads/BatchBite-main/backend/data)
   Safe to run twice: it skips anything that already exists. */
const fs = require('fs'), path = require('path'), os = require('os');
const dir = process.argv[2] || path.join(os.homedir(), 'Downloads', 'BatchBite-main', 'backend', 'data');
const read = n => { try { return JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8')); } catch (e) { return []; } };
const write = (n, d) => fs.writeFileSync(path.join(dir, n + '.json'), JSON.stringify(d, null, 2));
const products = read('products'), ingredients = read('ingredients'), recipes = read('recipes');
if (!products.length) { console.log('No products found in ' + dir + '. Create a product first.'); process.exit(1); }
const nextId = list => list.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
const BASE = [['Flour', 'g', 5000, 250], ['Butter', 'g', 2000, 100], ['Chocolate', 'g', 2000, 100]];
let addedI = 0, addedR = 0;
for (const p of products) {
  const ing = BASE.map(([name, unit, qty, per]) => {
    let i = ingredients.find(x => x.ownerId === p.ownerId && x.name === name);
    if (!i) { i = { id: nextId(ingredients), ownerId: p.ownerId, name, unit, quantityAvailable: qty, quantityReserved: 0 }; ingredients.push(i); addedI++; }
    return { ingredientId: i.id, quantity: per, unit };
  });
  for (const v of (p.variants || [])) {
    if (recipes.some(r => r.productId === p.id && r.variantId === v.id && r.ownerId === p.ownerId)) continue;
    recipes.push({ id: nextId(recipes), ownerId: p.ownerId, name: p.name + ' (' + v.name + ')', isActive: true, productId: p.id, variantId: v.id, yieldQuantity: 1, ingredients: ing });
    addedR++;
  }
}
write('ingredients', ingredients); write('recipes', recipes);
console.log('Done. Added ' + addedI + ' ingredient(s) and ' + addedR + ' recipe(s) in ' + dir);
