import {
  App,
  ItemView,
  Menu,
  Notice,
  WorkspaceLeaf,
} from "obsidian";
import type { RecipeManager } from "./recipeManager";
import type { MealPlanManager } from "./mealPlanManager";
import type { DailyNoteIntegration } from "./dailyNoteIntegration";
import type { MealPlannerSettings, Recipe } from "./types";
import { ImportRecipeModal } from "./importModal";
import { NewRecipeModal } from "./newRecipeModal";
import { AssignMealModal } from "./assignMealModal";
import { PantryView } from "./pantryView";
import { ShoppingView } from "./shoppingView";
import { DepletionCoordinator } from "./depletionCoordinator";
import type { NeedsMap } from "./depletionEngine";
import { generateNeedsFromPlannedMeals } from "./needsGenerator";
import {
  todayDateStr,
  getMondayOf,
  addDays,
  formatShortDate,
} from "./mealPlanManager";
import type { PantryManager } from "./pantryManager";
import type { ShoppingListManager } from "./shoppingListManager";
import type { KitchenInventorySync } from "./kitchenInventorySync";

export const PLANNER_VIEW_TYPE = "meal-planner-view";

export class PlannerView extends ItemView {
  private currentWeekMonday: string;
  private activeTab: "planner" | "recipes" = "planner";
  private topView: "planner" | "recipes" | "pantry" | "shopping" = "planner";
  private densityPersister?: () => Promise<void>;
  private allRecipes: Recipe[] = [];

  private depletionCoordinator?: DepletionCoordinator;
  constructor(
    leaf: WorkspaceLeaf,
    private recipeManager: RecipeManager,
    private mealPlanManager: MealPlanManager,
    private dailyNoteIntegration: DailyNoteIntegration,
    private settings: MealPlannerSettings,
    private pantryManager?: any,
    private shoppingListManager?: any,
    private kitchenSync?: KitchenInventorySync,
    densityPersister?: () => Promise<void>
  ) {
    super(leaf);
    this.currentWeekMonday = getMondayOf(todayDateStr());
    this.densityPersister = densityPersister;
    if (this.pantryManager && this.shoppingListManager) {
      this.depletionCoordinator = new DepletionCoordinator(this.pantryManager, this.shoppingListManager);
    }
  }

  getViewType(): string { return PLANNER_VIEW_TYPE; }
  getDisplayText(): string { return "Meal Planner"; }
  getIcon(): string { return "utensils"; }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async render(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("meal-planner-view");

    // Density handling (compact vs comfortable)
    const density = (this.settings as any).density ?? "compact";
    // Remove any previous density class and apply current
    container.classList.remove("meal-planner-density-compact", "meal-planner-density-comfortable");
    container.classList.add(`meal-planner-density-${density}`);

    // Global header: sticky with four top-level tabs
    const header = container.createDiv({ cls: "meal-planner-global-header" });
    const tabs = [
      { id: 'planner', label: 'Planner' },
      { id: 'recipes', label: 'Recipes' },
      { id: 'pantry', label: 'Pantry' },
      { id: 'shopping', label: 'Shopping' },
    ];
    // Density toggle control (compact / comfortable)
    const densityBtn = header.createEl('button', {
      text: `Density: ${density === 'compact' ? 'Compact' : 'Comfortable'}`,
      cls: 'meal-planner-density-toggle',
    }) as HTMLButtonElement;
    densityBtn.addEventListener('click', async () => {
      const next = (this.settings as any).density === 'compact' ? 'comfortable' : 'compact';
      (this.settings as any).density = next;
      await this.densityPersister?.();
      this.render();
    });

    for (const t of tabs) {
      const btn = header.createEl('button', {
        text: t.label,
        cls: 'meal-planner-global-tab' + (this.topView === (t.id as any) ? ' is-active' : ''),
      }) as HTMLButtonElement;
      btn.setAttribute('aria-label', `Open ${t.label} tab`);
      btn.addEventListener('click', () => {
        this.topView = t.id as any;
        this.render();
      });
    }

    // Content area
    const content = container.createDiv({ cls: "meal-planner-content" });

    if (this.topView === 'planner') {
      await this.renderPlannerTab(content);
    } else if (this.topView === 'recipes') {
      await this.renderRecipesTab(content);
    } else if (this.topView === 'pantry') {
      // Simple embedded pantry view
      if (this.pantryManager && typeof this.pantryManager.getAllPantryItems === 'function') {
        const pv = new PantryView(this.app as any, this.pantryManager, this.kitchenSync);
        pv.render(content);
      } else {
        content.createEl('div', { text: 'Pantry (MVP) — coming soon' });
      }
    } else {
      // Simple embedded shopping view
      if (this.shoppingListManager && typeof this.shoppingListManager.getWeekList === 'function') {
        const sv = new ShoppingView(this.app as any, this.shoppingListManager);
        sv.render(content);
      } else {
        content.createEl('div', { text: 'Shopping (MVP) — coming soon' });
      }
    }
  }

  // ── PLANNER TAB ──────────────────────────────────────────────────────────

  private async renderPlannerTab(container: HTMLElement): Promise<void> {
    // Week nav
    const nav = container.createDiv({ cls: "meal-planner-week-nav" });

    nav.createEl("button", { text: "‹" })
      .addEventListener("click", () => {
        this.currentWeekMonday = addDays(this.currentWeekMonday, -7);
        this.render();
      });

    const weekEnd = addDays(this.currentWeekMonday, 6);
    nav.createEl("span", {
      text: `${formatShortDate(this.currentWeekMonday)} – ${formatShortDate(weekEnd)}`,
      cls: "meal-planner-week-label",
    });

    nav.createEl("button", { text: "›" })
      .addEventListener("click", () => {
        this.currentWeekMonday = addDays(this.currentWeekMonday, 7);
        this.render();
      });

    nav.createEl("button", { text: "Today", cls: "meal-planner-today-btn" })
      .addEventListener("click", () => {
        this.currentWeekMonday = getMondayOf(todayDateStr());
        this.render();
      });

    // Week grid
    const grid = container.createDiv({ cls: "meal-planner-grid" });
    const today = todayDateStr();
    const slots = this.mealPlanManager.slots;

    // Header row: day labels
    const headerRow = grid.createDiv({ cls: "meal-planner-grid__header" });
    headerRow.createDiv({ cls: "meal-planner-grid__slot-label" }); // empty corner
    for (let i = 0; i < 7; i++) {
      const dateStr = addDays(this.currentWeekMonday, i);
      const isToday = dateStr === today;
      headerRow.createDiv({
        text: formatShortDate(dateStr),
        cls: "meal-planner-grid__day-label" + (isToday ? " is-today" : ""),
      });
    }

    // Slot rows
    for (const slot of slots) {
      const row = grid.createDiv({ cls: "meal-planner-grid__row" });
      row.createDiv({ text: slot.label, cls: "meal-planner-grid__slot-label" });

      for (let i = 0; i < 7; i++) {
        const dateStr = addDays(this.currentWeekMonday, i);
        const isToday = dateStr === today;
        const entries = this.mealPlanManager.getEntries(dateStr, slot.id);
        const cell = row.createDiv({
          cls: "meal-planner-grid__cell" + (isToday ? " is-today" : "") + (entries.length > 0 ? " has-entry" : ""),
        });

        // drag-over visual feedback for potential drop targets
        cell.addEventListener("dragenter", (ev) => { ev.preventDefault(); cell.classList.add("meal-planner-grid__cell--dragover"); });
        cell.addEventListener("dragleave", () => { cell.classList.remove("meal-planner-grid__cell--dragover"); });
        if (entries.length > 0) {
          // Render as compact dots inside the cell
          for (const entry of entries) {
            const dot = cell.createEl("div", { cls: "meal-planner-dot" }) as HTMLDivElement;
            dot.style.width = "8px"; dot.style.height = "8px"; dot.style.borderRadius = "50%";
            dot.style.display = "inline-block"; dot.style.margin = "0 2px";
            dot.style.background = "var(--text-muted)";
            dot.setAttribute('data-tooltip', entry.recipeName);
            dot.style.cursor = "pointer";
            dot.addEventListener("click", (ev) => {
              ev.stopPropagation();
              this.recipeManager.openRecipeNote({ filePath: entry.recipeFilePath } as Recipe);
            });
            dot.addEventListener("contextmenu", (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              const menu = new Menu();
              menu.addItem(i => i.setTitle("Open recipe").setIcon("file-text")
                .onClick(() => this.recipeManager.openRecipeNote({ filePath: entry.recipeFilePath } as Recipe)));
              menu.addItem(i => i.setTitle("Remove from plan").setIcon("trash")
                .onClick(async () => {
                  await this.mealPlanManager.removeEntry(dateStr, slot.id, entry.recipeId);
                  await this.dailyNoteIntegration.updateDailyNote(dateStr);
                  this.render();
                }));
              menu.showAtMouseEvent(ev);
            });
            dot.addEventListener("dragstart", (ev) => {
              const payload = {
                action: 'move',
                fromDate: dateStr,
                fromSlot: slot.id,
                recipeId: entry.recipeId
              };
              ev.dataTransfer?.setData("text/plain", JSON.stringify(payload));
            });
          }

          // Allow dropping a recipe onto this cell to move it here
          cell.addEventListener("dragover", (ev) => { ev.preventDefault(); });
          cell.addEventListener("drop", async (ev) => {
            const raw = ev.dataTransfer?.getData("text/plain");
            try {
              const payload = JSON.parse(raw || "{}");
              if (payload.action === 'move') {
                const fromDate = payload.fromDate;
                const fromSlot = payload.fromSlot;
                const recipeId = payload.recipeId;
                await this.mealPlanManager.moveEntry(fromDate, fromSlot, recipeId, dateStr, slot.id);
                await this.dailyNoteIntegration.updateDailyNote(dateStr);
                this.render();
                cell.classList.remove("meal-planner-grid__cell--dragover");
              }
            } catch {
              // ignore invalid payloads
            }
          });
        } else {
          // empty cell: drag-over hints as well
          cell.addEventListener("dragenter", (ev) => { ev.preventDefault(); cell.classList.add("meal-planner-grid__cell--dragover"); });
          cell.addEventListener("dragleave", () => { cell.classList.remove("meal-planner-grid__cell--dragover"); });
          const plus = cell.createEl("span", { text: "+", cls: "meal-planner-grid__add-btn" });
          plus.addEventListener("click", () => this.openAssignModal(dateStr, slot, true));
        }
      }
    }

    // Today's meals summary panel
    const todayEntries = this.mealPlanManager.getEntriesForDate(today);
    if (todayEntries.size > 0) {
      const todayPanel = container.createDiv({ cls: "meal-planner-today-panel" });
      todayPanel.createEl("h3", { text: "Today" });
      for (const slot of slots) {
        const entries = todayEntries.get(slot.id);
        if (!entries || entries.length === 0) continue;
        const row = todayPanel.createDiv({ cls: "meal-planner-today-panel__row" });
        row.createSpan({ text: slot.label + ":", cls: "meal-planner-today-panel__slot" });
        // Render multiple recipes as inline links separated by pipes
        entries.forEach((entry, idx) => {
          if (idx > 0) {
            row.createSpan({ text: " | ", cls: "meal-planner-today-panel__pipe" });
          }
          const link = row.createEl("a", { text: entry.recipeName, cls: "meal-planner-today-panel__link" });
          link.addEventListener("click", () =>
            this.recipeManager.openRecipeNote({ filePath: entry.recipeFilePath } as Recipe)
          );
        });
      }
    }
  }

  private openAssignModal(dateStr: string, slot: typeof this.mealPlanManager.slots[0], appendMode = false): void {
    const onAssigned = async () => {
      await this.dailyNoteIntegration.updateDailyNote(dateStr);
      this.render();
      if (this.depletionCoordinator) {
        const startDate = this.currentWeekMonday;
        const endDate = addDays(this.currentWeekMonday, 6);
        const weekNeeds = await generateNeedsFromPlannedMeals(startDate, endDate, this.mealPlanManager, this.recipeManager);
        await this.depletionCoordinator.depleteForWindow('week', weekNeeds);

        const d = new Date(startDate);
        const monthFirst = new Date(d.getFullYear(), d.getMonth(), 1);
        const monthLast = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const monthStart = `${monthFirst.getFullYear()}-${String(monthFirst.getMonth() + 1).padStart(2, '0')}-01`;
        const monthEnd = `${monthLast.getFullYear()}-${String(monthLast.getMonth() + 1).padStart(2, '0')}-${String(monthLast.getDate()).padStart(2, '0')}`;
        const monthNeeds = await generateNeedsFromPlannedMeals(monthStart, monthEnd, this.mealPlanManager, this.recipeManager);
        await this.depletionCoordinator.depleteForWindow('month', monthNeeds);
      }
    };
    new AssignMealModal(
      this.app,
      this.recipeManager,
      this.mealPlanManager,
      dateStr,
      slot,
      onAssigned,
      appendMode
    ).open();
  }

  // ── RECIPES TAB ──────────────────────────────────────────────────────────

  private async renderRecipesTab(container: HTMLElement): Promise<void> {
    // Toolbar
    const toolbar = container.createDiv({ cls: "meal-planner-recipe-toolbar" });

    toolbar.createEl("button", { text: "Import from URL", cls: "mod-cta" })
      .addEventListener("click", () => {
        new ImportRecipeModal(this.app, this.recipeManager, async (recipe) => {
          this.allRecipes = await this.recipeManager.getAllRecipes();
          this.render();
        }).open();
      });

    toolbar.createEl("button", { text: "New recipe" })
      .addEventListener("click", () => {
        new NewRecipeModal(this.app, this.recipeManager, async (recipe) => {
          this.allRecipes = await this.recipeManager.getAllRecipes();
          this.render();
        }).open();
      });

    // Search
    const searchRow = container.createDiv({ cls: "meal-planner-search-row" });
    const searchInput = searchRow.createEl("input", {
      type: "text",
      placeholder: "Search recipes…",
      cls: "meal-planner-search",
    });

    // Load recipes
    this.allRecipes = await this.recipeManager.getAllRecipes();

    const listEl = container.createDiv({ cls: "meal-planner-recipe-list meal-planner-recipe-list--full" });

    const renderList = (query: string) => {
      listEl.empty();
      const filtered = query
        ? this.allRecipes.filter(r =>
            r.name.toLowerCase().includes(query.toLowerCase()) ||
            r.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
          )
        : this.allRecipes;

      if (filtered.length === 0) {
        listEl.createEl("p", {
          text: this.allRecipes.length === 0
            ? "No recipes yet. Import one from a URL or create manually."
            : "No recipes match your search.",
          cls: "meal-planner-muted",
        });
        return;
      }

      // Sort by name, then by total time
      const sorted = filtered.slice().sort((a, b) => {
        const an = a.name.toLowerCase();
        const bn = b.name.toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        const at = (a.prepTime ?? 0) + (a.cookTime ?? 0);
        const bt = (b.prepTime ?? 0) + (b.cookTime ?? 0);
        return at - bt;
      });

      for (const recipe of sorted) {
        const row = listEl.createDiv({ cls: "meal-planner-recipe-row meal-planner-recipe-row--full" });

        const left = row.createDiv({ cls: "meal-planner-recipe-row__left" });
        left.createEl("strong", { text: recipe.name });

        if (recipe.description) {
          left.createEl("p", {
            text: recipe.description.slice(0, 80) + (recipe.description.length > 80 ? "…" : ""),
            cls: "meal-planner-muted",
          });
        }

        if (recipe.tags.length > 0) {
          const tagRow = left.createDiv({ cls: "meal-planner-tag-row" });
          for (const tag of recipe.tags.slice(0, 5)) {
            tagRow.createSpan({ text: tag, cls: "meal-planner-tag" });
          }
        }

        const right = row.createDiv({ cls: "meal-planner-recipe-row__right" });

        // Hover-revealed actions
        const actionsEl = right.createDiv({ cls: "meal-planner-recipe-row__actions" });
        actionsEl.createEl("button", { text: "Open", cls: "meal-planner-recipe-row__action", attr: { "aria-label": "Open recipe" } })
          .addEventListener("click", (ev) => {
            ev.stopPropagation();
            this.recipeManager.openRecipeNote(recipe);
          });
        actionsEl.createEl("button", { text: "Delete", cls: "meal-planner-recipe-row__action", attr: { "aria-label": "Delete recipe" } })
          .addEventListener("click", async (ev) => {
            ev.stopPropagation();
            await this.recipeManager.deleteRecipe(recipe);
            this.allRecipes = await this.recipeManager.getAllRecipes();
            renderList(searchInput.value);
          });
        if (recipe.prepTime || recipe.cookTime) {
          const total = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);
          right.createEl("span", { text: `${total}m`, cls: "meal-planner-muted" });
        }

        // Open note on click (row click is a default action; hover reveals inline actions as well)
        row.addEventListener("click", () => this.recipeManager.openRecipeNote(recipe));

        // Context menu
        row.addEventListener("contextmenu", (e) => {
          const menu = new Menu();
          menu.addItem(i => i.setTitle("Open note").setIcon("file-text")
            .onClick(() => this.recipeManager.openRecipeNote(recipe)));
          menu.addItem(i => i.setTitle("Delete recipe").setIcon("trash")
            .onClick(async () => {
              await this.recipeManager.deleteRecipe(recipe);
              this.allRecipes = await this.recipeManager.getAllRecipes();
              renderList(searchInput.value);
            }));
          menu.showAtMouseEvent(e);
        });
      }
    };

    searchInput.addEventListener("input", () => renderList(searchInput.value));
    renderList("");
  }

  async onClose(): Promise<void> {
    this.containerEl.children[1].empty();
  }
}
