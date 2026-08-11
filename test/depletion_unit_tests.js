const assert = require('assert');

// Local, lightweight unit tests for depletion logic (no TS dependencies)
function apply(pantry, needs){
  const pan = pantry.map(p => ({...p}));
  const deficits = [];
  for (const [name, need] of Object.entries(needs)){
    const amount = Number(need.quantity) || 0;
    const unit = need.unit;
    let remaining = amount;
    for (const it of pan){
      if (it.name.toLowerCase() === name.toLowerCase() && (it.unit||'') === (unit||'')) {
        const take = Math.min(it.quantity, remaining);
        it.quantity -= take;
        remaining -= take;
        if (remaining <= 0) break;
      }
    }
    if (remaining > 0) deficits.push({ name, deficit: remaining, unit });
  }
  return { pantry: pan, deficits };
}

function testCase(name, fn){ try { fn(); console.log("✔", name); } catch(e){ console.error("✖", name, e); } }

testCase('basic depletion reduces pantry and yields no deficits', () => {
  const pantry = [ {id:'p1', name:'Flour', quantity:500, unit:'g'} ];
  const needs = { Flour: { quantity: 200, unit:'g' } };
  const out = apply(pantry, needs);
  if (out.pantry[0].quantity !== 300) throw new Error('wrong final qty');
  if (out.deficits.length !== 0) throw new Error('unexpected deficits');
});

testCase('deficit when needs exceed pantry', () => {
  const pantry = [ {id:'p1', name:'Flour', quantity:100, unit:'g'} ];
  const needs = { Flour: { quantity: 200, unit:'g' } };
  const out = apply(pantry, needs);
  if (out.pantry[0].quantity !== 0) throw new Error('qty should be 0');
  if (out.deficits.length !== 1) throw new Error('deficit expected');
});

console.log('Depletion unit tests completed');
