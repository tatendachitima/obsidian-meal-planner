import type { PantryItem } from "./types";
import { convertToBase } from "./unitConverter";

export interface NeedsMap {
  [ingredient: string]: { quantity: number; unit?: string };
}

// Simple depletion: consume from pantry by exact name and unit; returns new pantry state and deficits
export function applyNeedsToPantry(pantry: PantryItem[], needs: NeedsMap): { pantry: PantryItem[]; deficits: any[] } {
  // Normalize pantry items to base units (ml/g) when possible
  const pan = pantry.map(p => {
    if (p.unit) {
      const conv = convertToBase(p.quantity, p.unit);
      if (conv && (conv.unit === 'ml' || conv.unit === 'g')) {
        return { ...p, quantity: conv.value, unit: conv.unit };
      }
    }
    return { ...p };
  });
  const deficits: any[] = [];
  for (const [nameRaw, need] of Object.entries(needs)) {
    const name = nameRaw.toLowerCase();
    let remaining = Number(need.quantity) || 0;
    let unit = need.unit;
    // Normalize needs to base units where possible
    if (unit) {
      const conv = convertToBase(remaining, unit);
      if (conv && (conv.unit === 'ml' || conv.unit === 'g')) {
        remaining = conv.value;
        unit = conv.unit;
      }
    }
    for (const item of pan) {
      const unitMatch = (unit == null) || (item.unit === unit);
      if (item.name.toLowerCase() === name && unitMatch) {
        const avail = item.quantity;
        const take = Math.min(avail, remaining);
        item.quantity = Math.max(0, item.quantity - take);
        remaining -= take;
        if (remaining <= 0) break;
      }
    }
    if (remaining > 0) deficits.push({ name: nameRaw, deficit: remaining, unit: unit });
  }
  return { pantry: pan, deficits };
}
