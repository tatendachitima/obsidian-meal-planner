// Simple internal depletion test harness (MVP reversible depletion)
// This is a lightweight, self-contained runner to validate the reversible depletion flow.
// It does not depend on the OBSIDIAN runtime; it exercises the depletion logic in isolation.

function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

// Very small PantryItem shape subset for this harness
class PantryItem {
  constructor(id, name, quantity, unit){ this.id=id; this.name=name; this.quantity=quantity; this.unit=unit; }
}

// Simple depletion function: exact-name & exact-unit match only
// needs: { [ingredientName]: { quantity: number, unit?: string } }
function applyDepletion(pantry, needs){
  const pan = pantry.map(p => new PantryItem(p.id, p.name, p.quantity, p.unit));
  const deficits = [];
  for (const [rawName, need] of Object.entries(needs)){
    const name = rawName.toLowerCase();
    let remaining = Number(need.quantity) || 0;
    const unit = need.unit;
    // consume from pantry items matching name and unit (exact match or both undefined)
    for (const item of pan){
      if (item.name.toLowerCase() === name && ((item.unit||'') === (unit||''))){
        const avail = item.quantity;
        const take = Math.min(avail, remaining);
        item.quantity = Math.max(0, item.quantity - take);
        remaining -= take;
        if (remaining <= 0) break;
      }
    }
    if (remaining > 0){ deficits.push({ name: rawName, deficit: remaining, unit: unit }); }
  }
  return { pantry: pan, deficits };
}

function pretty(p) { return p; } // keep simple

// Run a small scenario
function run(){
  const pantry = [
    { id:"p1", name:"Flour", quantity:500, unit:"g" },
    { id:"p2", name:"Milk", quantity:1000, unit:"ml" },
    { id:"p3", name:"Eggs", quantity:6, unit:"unit" },
  ];

  // Need map for first pass
  const needs1 = {
    Flour: { quantity: 300, unit: 'g' },
    Milk: { quantity: 400, unit: 'ml' },
  };

  console.log('--- Initial depletion 1 ---');
  let r = applyDepletion(pantry, needs1);
  console.log('Pantry after depletion:', r.pantry);
  console.log('Deficits:', r.deficits);

  // Snapshot (simulate reversible depletion)
  const snapshot = deepClone(pantry);
  // Re-apply with bigger needs
  const needs2 = {
    Flour: { quantity: 600, unit: 'g' }
  };
  console.log('--- Depletion with larger needs (second pass) ---');
  r = applyDepletion(snapshot, needs2);
  console.log('Pantry after depletion (second pass):', r.pantry);
  console.log('Deficits (second pass):', r.deficits);

  // Revert to snapshot and re-apply the first scenario again to simulate rollback
  console.log('--- Rollback to snapshot and re-run first needs ---');
  r = applyDepletion(pantry, needs1);
  console.log('Pantry after rollback depletion:', r.pantry);
  console.log('Deficits:', r.deficits);
}

run();
