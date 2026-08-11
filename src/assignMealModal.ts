import { App, Modal, Setting, Notice, TextComponent } from "obsidian";
import type { RecipeManager } from "./recipeManager";
import type { MealPlanManager } from "./mealPlanManager";
import type { MealSlot, Recipe, MealEntry } from "./types";
import { formatShortDate } from "./mealPlanManager";

export class AssignMealModal extends Modal {
  private searchQuery = "";
  private allRecipes: Recipe[] = [];
  private filteredRecipes: Recipe[] = [];
  private selectedRecipe: Recipe | null = null;
  private selectedRecipes: Recipe[] = [];

  private listEl: HTMLElement | null = null;
  private confirmBtn: HTMLButtonElement | null = null;
  private noteInput: TextComponent | null = null;
  private note = "";

  constructor(
    app: App,
    private recipeManager: RecipeManager,
    private mealPlanManager: MealPlanManager,
    private dateStr: string,
    private slot: MealSlot,
    private onAssigned: () => void,
    private appendMode = false
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("meal-planner-assign-modal");

    const heading = this.appendMode 
      ? `Add to ${this.slot.label} · ${formatShortDate(this.dateStr)}`
      : `${this.slot.label} · ${formatShortDate(this.dateStr)}`;
    contentEl.createEl("h2", { text: heading });

    const existingEntries = this.mealPlanManager.getEntries(this.dateStr, this.slot.id);
    if (existingEntries.length > 0 && !this.appendMode) {
      const info = contentEl.createDiv({ cls: "meal-planner-muted" });
      info.style.marginBottom = "10px";
      info.style.fontSize = "var(--font-smaller)";
      info.textContent = `Current: ${existingEntries.map(e => e.recipeName).join(", ")}`;
    }

    new Setting(contentEl)
      .setName("Search recipes")
      .addText(t => {
        t.setPlaceholder("Type to filter…")
          .onChange(v => {
            this.searchQuery = v.toLowerCase();
            this.renderList();
          });
        setTimeout(() => t.inputEl.focus(), 50);
      });

    this.listEl = contentEl.createDiv({ cls: "meal-planner-recipe-list" });

    new Setting(contentEl)
      .setName("Note")
      .setDesc("Optional — e.g. 'use leftover chicken'")
      .addText(t => {
        this.noteInput = t;
        t.setPlaceholder("(optional)").onChange(v => { this.note = v; });
      });

    const btnRow = contentEl.createDiv({ cls: "meal-planner-btn-row" });
    
    if (this.appendMode) {
      this.confirmBtn = btnRow.createEl("button", {
        text: "Add Recipe",
        cls: "mod-cta",
      });
      this.confirmBtn.disabled = true;
      this.confirmBtn.addEventListener("click", () => this.addRecipe());
    } else {
      this.confirmBtn = btnRow.createEl("button", {
        text: "Assign",
        cls: "mod-cta",
      });
      this.confirmBtn.disabled = true;
      this.confirmBtn.addEventListener("click", () => this.assign());
    }

    btnRow.createEl("button", { text: "Cancel" })
      .addEventListener("click", () => this.close());

    this.allRecipes = await this.recipeManager.getAllRecipes();
    this.filteredRecipes = this.allRecipes;
    this.renderList();
  }

  private renderList(): void {
    const el = this.listEl!;
    el.empty();

    this.filteredRecipes = this.searchQuery
      ? this.allRecipes.filter(r =>
          r.name.toLowerCase().includes(this.searchQuery) ||
          r.tags.some(t => t.toLowerCase().includes(this.searchQuery))
        )
      : this.allRecipes;

    if (this.filteredRecipes.length === 0) {
      el.createEl("p", {
        text: this.allRecipes.length === 0
          ? "No recipes in vault. Import or create one first."
          : "No recipes match your search.",
        cls: "meal-planner-muted",
      });
      return;
    }

    for (const recipe of this.filteredRecipes) {
      const row = el.createDiv({ cls: "meal-planner-recipe-row" });

      const isSelected = this.selectedRecipes.some(r => r.id === recipe.id);
      if (isSelected) row.addClass("is-selected");

      const nameEl = row.createSpan({ text: recipe.name, cls: "meal-planner-recipe-row__name" });

      if (recipe.tags.length > 0) {
        const tagRow = row.createDiv({ cls: "meal-planner-tag-row" });
        for (const tag of recipe.tags.slice(0, 4)) {
          tagRow.createSpan({ text: tag, cls: "meal-planner-tag" });
        }
      }

      if (recipe.prepTime || recipe.cookTime) {
        const total = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);
        row.createSpan({ text: `${total}m`, cls: "meal-planner-recipe-row__time meal-planner-muted" });
      }

      row.addEventListener("click", () => {
        if (this.appendMode) {
          if (this.selectedRecipes.some(r => r.id === recipe.id)) {
            this.selectedRecipes = this.selectedRecipes.filter(r => r.id !== recipe.id);
          } else {
            this.selectedRecipes.push(recipe);
          }
          this.renderList();
          this.confirmBtn!.disabled = this.selectedRecipes.length === 0;
        } else {
          el.querySelectorAll(".meal-planner-recipe-row").forEach(r =>
            r.removeClass("is-selected")
          );
          row.addClass("is-selected");
          this.selectedRecipe = recipe;
          this.selectedRecipes = [recipe];
          this.confirmBtn!.disabled = false;
        }
      });

      row.addEventListener("dblclick", () => {
        if (this.appendMode) {
          this.selectedRecipes = [recipe];
          this.addRecipe();
        } else {
          this.selectedRecipe = recipe;
          this.assign();
        }
      });
    }
  }

  private async addRecipe(): Promise<void> {
    if (this.selectedRecipes.length === 0) return;

    for (const recipe of this.selectedRecipes) {
      await this.mealPlanManager.addEntry({
        dateStr: this.dateStr,
        slotId: this.slot.id,
        recipeId: recipe.id,
        recipeName: recipe.name,
        recipeFilePath: recipe.filePath,
        note: this.note || undefined,
      });
    }

    new Notice(`${this.selectedRecipes.length} recipe(s) added to ${this.slot.label}.`);
    this.onAssigned();
    this.close();
  }

  private async assign(): Promise<void> {
    if (!this.selectedRecipe) return;

    await this.mealPlanManager.setEntries(this.dateStr, this.slot.id, [{
      dateStr: this.dateStr,
      slotId: this.slot.id,
      recipeId: this.selectedRecipe.id,
      recipeName: this.selectedRecipe.name,
      recipeFilePath: this.selectedRecipe.filePath,
      note: this.note || undefined,
    }]);

    new Notice(`${this.slot.label}: ${this.selectedRecipe.name} — assigned.`);
    this.onAssigned();
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
