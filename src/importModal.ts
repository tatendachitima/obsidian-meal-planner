import { App, Modal, Notice, Setting, TextComponent } from "obsidian";
import { fetchAndParseRecipe, type ParsedRecipeData } from "./recipeParser";
import type { RecipeManager } from "./recipeManager";
import type { Recipe } from "./types";

export class ImportRecipeModal extends Modal {
  private url = "";
  private parsed: ParsedRecipeData | null = null;
  private onImported: (recipe: Recipe) => void;
  private recipeManager: RecipeManager;

  // UI state
  private urlSetting: Setting | null = null;
  private previewEl: HTMLElement | null = null;
  private importBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(app: App, recipeManager: RecipeManager, onImported: (recipe: Recipe) => void) {
    super(app);
    this.recipeManager = recipeManager;
    this.onImported = onImported;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("meal-planner-import-modal");

    contentEl.createEl("h2", { text: "Import recipe from URL" });
    contentEl.createEl("p", {
      text: "Paste a recipe URL from any site. The plugin will extract the recipe details automatically.",
      cls: "meal-planner-muted",
    });

    // URL input row
    this.urlSetting = new Setting(contentEl)
      .setName("Recipe URL")
      .setDesc("e.g. https://www.bbcgoodfood.com/recipes/...")
      .addText(text => {
        text
          .setPlaceholder("https://...")
          .onChange(val => { this.url = val.trim(); });

        // Allow pressing Enter to fetch
        text.inputEl.addEventListener("keydown", async (e) => {
          if (e.key === "Enter") await this.fetchRecipe();
        });
      })
      .addButton(btn => {
        btn
          .setButtonText("Fetch")
          .setCta()
          .onClick(() => this.fetchRecipe());
      });

    // Status line (loading indicator / errors)
    this.statusEl = contentEl.createEl("p", { cls: "meal-planner-status" });
    this.statusEl.style.display = "none";

    // Preview area (shown after successful fetch)
    this.previewEl = contentEl.createDiv({ cls: "meal-planner-preview" });
    this.previewEl.style.display = "none";

    // Import button (initially hidden)
    const btnRow = contentEl.createDiv({ cls: "meal-planner-btn-row" });
    this.importBtn = btnRow.createEl("button", {
      text: "Save to vault",
      cls: "mod-cta",
    });
    this.importBtn.style.display = "none";
    this.importBtn.addEventListener("click", () => this.saveRecipe());

    btnRow.createEl("button", {
      text: "Cancel",
    }).addEventListener("click", () => this.close());
  }

  private async fetchRecipe(): Promise<void> {
    if (!this.url) {
      this.showStatus("Please enter a URL.", "error");
      return;
    }
    if (!this.url.startsWith("http")) {
      this.showStatus("URL must start with http:// or https://", "error");
      return;
    }

    this.showStatus("Fetching recipe…", "loading");
    this.previewEl!.style.display = "none";
    this.importBtn!.style.display = "none";
    this.parsed = null;

    try {
      this.parsed = await fetchAndParseRecipe(this.url);
      this.showStatus("", "");
      this.renderPreview(this.parsed);
      this.importBtn!.style.display = "inline-block";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.showStatus(`Error: ${msg}`, "error");
    }
  }

  private renderPreview(data: ParsedRecipeData): void {
    const el = this.previewEl!;
    el.empty();
    el.style.display = "block";

    el.createEl("h3", { text: data.name });

    if (data.description) {
      el.createEl("p", { text: data.description, cls: "meal-planner-muted" });
    }

    // Meta row
    const meta = el.createDiv({ cls: "meal-planner-meta" });
    if (data.prepTime) meta.createSpan({ text: `Prep: ${data.prepTime}m` });
    if (data.cookTime) meta.createSpan({ text: `Cook: ${data.cookTime}m` });
    if (data.servings) meta.createSpan({ text: `Serves: ${data.servings}` });

    // Ingredients preview (first 6)
    if (data.ingredients.length > 0) {
      el.createEl("strong", { text: `Ingredients (${data.ingredients.length})` });
      const ul = el.createEl("ul");
      const previewIngredients = data.ingredients.slice(0, 6);
      for (const ing of previewIngredients) {
        const parts = [ing.amount, ing.unit, ing.name].filter(Boolean).join(" ");
        ul.createEl("li", { text: parts });
      }
      if (data.ingredients.length > 6) {
        ul.createEl("li", {
          text: `…and ${data.ingredients.length - 6} more`,
          cls: "meal-planner-muted",
        });
      }
    }

    // Tags
    if (data.tags.length > 0) {
      const tagRow = el.createDiv({ cls: "meal-planner-tag-row" });
      for (const tag of data.tags.slice(0, 8)) {
        tagRow.createSpan({ text: tag, cls: "meal-planner-tag" });
      }
    }
  }

  private async saveRecipe(): Promise<void> {
    if (!this.parsed) return;

    this.importBtn!.disabled = true;
    this.importBtn!.textContent = "Saving…";

    try {
      const recipe = await this.recipeManager.createRecipeFromParsed(this.parsed);
      new Notice(`Recipe "${recipe.name}" saved to vault.`);
      this.onImported(recipe);
      this.close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.showStatus(`Failed to save: ${msg}`, "error");
      this.importBtn!.disabled = false;
      this.importBtn!.textContent = "Save to vault";
    }
  }

  private showStatus(msg: string, type: "loading" | "error" | ""): void {
    const el = this.statusEl!;
    el.textContent = msg;
    el.className = "meal-planner-status";
    if (type) el.addClass(`meal-planner-status--${type}`);
    el.style.display = msg ? "block" : "none";
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
