// Lightweight integration-style depletion flow test (JS only, stubbed logic)
// This is a sanity check harness to validate that, given a pantry and a needs map,
// the depletion algorithm reduces pantry quantities and produces deficits as expected.

function applyNeedsToPantry(pantry, needs) {
  // Simple in-memory clone
  const pan = pantry.map(p => ({ ...p }));
  const deficits = [];
  for (const [nameRaw, need] of Object.entries(needs)) {
    const name = nameRaw.toLowerCase();
    let remaining = Number(need.quantity) || 0;
    const unit = need.unit;
    for (const item of pan) {
      if (item.name.toLowerCase() === name && (item.unit ?? '') === (unit ?? '')) {
        const avail = item.quantity;
        const take = Math.min(avail, remaining);
        item.quantity = Math.max(0, item.quantity - take);
        remaining -= take;
        if (remaining <= 0) break;
      }
    }
    if (remaining > 0) deficits.push({ name: nameRaw, deficit: remaining, unit });
  }
  return { pantry: pan, deficits };
}

function run(){
  const pantry = [ { id: 'p1', name: 'Flour', quantity: 500, unit: 'g' }, { id: 'p2', name: 'Milk', quantity: 1000, unit: 'ml' } ];
  const needs = { Flour: { quantity: 300, unit: 'g' }, Milk: { quantity: 1200, unit: 'ml' } };
  const { pantry: p1, deficits } = applyNeedsToPantry(pantry, needs);
  console.log('Pantry after needs (week):', p1);
  console.log('Deficits:', deficits);
}

run();
