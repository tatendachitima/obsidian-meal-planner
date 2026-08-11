import { App } from "obsidian";
import type { PantryItem } from "./types";
import type { PantryManager } from "./pantryManager";
import { PantryEditModal } from "./pantryEditModal";
import type { KitchenInventorySync } from "./kitchenInventorySync";

export class PantryView {
  private pantrySelectedIds: Set<string> = new Set();
  // Helper to render inventory stats for a pantry item
  private getInventoryStats(it: PantryItem): string {
    const qp = it.quantityAtPurchase ?? it.quantity ?? 0;
    const qu = it.quantityUsed ?? 0;
    const qr = qp - qu;
    const pct = qp > 0 ? Math.max(0, Math.min(100, Math.round((qr / qp) * 100))) : 0;
    if (qp === 0) return "Inventory: 0";
    return `Purchased ${qp}${it.unit ?? ''} • Used ${qu}${it.unit ?? ''} • Remaining ${qr}${it.unit ?? ''} (${pct}%)`;
  }
  constructor(
    private app: App,
    private pantryManager: PantryManager,
    private kitchenSync?: KitchenInventorySync
  ) {}

  render(container: HTMLElement): void {
    container.empty();
    container.createEl("h3", { text: "Pantry" });

    // Phase 3: Move quick-add form above the list
    const form = container.createDiv({ cls: "meal-planner-pantry-form" });
    const nameInput = form.createEl("input", { type: "text", placeholder: "Item name" }) as HTMLInputElement;
    nameInput.setAttribute('aria-label', "Pantry item name");
    const qtyInput = form.createEl("input", { type: "number", placeholder: "Quantity" }) as HTMLInputElement;
    qtyInput.setAttribute('aria-label', "Pantry quantity");
    qtyInput.min = "0";
    qtyInput.step = "0.01";
    const unitInput = form.createEl("input", { type: "text", placeholder: "Unit (e.g. g, ml)" }) as HTMLInputElement;
    unitInput.setAttribute('aria-label', "Pantry unit");
    const addBtn = form.createEl("button", { text: "Add" });
    addBtn.addEventListener("click", () => {
      const name = (nameInput as HTMLInputElement).value.trim();
      const qty = parseFloat((qtyInput as HTMLInputElement).value) || 0;
      const unit = (unitInput as HTMLInputElement).value.trim();
      if (!name) return;
      const item: PantryItem = {
        id: `pantry_${Date.now()}`,
        name,
        quantity: qty,
        unit: unit || undefined,
        location: undefined,
        category: undefined,
        expiry: undefined,
        brand: undefined,
        purchaseDate: undefined,
      } as any;
      this.pantryManager.addPantryItem(item).then(() => this.render(container));
    });

    const list = container.createDiv({ cls: "meal-planner-pantry-list" });
    const items = this.pantryManager.getAllPantryItems();
    for (const it of items) {
      const card = list.createDiv({ cls: "meal-planner-pantry-card" });
      const header = card.createDiv({ cls: "meal-planner-pantry-card__header" });
      // Bulk selection checkbox per item (Phase 2)
      const select = header.createEl("input", { type: "checkbox", cls: "meal-planner-pantry-card__select" }) as HTMLInputElement;
      // Reflect current selection state (preserved across renders)
      select.checked = this.pantrySelectedIds.has(it.id);
      select.addEventListener("change", () => {
        if (select.checked) this.pantrySelectedIds.add(it.id);
        else this.pantrySelectedIds.delete(it.id);
        // Trigger re-render to reflect bulk toolbar visibility
        this.render(container);
      });
      header.appendChild(document.createTextNode(" "));
      header.appendChild(select as any);
      header.appendChild(document.createTextNode(" "));
      header.createSpan({ text: it.name, cls: "meal-planner-pantry-card__name" });
      // Status dot indicating expiry proximity or health of item
      const statusDot = header.createEl("span", { cls: "meal-planner-pantry-card__status" }) as HTMLSpanElement;
      statusDot.style.display = "inline-block";
      statusDot.style.width = "10px";
      statusDot.style.height = "10px";
      statusDot.style.borderRadius = "50%";
      statusDot.style.marginLeft = "6px";
      // Default color: neutral
      statusDot.style.background = "#9e9e9e";
      if (it.expiry) {
        const diffDays = Math.ceil((new Date(it.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7) {
          statusDot.style.background = "#f5c542"; // warning color
        } else {
          statusDot.style.background = "#4caf50"; // healthy color
        }
      }

      const meta = card.createDiv({ cls: "meal-planner-pantry-card__meta" });
      meta.createSpan({ text: `${it.quantity ?? 0}${it.unit ?? ''}`, cls: "meal-planner-pantry-card__qty" });
      // Inventory stats (Phase 3): quantity at purchase, used, remaining, and percent
      meta.createSpan({ text: this.getInventoryStats(it), cls: "meal-planner-pantry-card__inventory" });
      // Expiry badge (within 7 days)
      if (it.expiry) {
        const now = new Date();
        const diffDays = Math.ceil((new Date(it.expiry).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7) {
          meta.createSpan({ text: `Expiry in ${diffDays}d`, cls: "meal-planner-pantry-card__badge" });
        }
      }

      const extras = card.createDiv({ cls: "meal-planner-pantry-card__extras" });
      if (it.location) extras.createSpan({ text: it.location, cls: "meal-planner-pantry-card__extra" });
      if (it.brand) extras.createSpan({ text: it.brand, cls: "meal-planner-pantry-card__extra" });

      const actions = card.createDiv({ cls: "meal-planner-pantry-card__actions" });
      const editBtn = actions.createEl("button", { text: "Edit", cls: "meal-planner-pantry-card__action" }) as HTMLButtonElement;
      editBtn.setAttribute('aria-label', `Edit pantry item ${it.name}`);
      editBtn.addEventListener("click", () => {
        const modal = new PantryEditModal(this.app, this.pantryManager, it, async () => {
          await this.render(container);
        });
        modal.open();
      });
      const delBtn = actions.createEl("button", { text: "Delete", cls: "meal-planner-pantry-card__action" }) as HTMLButtonElement;
      delBtn.setAttribute('aria-label', `Delete pantry item ${it.name}`);
      delBtn.addEventListener("click", () => {
        if (!it.id) return;
        this.pantryManager.deletePantryItem(it.id).then(() => this.render(container));
      });
    }

    // Bulk actions and Import/Export controls (Phase 2)
    if (this.pantrySelectedIds.size > 0) {
      const bulkActions = container.createDiv({ cls: "meal-planner-pantry-bulk-actions" });
      bulkActions.createEl("button", { text: "Export Selected CSV", cls: "mod-cta" })
        .addEventListener("click", () => this.exportPantryCSV(Array.from(this.pantrySelectedIds)));
      bulkActions.createEl("button", { text: "Delete Selected", cls: "mod-cta" })
        .addEventListener("click", async () => {
          for (const id of Array.from(this.pantrySelectedIds)) {
            await this.pantryManager.deletePantryItem(id);
          }
          this.pantrySelectedIds.clear();
          this.render(container);
        });
      bulkActions.createEl("button", { text: "Clear Selection", cls: "mod-cta" })
        .addEventListener("click", () => { this.pantrySelectedIds.clear(); this.render(container); });
    }

    // Import CSV UI (Phase 2)
    const importRow = container.createDiv({ cls: "meal-planner-pantry-import" });
    const importBtn = importRow.createEl("button", { text: "Import CSV", cls: "mod-cta" });
    let fileInput: HTMLInputElement | null = null;
    importBtn.addEventListener("click", () => {
      if (!fileInput) {
        fileInput = importRow.createEl("input", { attr: { type: "file", accept: ".csv" } });
        fileInput.style.display = "none";
        fileInput.addEventListener("change", async () => {
          const f = fileInput?.files?.[0];
          if (!f) return;
          const text = await f.text();
          await this.importPantryFromCSV(text);
          this.render(container);
        });
      }
      fileInput.click();
    });
    

    // Kitchen Inventory note sync (import/export)
    const syncRow = container.createDiv({ cls: "meal-planner-pantry-import" });
    const importNoteBtn = syncRow.createEl("button", { text: "Import from note", cls: "mod-cta" }) as HTMLButtonElement;
    importNoteBtn.setAttribute("aria-label", "Import pantry items from the kitchen inventory note");
    importNoteBtn.addEventListener("click", async () => {
      await this.kitchenSync?.importFromNote();
      this.render(container);
    });
    const exportNoteBtn = syncRow.createEl("button", { text: "Export to note", cls: "mod-cta" }) as HTMLButtonElement;
    exportNoteBtn.setAttribute("aria-label", "Export pantry items to the kitchen inventory note");
    exportNoteBtn.addEventListener("click", async () => {
      await this.kitchenSync?.exportToNote();
    });

    // (Phase 3) Note: older quick add form block removed to avoid duplicates. Use the new header-placed form above the list.

  } // end render method

  // Phase 3: Inventory export/import helpers (within class)
  private exportPantryCSV(ids: string[]): void {
    // export selected pantry items as CSV
    const items = this.pantryManager.getAllPantryItems().filter(p => ids.includes(p.id));
    const header = ['id','name','quantity','unit','location','expiry','brand','purchaseDate'].join(',');
    const rows = items.map(it => [it.id, it.name, it.quantity, it.unit ?? '', it.location ?? '', it.expiry ?? '', it.brand ?? '', it.purchaseDate ?? ''].map(v => String(v).replace(/"/g, '""')).join(','));
    const csv = header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pantry_selected.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private async importPantryFromCSV(text: string): Promise<void> {
    if (!text) return;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 1) return;
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const idx: any = {
      id: header.indexOf('id'),
      name: header.indexOf('name'),
      quantity: header.indexOf('quantity'),
      unit: header.indexOf('unit'),
      location: header.indexOf('location'),
      expiry: header.indexOf('expiry'),
      brand: header.indexOf('brand'),
      purchaseDate: header.indexOf('purchaseDate'),
    };
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim());
      const item: PantryItem = {
        id: parts[idx.id] || `pantry_import_${i}`,
        name: parts[idx.name] ?? '',
        quantity: parts[idx.quantity] ? Number(parts[idx.quantity]) : 0,
        unit: parts[idx.unit] || undefined,
        location: parts[idx.location] || undefined,
        expiry: parts[idx.expiry] || undefined,
        brand: parts[idx.brand] || undefined,
        purchaseDate: parts[idx.purchaseDate] || undefined
      } as PantryItem;
      if (item.name) {
        await this.pantryManager.addPantryItem(item);
      }
    }
  }
}
