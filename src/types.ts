// ─── Core data types ───────────────────────────────────────────────────────

export interface Recipe {
  /** Matches the note filename (without .md) */
  id: string;
  name: string;
  description?: string;
  ingredients: Ingredient[];
  instructions: string[];
  tags: string[];
  prepTime?: number;   // minutes
  cookTime?: number;   // minutes
  servings?: number;
  sourceUrl?: string;
  imagePath?: string;
  /** Path of the .md file in the vault */
  filePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface Ingredient {
  amount?: string;
  unit?: string;
  name: string;
  notes?: string;
}

// ─── Pantry & Shopping data models (Phase 1 MVP) ───────────────────────────
export interface PantryItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  location?: string;
  category?: string;
  expiry?: string; // ISO date
  brand?: string;
  purchaseDate?: string; // ISO date
  quantityAtPurchase?: number;
  quantityUsed?: number;
}

export interface ShoppingListItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  period: "week" | "month";
  sources: string[]; // recipe IDs or names that require this item
  acquired?: boolean;
}

// ─── Meal plan types ────────────────────────────────────────────────────────

/**
 * A single slot assignment: one meal slot on one day.
 * dateStr is ISO date "YYYY-MM-DD".
 * slotId corresponds to a MealSlot id defined in settings.
 */
export interface MealEntry {
  dateStr: string;
  slotId: string;
  recipeId: string;
  recipeName: string;
  recipeFilePath: string;
  note?: string;
}

/** The full meal plan stored in plugin data */
export interface MealPlan {
  /** key: `${dateStr}__${slotId}` -> array of recipes for that slot */
  entries: Record<string, MealEntry[]>;
}

// ─── Settings ───────────────────────────────────────────────────────────────

export interface MealSlot {
  id: string;
  label: string;
  /** Display order (0 = first) */
  order: number;
}

export interface MealPlannerSettings {
  recipeFolder: string;
  dailyNoteFolder: string;
  dailyNoteDateFormat: string;
  mealSlots: MealSlot[];
  /** Heading to inject meals under in daily notes */
  dailyNoteSectionHeading: string;
  /** Whether to auto-update the daily note section on file open */
  autoUpdateDailyNote: boolean;
  /** Use boundary-based insertion (no markers) for daily notes */
  boundaryInsertion?: boolean;
  /** UI density: compact or comfortable (transient UI setting) */
  density?: "compact" | "comfortable";
  /** Kitchen inventory note basename (no .md) — sync target for pantry */
  kitchenInventoryNote: string;
  /** Auto-export pantry → kitchen inventory note after pantry changes */
  autoSyncKitchenInventory?: boolean;
}

export const DEFAULT_SETTINGS: MealPlannerSettings = {
  recipeFolder: "Recipes",
  dailyNoteFolder: "Daily Notes",
  dailyNoteDateFormat: "YYYY-MM-DD",
  mealSlots: [
    { id: "breakfast", label: "Breakfast", order: 0 },
    { id: "lunch",     label: "Lunch",     order: 1 },
    { id: "dinner",    label: "Dinner",    order: 2 },
  ],
  dailyNoteSectionHeading: "Meals",
  autoUpdateDailyNote: true,
  boundaryInsertion: true,
  density: "compact",
  kitchenInventoryNote: "Kitchen Inventory",
  autoSyncKitchenInventory: false,
};

// ─── Plugin data persisted to data.json ─────────────────────────────────────

export interface PluginData {
  settings: MealPlannerSettings;
  mealPlan: MealPlan;
  pantry: PantryItem[];
  shoppingLists: { week: ShoppingListItem[]; month: ShoppingListItem[] };
  pantrySnapshots?: PantryItem[][]; // optional for reversible depletion (per-plan snapshots)
}
