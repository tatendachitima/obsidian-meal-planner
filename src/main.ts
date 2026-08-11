import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, type MealPlannerSettings, type PluginData, type MealPlan } from "./types";
import { RecipeManager } from "./recipeManager";
import { MealPlanManager, todayDateStr } from "./mealPlanManager";
import { DailyNoteIntegration } from "./dailyNoteIntegration";
import { PantryManager } from "./pantryManager";
import { ShoppingListManager } from "./shoppingListManager";
import { DepletionCoordinator } from "./depletionCoordinator";
import { PlannerView, PLANNER_VIEW_TYPE } from "./plannerView";
import { MealPlannerSettingTab } from "./settingsTab";
import { ImportRecipeModal } from "./importModal";
import { NewRecipeModal } from "./newRecipeModal";
import { KitchenInventorySync } from "./kitchenInventorySync";

export default class MealPlannerPlugin extends Plugin {
  settings!: MealPlannerSettings;
  private mealPlan!: MealPlan;
  pantry!: import("./types").PantryItem[];
  shoppingLists!: { week: import("./types").ShoppingListItem[]; month: import("./types").ShoppingListItem[] };
  pantrySnapshots?: import("./types").PantryItem[][];
  pantryManager!: PantryManager;
  shoppingListManager!: ShoppingListManager;
  kitchenSync!: KitchenInventorySync;

  recipeManager!: RecipeManager;
  mealPlanManager!: MealPlanManager;
  dailyNoteIntegration!: DailyNoteIntegration;

  async onload(): Promise<void> {
    await this.loadData();

    // Initialise managers
    this.recipeManager = new RecipeManager(this.app, this.settings);
    this.mealPlanManager = new MealPlanManager(
      this.mealPlan,
      this.settings,
      () => this.saveData()
    );
    // Instantiate pantry/shopping managers with data references
    this.pantryManager = new PantryManager(this.pantry, async () => {
      await this.saveData();
      await this.kitchenSync?.autoExportIfEnabled();
    });
    this.shoppingListManager = new ShoppingListManager(this.shoppingLists.week, this.shoppingLists.month, async () => { await this.saveData(); });
    this.kitchenSync = new KitchenInventorySync(this.app, this.settings, this.pantryManager, this.shoppingListManager);

    this.dailyNoteIntegration = new DailyNoteIntegration(
      this.app,
      this.settings,
      this.mealPlanManager
    );

    // Register the sidebar view with pantry/shopping managers
    this.registerView(PLANNER_VIEW_TYPE, (leaf) =>
      new PlannerView(
        leaf,
        this.recipeManager,
        this.mealPlanManager,
        this.dailyNoteIntegration,
        this.settings,
        this.pantryManager,
        this.shoppingListManager,
        this.kitchenSync,
        async () => { await this.saveData(); }
      )
    );

    // Ribbon icon
    this.addRibbonIcon("utensils", "Meal Planner", () => this.activatePlannerView());

    // Commands
    this.addCommand({
      id: "open-meal-planner",
      name: "Open meal planner",
      callback: () => this.activatePlannerView(),
    });

    this.addCommand({
      id: "import-recipe-from-url",
      name: "Import recipe from URL",
      callback: () => {
        new ImportRecipeModal(this.app, this.recipeManager, async () => {
          this.refreshPlannerView();
        }).open();
      },
    });

    this.addCommand({
      id: "new-recipe",
      name: "New recipe (manual)",
      callback: () => {
        new NewRecipeModal(this.app, this.recipeManager, async () => {
          this.refreshPlannerView();
        }).open();
      },
    });

    this.addCommand({
      id: "update-daily-note-meals",
      name: "Update today's daily note with meals",
      callback: async () => {
        await this.dailyNoteIntegration.updateDailyNote(todayDateStr());
      },
    });

    this.addCommand({
      id: "sync-kitchen-inventory-import",
      name: "Sync kitchen inventory (import from note)",
      callback: async () => {
        await this.kitchenSync.importFromNote();
        this.refreshPlannerView();
      },
    });

    this.addCommand({
      id: "sync-kitchen-inventory-export",
      name: "Sync kitchen inventory (export to note)",
      callback: async () => {
        await this.kitchenSync.exportToNote();
      },
    });

    // Settings tab
    this.addSettingTab(new MealPlannerSettingTab(this.app, this));

    // Auto-update daily note when a file is opened
    this.registerEvent(
      this.app.workspace.on("file-open", async (file) => {
        if (!file || !this.settings.autoUpdateDailyNote) return;
        const today = todayDateStr();
        const dailyNote = this.dailyNoteIntegration.findDailyNote(today);
        if (dailyNote && file.path === dailyNote.path) {
          await this.dailyNoteIntegration.updateDailyNote(today);
        }
      })
    );

  }

  onunload(): void {
    // Guideline: don't detach leaves — Obsidian manages view lifecycle.
    // Clear any pending auto-export timer so it can't fire after unload.
    (this.kitchenSync as any)?.clearPendingExport?.();
  }

  // ─── Data persistence ────────────────────────────────────────────────────

  async loadData(): Promise<void> {
    const saved = (await super.loadData()) as Partial<PluginData> | null;

    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved?.settings ?? {});
    // Density is persisted in the plugin's data store (this.settings.density)
    // Migration: ensure boundaryInsertion is defined; flip default to boundary-based baseline
    if (typeof this.settings.boundaryInsertion !== "boolean") {
      this.settings.boundaryInsertion = DEFAULT_SETTINGS.boundaryInsertion;
    }

    // Ensure mealSlots is always a valid array (migration safety)
    if (!Array.isArray(this.settings.mealSlots) || this.settings.mealSlots.length === 0) {
      this.settings.mealSlots = DEFAULT_SETTINGS.mealSlots;
    }

    this.mealPlan = saved?.mealPlan ?? { entries: {} };
    
    // Migration: convert old single-entry format to new array format
    if (this.mealPlan.entries) {
      const migrated: Record<string, any[]> = {};
      for (const key of Object.keys(this.mealPlan.entries)) {
        const entry = this.mealPlan.entries[key] as any;
        // Check if it's the old format (has dateStr property but is not an array)
        if (entry && typeof entry === 'object' && !Array.isArray(entry) && entry.dateStr) {
          migrated[key] = [entry];
        } else if (Array.isArray(entry)) {
          migrated[key] = entry;
        }
      }
      this.mealPlan.entries = migrated;
    }
    
    // Initialize pantry/shopping data from saved state or defaults
    this.pantry = (saved?.pantry as any) ?? [];
    this.shoppingLists = saved?.shoppingLists ?? { week: [], month: [] };
    this.pantrySnapshots = saved?.pantrySnapshots ?? [];
  }

  async saveData(): Promise<void> {
    const data: PluginData = {
      settings: this.settings,
      mealPlan: this.mealPlan,
      pantry: this.pantry,
      shoppingLists: this.shoppingLists,
      pantrySnapshots: this.pantrySnapshots,
    };
    await super.saveData(data);

    // Keep managers in sync with any settings changes
    this.recipeManager = new RecipeManager(this.app, this.settings);
  }

  // ─── View helpers ─────────────────────────────────────────────────────────

  private async activatePlannerView(): Promise<void> {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(PLANNER_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: PLANNER_VIEW_TYPE, active: true });
    }

    workspace.revealLeaf(leaf);
  }

  private refreshPlannerView(): void {
    const leaves = this.app.workspace.getLeavesOfType(PLANNER_VIEW_TYPE);
    for (const leaf of leaves) {
      if (leaf.view instanceof PlannerView) {
        leaf.view.render();
      }
    }
  }
}
