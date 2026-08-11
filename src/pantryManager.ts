import type { PantryItem } from "./types";
import type { MealPlannerSettings } from "./types";

export class PantryManager {
  // pantry is a reference to the main plugin data: pantry: PantryItem[]
  constructor(private pantry: PantryItem[], private onChange: () => Promise<void>) {}

  takeSnapshot(): PantryItem[] {
    return this.pantry.map(p => ({ ...p }));
  }

  restoreSnapshot(snapshot: PantryItem[]): void {
    this.pantry.length = 0;
    for (const p of snapshot) this.pantry.push({ ...p });
  }

  getAllPantryItems(): PantryItem[] {
    return this.pantry;
  }

  async addPantryItem(item: PantryItem): Promise<void> {
    this.pantry.push(item);
    await this.onChange();
  }

  async updatePantryItem(item: PantryItem): Promise<void> {
    const idx = this.pantry.findIndex(p => p.id === item.id);
    if (idx >= 0) {
      this.pantry[idx] = item;
      await this.onChange();
    }
  }

  async deletePantryItem(id: string): Promise<void> {
    const idx = this.pantry.findIndex(p => p.id === id);
    if (idx >= 0) {
      this.pantry.splice(idx, 1);
      await this.onChange();
    }
  }
}
