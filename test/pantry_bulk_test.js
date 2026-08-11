// Quick harness to simulate pantry bulk selection flow without a DOM.

function simulateRender(items, selectedIds) {
  const result = {};
  for (const it of items) {
    result[it.id] = !!selectedIds.has(it.id);
  }
  return result;
}

function toCSV(ids, items) {
  const header = ['id','name','quantity','unit','location','expiry','brand','purchaseDate'].join(',');
  const rows = items.filter(it => ids.includes(it.id)).map(it => [
    it.id,
    it.name,
    it.quantity ?? 0,
    it.unit ?? '',
    it.location ?? '',
    it.expiry ?? '',
    it.brand ?? '',
    it.purchaseDate ?? ''
  ].map(v => String(v).replace(/"/g, '""')).join(','));
  return header + '\n' + rows.join('\n');
}

function run() {
  let pass = true;

  // Phase: bulk selection basic flow
  const items = [
    { id: 'pantry_1', name: 'Rice' },
    { id: 'pantry_2', name: 'Beans' },
    { id: 'pantry_3', name: 'Milk' }
  ];
  const selected = new Set(['pantry_1']);

  let render = simulateRender(items, selected);
  let expected = { 'pantry_1': true, 'pantry_2': false, 'pantry_3': false };
  console.log('Phase 1.1: initial selection state', render);
  if (JSON.stringify(render) !== JSON.stringify(expected)) {
    console.error('FAIL: initial selection state mismatch');
    pass = false;
  }

  // Simulate selecting a second item and re-render
  selected.add('pantry_3');
  render = simulateRender(items, selected);
  expected = { 'pantry_1': true, 'pantry_2': false, 'pantry_3': true };
  console.log('Phase 1.2: after selecting pantry_3', render);
  if (JSON.stringify(render) !== JSON.stringify(expected)) {
    console.error('FAIL: selection after second item mismatch');
    pass = false;
  }

  // Phase: bulk export CSV
  const csv = toCSV(['pantry_1','pantry_3'], items.map(i => ({...i, quantity: 1, unit: 'kg', location: '', expiry: '', brand: '', purchaseDate: '' })));
  console.log('Phase 1.3: generated CSV (selected items):');
  console.log(csv);
  if (!csv.startsWith('id,name')) {
    console.error('FAIL: CSV header missing');
    pass = false;
  }

  console.log(pass ? 'ALL TESTS PASSED' : 'TESTS FAILED');
}

run();
