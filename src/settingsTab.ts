import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type MealPlannerPlugin from "./main";
import type { MealSlot } from "./types";

export class MealPlannerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MealPlannerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Meal Planner" });

    // ── Recipe folder ────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Recipe folder")
      .setDesc("Vault folder where recipe notes are stored. Created automatically if it doesn't exist.")
      .addText(t => t
        .setPlaceholder("Recipes")
        .setValue(this.plugin.settings.recipeFolder)
        .onChange(async v => {
          this.plugin.settings.recipeFolder = v || "Recipes";
          await this.plugin.saveData();
        })
      );

    // ── Daily notes ──────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Daily note folder")
      .setDesc("Folder where your daily notes live. Used to find today's note.")
      .addText(t => t
        .setPlaceholder("Daily Notes")
        .setValue(this.plugin.settings.dailyNoteFolder)
        .onChange(async v => {
          this.plugin.settings.dailyNoteFolder = v || "Daily Notes";
          await this.plugin.saveData();
        })
      );

    new Setting(containerEl)
      .setName("Meals section heading")
      .setDesc("The heading used when inserting meals into daily notes.")
      .addText(t => t
        .setPlaceholder("Meals")
        .setValue(this.plugin.settings.dailyNoteSectionHeading)
        .onChange(async v => {
          this.plugin.settings.dailyNoteSectionHeading = v || "Meals";
          await this.plugin.saveData();
        })
      );

    new Setting(containerEl)
      .setName("Auto-update daily note on open")
      .setDesc("Automatically inject/update the Meals section when you open today's daily note.")
      .addToggle(t => t
        .setValue(this.plugin.settings.autoUpdateDailyNote)
        .onChange(async v => {
          this.plugin.settings.autoUpdateDailyNote = v;
          await this.plugin.saveData();
        })
      );

    // Boundary-based insertion toggle (no markers) – defaulted on
    new Setting(containerEl)
      .setName("Boundary-based daily note insertion")
      .setDesc("Use a boundary-based insertion (no markers) to replace only the meal block under the configured heading. This makes daily notes cleaner while keeping updates automatic.")
      .addToggle(t => t
        .setValue(this.plugin.settings.boundaryInsertion ?? true)
        .onChange(async v => {
          this.plugin.settings.boundaryInsertion = v;
          await this.plugin.saveData();
        })
      );

    // ── Kitchen inventory sync ─────────────────────────────────────────────
    new Setting(containerEl).setHeading().setName("Kitchen inventory sync");
    new Setting(containerEl)
      .setName("Kitchen inventory note")
      .setDesc("Vault note basename (no .md) used as the pantry mirror. Import reads checked items into the pantry and unchecked ones into the shopping list; Export writes the pantry back under a plugin-owned section.")
      .addText(t => t
        .setPlaceholder("Kitchen Inventory")
        .setValue(this.plugin.settings.kitchenInventoryNote)
        .onChange(async v => {
          this.plugin.settings.kitchenInventoryNote = v || "Kitchen Inventory";
          await this.plugin.saveData();
        })
      );
    new Setting(containerEl)
      .setName("Auto-export pantry to note")
      .setDesc("After any pantry change, debounce-export the pantry into the kitchen inventory note (plugin-owned section).")
      .addToggle(t => t
        .setValue(this.plugin.settings.autoSyncKitchenInventory ?? false)
        .onChange(async v => {
          this.plugin.settings.autoSyncKitchenInventory = v;
          await this.plugin.saveData();
        })
      );

    // ── Meal slots ───────────────────────────────────────────────────────
    new Setting(containerEl).setHeading().setName("Meal slots");
    containerEl.createEl("p", {
      text: "Define the meal slots for each day. Drag to reorder, or delete and recreate.",
      cls: "setting-item-description",
    });

    const slotsContainer = containerEl.createDiv({ cls: "meal-planner-slots-container" });
    this.renderSlots(slotsContainer);

    new Setting(containerEl)
      .addButton(btn => btn
        .setButtonText("Add meal slot")
        .onClick(async () => {
          const newSlot: MealSlot = {
            id: `slot_${Date.now()}`,
            label: "New slot",
            order: this.plugin.settings.mealSlots.length,
          };
          this.plugin.settings.mealSlots.push(newSlot);
          await this.plugin.saveData();
          slotsContainer.empty();
          this.renderSlots(slotsContainer);
        })
      );
  }

  private renderSlots(container: HTMLElement): void {
    container.empty();
    const slots = [...this.plugin.settings.mealSlots].sort((a, b) => a.order - b.order);

    for (const slot of slots) {
      const row = new Setting(container)
        .setName("")
        .addText(t => t
          .setValue(slot.label)
          .setPlaceholder("Slot name")
          .onChange(async v => {
            slot.label = v;
            await this.plugin.saveData();
          })
        )
        .addExtraButton(btn => btn
          .setIcon("arrow-up")
          .setTooltip("Move up")
          .onClick(async () => {
            const idx = this.plugin.settings.mealSlots.findIndex(s => s.id === slot.id);
            if (idx > 0) {
              const prev = this.plugin.settings.mealSlots[idx - 1];
              [slot.order, prev.order] = [prev.order, slot.order];
              await this.plugin.saveData();
              container.empty();
              this.renderSlots(container);
            }
          })
        )
        .addExtraButton(btn => btn
          .setIcon("arrow-down")
          .setTooltip("Move down")
          .onClick(async () => {
            const idx = this.plugin.settings.mealSlots.findIndex(s => s.id === slot.id);
            if (idx < this.plugin.settings.mealSlots.length - 1) {
              const next = this.plugin.settings.mealSlots[idx + 1];
              [slot.order, next.order] = [next.order, slot.order];
              await this.plugin.saveData();
              container.empty();
              this.renderSlots(container);
            }
          })
        )
        .addExtraButton(btn => btn
          .setIcon("trash")
          .setTooltip("Delete slot")
          .onClick(async () => {
            this.plugin.settings.mealSlots = this.plugin.settings.mealSlots.filter(s => s.id !== slot.id);
            await this.plugin.saveData();
            container.empty();
            this.renderSlots(container);
          })
        );
    }
  }
}
