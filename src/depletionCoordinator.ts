import type { PantryItem } from "./types";
import type { PantryManager } from "./pantryManager";
import type { ShoppingListManager } from "./shoppingListManager";
import type { NeedsMap } from "./depletionEngine";
import { applyNeedsToPantry } from "./depletionEngine";

export class DepletionCoordinator {
  constructor(private pantryManager: PantryManager, private shoppingListManager: ShoppingListManager) {}

  async depleteForWindow(window: 'week' | 'month', needs: NeedsMap): Promise<void> {
    // Take a snapshot for rollback capability
    const snapshot = this.pantryManager.takeSnapshot();

    // Apply depletion to a fresh copy of pantry and capture final state/deficits
    const currentPantry = this.pantryManager.takeSnapshot();
    const { pantry: finalPantry, deficits } = applyNeedsToPantry(currentPantry as unknown as PantryItem[], needs);

    // Commit the final pantry state back into the live pantry (mutating in place)
    this.pantryManager.restoreSnapshot(finalPantry as PantryItem[]);

    // Push deficits into shopping list for the given period
    for (const d of deficits) {
      const item = {
        id: `debt_${Date.now()}_${d.name}`,
        name: d.name,
        quantity: d.deficit,
        unit: d.unit,
        period: window,
        sources: [],
        acquired: false
      } as any;
      await this.shoppingListManager.addOrUpdateItem(item);
    }
  }
}
