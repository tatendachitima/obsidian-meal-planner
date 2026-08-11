import type { NeedsMap } from "./depletionEngine";
import type { MealPlanManager } from "./mealPlanManager";
import type { RecipeManager } from "./recipeManager";
import type { Recipe } from "./types";

// Simple needs generator that derives needs from planned meals in a date window
// This is MVP-friendly and relies on recipe ingredients if available.
export async function generateNeedsFromPlannedMeals(
  startDate: string,
  endDate: string,
  mealPlanManager: MealPlanManager,
  recipeManager: RecipeManager
): Promise<NeedsMap> {
  // Build a map: ingredientName -> { quantity, unit }
  const needs: NeedsMap = {} as NeedsMap;

  // Helper to add to needs map
  const addNeed = (ingName: string, amount: number, unit?: string) => {
    const key = ingName;
    if (!needs[key]) {
      needs[key] = { quantity: amount, unit };
    } else {
      needs[key].quantity += amount;
      needs[key].unit = needs[key].unit || unit;
    }
  };

  // Convert date range to iteration
  const toDate = (d: string) => new Date(d + 'T00:00:00');
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
  const dateIterate = (start: string, end: string) => {
    const s = toDate(start);
    const e = toDate(end);
    const arr: string[] = [];
    for (let dt = new Date(s); dt <= e; dt.setDate(dt.getDate() + 1)) {
      const y = dt.getFullYear();
      const m = pad(dt.getMonth() + 1);
      const d = pad(dt.getDate());
      arr.push(`${y}-${m}-${d}`);
    }
    return arr;
  };

  // Iterate dates in range and collect ingredients from planned recipes
  const dates = dateIterate(startDate, endDate);
  for (const dateStr of dates) {
    const entriesMap = mealPlanManager.getEntriesForDate(dateStr);
    // entriesMap is Map<slotId, MealEntry[]>
    for (const entries of entriesMap.values()) {
      for (const entry of entries) {
        const recipe = await (recipeManager as any).getRecipeById(entry.recipeId) as Recipe | null;
        const ingredients = recipe?.ingredients ?? [];
        for (const ing of ingredients) {
          const amount = parseFloat(String(ing.amount ?? ''));
          if (!Number.isFinite(amount)) continue;
          const ingUnit = ing.unit;
          const ingName = ing.name || '';
          if (!ingName) continue;
          addNeed(ingName, amount, ingUnit);
        }
      }
    }
  }
  return needs;
}
