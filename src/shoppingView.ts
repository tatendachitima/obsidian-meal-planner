import { App, normalizePath, TFile } from "obsidian";
import type { ShoppingListItem } from "./types";
import type { ShoppingListManager } from "./shoppingListManager";

export class ShoppingView {
  private currentView: 'week' | 'month' = 'week';
  constructor(private app: App, private shoppingListManager: ShoppingListManager) {}

  render(container: HTMLElement): void {
    container.empty();
    container.createEl("h3", { text: "Shopping" });

    // Simple two-tab switcher for Week/Month
    const header = container.createDiv({ cls: "meal-planner-shopping-header" });
    const weekBtn = header.createEl("button", { text: "Week", cls: this.currentView === 'week' ? 'is-active' : '' });
    const monthBtn = header.createEl("button", { text: "Month", cls: this.currentView === 'month' ? 'is-active' : '' });
    weekBtn.addEventListener("click", () => { this.currentView = 'week'; this.render(container); });
    monthBtn.addEventListener("click", () => { this.currentView = 'month'; this.render(container); });

    // Sub-view: list + add form for the selected period
    const content = container.createDiv({ cls: "meal-planner-shopping-content" });

    const addRow = content.createDiv({ cls: "meal-planner-shopping-add" });
    addRow.createEl("span", { text: "Add item:" });
    const nameInput = addRow.createEl("input", { placeholder: "Name" }) as HTMLInputElement;
    const qtyInput = addRow.createEl("input", { placeholder: "Qty", type: "number" }) as HTMLInputElement;
    qtyInput.min = "0";
    qtyInput.step = "0.01";
    const unitInput = addRow.createEl("input", { placeholder: "Unit" }) as HTMLInputElement;
    const periodSelect = addRow.createEl("select") as HTMLSelectElement;
    const optW = periodSelect.appendChild(document.createElement("option"));
    optW.value = 'week'; optW.text = 'Week';
    const optM = periodSelect.appendChild(document.createElement("option"));
    optM.value = 'month'; optM.text = 'Month';
    const addBtn = addRow.createEl("button", { text: "Add" }) as HTMLButtonElement;
    addBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const quantity = parseFloat(qtyInput.value) || 0;
      const unit = unitInput.value.trim();
      const period = periodSelect.value as 'week'|'month';
      const item: ShoppingListItem = {
        id: `shop_${Date.now()}`,
        name,
        quantity,
        unit: unit || undefined,
        period,
        sources: [],
        acquired: false,
      };
      this.shoppingListManager.addItem(item);
      // refresh
      this.render(container);
    });

    // Render list
    const listEl = content.createDiv({ cls: "meal-planner-shopping-list" });
    const list = this.currentView === 'week'
      ? this.shoppingListManager.getWeekList()
      : this.shoppingListManager.getMonthList();
    if (list.length === 0) {
      listEl.createEl("p", { text: "No items yet.", cls: "meal-planner-muted" });
    } else {
      const ul = listEl.createEl("ul");
      for (const it of list) {
        const li = ul.createEl("li");
        const textSpan = li.createEl("span");
        textSpan.textContent = it.name + (it.quantity ? `: ${it.quantity}${it.unit ?? ''}` : '');
        // quick actions per item
        const purchased = li.createEl("button") as HTMLButtonElement;
        purchased.setAttribute("aria-label", it.acquired ? "Unmark" : "Mark purchased");
        purchased.addEventListener("click", () => {
          this.shoppingListManager.markAcquired(it.id, it.period, !it.acquired);
          this.render(container);
        });
        const del = li.createEl("button", { text: "Delete" });
        del.addEventListener("click", () => {
          this.shoppingListManager.deleteItem(it.id, it.period);
          this.render(container);
        });
      }
    }
    // Consolidated export: single file with a period column (Export All)
    const exportAll = header.createEl("button", { text: "Export All (Week & Month)" });
    exportAll.addEventListener("click", async () => {
      // Build CSV data
      const week = this.shoppingListManager.getWeekList();
      const month = this.shoppingListManager.getMonthList();
      const csvHeader = ["Name", "Quantity", "Unit", "Acquired", "Period"];
      const lines = [csvHeader.join(",")];
      for (const it of week) lines.push([it.name, it.quantity ?? 0, it.unit ?? "", it.acquired ? 'true' : 'false', 'week'].join(","));
      for (const it of month) lines.push([it.name, it.quantity ?? 0, it.unit ?? "", it.acquired ? 'true' : 'false', 'month'].join(","));
      const csv = lines.join("\n");

      // Persist to a single file in an Exports folder
      const folderName = "Exports";
      const folderPath = normalizePath(folderName);
      if (!this.app.vault.getAbstractFileByPath(folderPath)) {
        await this.app.vault.createFolder(folderPath);
      }
      const filePath = normalizePath(`${folderName}/Shopping_All.csv`);
      const existing = this.app.vault.getAbstractFileByPath(filePath);
      if (existing && existing instanceof TFile) {
        await this.app.vault.modify(existing as any, csv);
      } else {
        await this.app.vault.create(filePath, csv);
      }
      alert("Shopping export written to " + filePath);
    });
  }
}
