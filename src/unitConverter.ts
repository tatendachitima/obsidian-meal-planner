// Lightweight unit converter for MVP
// Converts common volume/mass units to base units (ml for volume, g for mass) when possible.

export type BaseUnit = 'ml' | 'g';

const VOLUME_MAP: Record<string, number> = {
  // ml variants map to 1 ml
  'ml': 1,
  'milliliter': 1,
  'milliliters': 1,
  'l': 1000,
  'liter': 1000,
  'liters': 1000,
  'teaspoon': 4.92892,
  'teaspoons': 4.92892,
  'tsp': 4.92892,
  'tablespoon': 14.7868,
  'tablespoons': 14.7868,
  'tbsp': 14.7868,
  'cup': 236.588,
  'cups': 236.588,
};

const MASS_MAP: Record<string, number> = {
  'g': 1,
  'gram': 1,
  'grams': 1,
  'kg': 1000,
  'kilogram': 1000,
  'kilograms': 1000,
};

export function convertToBase(amount: number | string | undefined, unit?: string): { value: number; unit: BaseUnit } | null {
  if (amount == null) return null;
  const a = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(a)) return null;
  if (!unit) {
    // Try to guess based on magnitude? default to ml
    return { value: a, unit: 'ml' };
  }
  const u = unit.toLowerCase();
  if (u in VOLUME_MAP) {
    const factor = VOLUME_MAP[u];
    // ml base
    return { value: a * factor, unit: 'ml' };
  }
  if (u in MASS_MAP) {
    const factor = MASS_MAP[u];
    return { value: a * factor, unit: 'g' };
  }
  // Unknown unit; return as-is with original unit if we can't convert
  return { value: a, unit: unit as string as any };
}
