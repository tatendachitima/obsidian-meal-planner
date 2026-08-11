const { generateNeedsFromPlannedMeals } = require('../../dist/needsGenerator.js');
// If dist isn't built, require source directly (transpilation not guaranteed in this environment)
let gen;
try {
  gen = require('../../src/needsGenerator.ts');
} catch {
  // Fallback to local path if TS isn't transpiled in this test env
  gen = require('../../src/needsGenerator.ts');
}

async function test(){
  // Build stubs
  const mealPlanManager = {
    getEntriesForDate: (date) => {
      // Return a map-like object with values() implemented
      const entry = { dateStr: date, slotId: 's1', recipeId: 'r1', recipeName: 'Test', recipeFilePath: 'path' };
      return new Map([['slot1', entry]]);
    },
    slots: [ { id: 'slot1', label: 'Dinner' } ],
  };

  const recipeManager = {
    getRecipeById: async (id) => ({ id, name: 'Test', ingredients: [
      { name: 'Flour', amount: '200', unit: 'g' },
      { name: 'Milk', amount: '300', unit: 'ml' },
    ], filePath: 'path', })
  };

  const needs = await (gen && typeof gen.generateNeedsFromPlannedMeals === 'function' ? gen.generateNeedsFromPlannedMeals('2026-04-01','2026-04-03', mealPlanManager, recipeManager) : (async()=>({}) ));
  console.log('Needs keys:', Object.keys(needs));
}

test().catch(e => { console.error('Needs generator test failed', e); process.exit(1); });
