import { App, Modal, Notice, Setting } from "obsidian";
import type { RecipeManager, ManualRecipeFields } from "./recipeManager";
import type { Recipe } from "./types";

export class NewRecipeModal extends Modal {
  private fields: ManualRecipeFields = {
    name: "",
    description: "",
    ingredients: "",
    instructions: "",
    tags: "",
    prepTime: 0,
    cookTime: 0,
    servings: 0,
  };

  constructor(
    app: App,
    private recipeManager: RecipeManager,
    private onCreated: (recipe: Recipe) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("meal-planner-new-recipe-modal");

    contentEl.createEl("h2", { text: "New recipe" });

    new Setting(contentEl)
      .setName("Name")
      .setDesc("Recipe title")
      .addText(t => t
        .setPlaceholder("Roast chicken")
        .onChange(v => { this.fields.name = v; })
      );

    new Setting(contentEl)
      .setName("Description")
      .setDesc("Short description (optional)")
      .addText(t => t
        .setPlaceholder("A classic Sunday roast…")
        .onChange(v => { this.fields.description = v; })
      );

    new Setting(contentEl)
      .setName("Ingredients")
      .setDesc("One ingredient per line")
      .addTextArea(t => {
        t.setPlaceholder("1 whole chicken\n2 tbsp olive oil\n…")
          .onChange(v => { this.fields.ingredients = v; });
        t.inputEl.rows = 6;
      });

    new Setting(contentEl)
      .setName("Instructions")
      .setDesc("One step per line")
      .addTextArea(t => {
        t.setPlaceholder("Preheat oven to 200°C.\nPat chicken dry…")
          .onChange(v => { this.fields.instructions = v; });
        t.inputEl.rows = 6;
      });

    new Setting(contentEl)
      .setName("Tags")
      .setDesc("Comma-separated (e.g. chicken, dinner, easy)")
      .addText(t => t
        .setPlaceholder("chicken, dinner")
        .onChange(v => { this.fields.tags = v; })
      );

    // Time / servings row
    new Setting(contentEl)
      .setName("Prep time (minutes)")
      .addText(t => t
        .setPlaceholder("15")
        .onChange(v => { this.fields.prepTime = parseInt(v) || 0; })
      );

    new Setting(contentEl)
      .setName("Cook time (minutes)")
      .addText(t => t
        .setPlaceholder("90")
        .onChange(v => { this.fields.cookTime = parseInt(v) || 0; })
      );

    new Setting(contentEl)
      .setName("Servings")
      .addText(t => t
        .setPlaceholder("4")
        .onChange(v => { this.fields.servings = parseInt(v) || 0; })
      );

    // Buttons
    const btnRow = contentEl.createDiv({ cls: "meal-planner-btn-row" });
    const saveBtn = btnRow.createEl("button", { text: "Save recipe", cls: "mod-cta" });
    saveBtn.addEventListener("click", () => this.save());

    btnRow.createEl("button", { text: "Cancel" })
      .addEventListener("click", () => this.close());
  }

  private async save(): Promise<void> {
    if (!this.fields.name.trim()) {
      new Notice("Recipe name is required.");
      return;
    }

    try {
      const recipe = await this.recipeManager.createRecipeManual(this.fields);
      new Notice(`Recipe "${recipe.name}" created.`);
      this.onCreated(recipe);
      this.close();
    } catch (err) {
      new Notice(`Failed to create recipe: ${err instanceof Error ? err.message : err}`);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
