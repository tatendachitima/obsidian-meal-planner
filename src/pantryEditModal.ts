import { App, Modal, Setting } from "obsidian";
import type { PantryItem } from "./types";
import type { PantryManager } from "./pantryManager";

export class PantryEditModal extends Modal {
  private nameInput: HTMLInputElement | null = null;
  private qtyInput: HTMLInputElement | null = null;
  private unitInput: HTMLInputElement | null = null;
  private locationInput: HTMLInputElement | null = null;
  private categoryInput: HTMLInputElement | null = null;
  private expiryInput: HTMLInputElement | null = null;
  private brandInput: HTMLInputElement | null = null;
  private purchaseDateInput: HTMLInputElement | null = null;

  constructor(
    app: App,
    private pantryManager: PantryManager,
    private item: PantryItem,
    private onSaved: () => Promise<void>
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: `Edit Pantry Item` });

    // Simple form using DOM elements for a stable UX
    const container = contentEl.createDiv({ cls: "pantry-edit-form" });

    // Name
    const nameLabel = container.createEl("label");
    nameLabel.textContent = "Name";
    this.nameInput = container.createEl("input", { type: "text" }) as HTMLInputElement;
    this.nameInput.value = this.item.name;

    // Quantity
    const qtyLabel = container.createEl("label");
    qtyLabel.textContent = "Quantity";
    this.qtyInput = container.createEl("input", { type: "number" }) as HTMLInputElement;
    this.qtyInput.value = String(this.item.quantity ?? 0);
    this.qtyInput.min = "0";
    this.qtyInput.step = "0.01";

    // Unit
    const unitLabel = container.createEl("label");
    unitLabel.textContent = "Unit";
    this.unitInput = container.createEl("input", { type: "text" }) as HTMLInputElement;
    this.unitInput.value = this.item.unit ?? "";

    // Location
    const locLabel = container.createEl("label");
    locLabel.textContent = "Location";
    this.locationInput = container.createEl("input", { type: "text" }) as HTMLInputElement;
    this.locationInput.value = this.item.location ?? "";

    // Category
    const catLabel = container.createEl("label");
    catLabel.textContent = "Category";
    this.categoryInput = container.createEl("input", { type: "text" }) as HTMLInputElement;
    this.categoryInput.value = this.item.category ?? "";

    // Expiry
    const expLabel = container.createEl("label");
    expLabel.textContent = "Expiry";
    this.expiryInput = container.createEl("input", { type: "date" }) as HTMLInputElement;
    this.expiryInput.value = this.item.expiry ?? "";

    // Brand
    const brandLabel = container.createEl("label");
    brandLabel.textContent = "Brand";
    this.brandInput = container.createEl("input", { type: "text" }) as HTMLInputElement;
    this.brandInput.value = this.item.brand ?? "";

    // Purchase date
    const purLabel = container.createEl("label");
    purLabel.textContent = "Purchase Date";
    this.purchaseDateInput = container.createEl("input", { type: "date" }) as HTMLInputElement;
    this.purchaseDateInput.value = this.item.purchaseDate ?? "";

    // Save/Cancel
    const btnRow = contentEl.createDiv({ cls: "meal-planner-btn-row" });
    const saveBtn = btnRow.createEl("button", { text: "Save", cls: "mod-cta" });
    saveBtn.addEventListener("click", async () => {
      const updated: PantryItem = {
        ...this.item,
        name: this.nameInput ? this.nameInput.value.trim() : this.item.name,
        quantity: this.qtyInput ? parseFloat(this.qtyInput.value) : this.item.quantity,
        unit: this.unitInput ? this.unitInput.value.trim() : this.item.unit,
        location: this.locationInput ? this.locationInput.value.trim() : this.item.location,
        category: this.categoryInput ? this.categoryInput.value.trim() : this.item.category,
        expiry: this.expiryInput ? this.expiryInput.value : this.item.expiry,
        brand: this.brandInput ? this.brandInput.value.trim() : this.item.brand,
        purchaseDate: this.purchaseDateInput ? this.purchaseDateInput.value : this.item.purchaseDate,
      };
      await this.pantryManager.updatePantryItem(updated);
      await this.onSaved();
      this.close();
    });
    btnRow.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
  }
}
