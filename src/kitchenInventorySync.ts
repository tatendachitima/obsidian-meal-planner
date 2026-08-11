import { App, Notice, TFile, normalizePath } from "obsidian";
import type { MealPlannerSettings, PantryItem, ShoppingListItem } from "./types";
import type { PantryManager } from "./pantryManager";
import type { ShoppingListManager } from "./shoppingListManager";

/** Kitchen Inventory note ↔ pantry sync.
 *  The plugin owns data.json (in-memory); the note is the human-friendly mirror.
 *  - Import: checked note lines (- [x]) → pantry items (merge by name); unchecked (- [ ]) → shopping list (week).
 *  - Export: pantry → a plugin-owned "## 🧺 Meal Planner Pantry" section in the note (never clobbers the rest). */
export class KitchenInventorySync {
  constructor(
    private app: App,
    private settings: MealPlannerSettings,
    private pantryManager: PantryManager,
    private shoppingListManager: ShoppingListManager
  ) {}

  notePath(): string {
    const base = (this.settings.kitchenInventoryNote || "Kitchen Inventory").trim();
    return normalizePath(base.endsWith(".md") ? base : `${base}.md`);
  }

  async noteFile(): Promise<TFile | null> {
    const f = this.app.vault.getAbstractFileByPath(this.notePath());
    return f instanceof TFile ? f : null;
  }

  // ─── Parsing ─────────────────────────────────────────────────────────────

  parseNote(md: string): { have: ParsedItem[]; need: ParsedItem[] } {
    const have: ParsedItem[] = [];
    const need: ParsedItem[] = [];
    let inFrontmatter = false;
    let section = "";
    for (const raw of md.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith("---")) { inFrontmatter = !inFrontmatter; continue; }
      if (inFrontmatter) continue;
      const heading = line.match(/^#{1,6}\s+(.+)$/);
      if (heading) { section = heading[1].trim(); continue; }
      const cb = line.match(/^[-*]\s+\[( |x|X)\]\s+(.+)$/);
      if (!cb) continue;
      const checked = cb[1].toLowerCase() === "x";
      const item = this.parseItemText(cb[2]);
      item.location = item.location || section || undefined;
      (checked ? have : need).push(item);
    }
    return { have, need };
  }

  private parseItemText(text: string): ParsedItem {
    // "Rice — 2 kg" | "Rice - 2kg" | "Rice: 500 g" | "Rice"
    const m = text.match(/^(.+?)\s*(?:—|–|-|:)\s*([\d.,]+\s*[a-zA-Z%]*|[\d.,]+)\s*$/);
    if (m) {
      const name = m[1].trim();
      const qtyMatch = m[2].trim().match(/^([\d.,]+)\s*([a-zA-Z%]*)$/);
      if (qtyMatch) {
        return {
          name,
          quantity: parseFloat(qtyMatch[1].replace(",", ".")),
          unit: qtyMatch[2] || undefined,
        };
      }
    }
    return { name: text.trim() };
  }

  // ─── Import: note → pantry (+ needs → shopping list) ────────────────────

  async importFromNote(): Promise<void> {
    const file = await this.noteFile();
    if (!file) {
      new Notice(`Meal Planner: kitchen inventory note not found (${this.notePath()})`);
      return;
    }
    const md = await this.app.vault.read(file);
    const { have, need } = this.parseNote(md);
    let added = 0, updated = 0;
    for (const item of have) {
      const existing = this.pantryManager.getAllPantryItems().find(
        p => p.name.toLowerCase() === item.name.toLowerCase()
      );
      if (existing) {
        if (item.quantity != null) existing.quantity = item.quantity;
        if (item.unit) existing.unit = item.unit;
        if (item.location) existing.location = item.location;
        await this.pantryManager.updatePantryItem(existing);
        updated++;
      } else {
        const p: PantryItem = {
          id: `pantry_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: item.name,
          quantity: item.quantity ?? 0,
          unit: item.unit,
          location: item.location,
        } as PantryItem;
        await this.pantryManager.addPantryItem(p);
        added++;
      }
    }
    let needs = 0;
    for (const item of need) {
      const s: ShoppingListItem = {
        id: `debt_${Date.now()}_${item.name.replace(/\s+/g, "_")}`,
        name: item.name,
        quantity: item.quantity ?? 1,
        unit: item.unit,
        period: "week",
        sources: ["Kitchen Inventory"],
        acquired: false,
      };
      await this.shoppingListManager.addOrUpdateItem(s);
      needs++;
    }
    new Notice(
      `Kitchen Inventory: imported ${added} new + ${updated} updated pantry items; ${needs} needs → shopping list`
    );
  }

  // ─── Export: pantry → note (plugin-owned section) ───────────────────────

  async exportToNote(): Promise<void> {
    const items = this.pantryManager.getAllPantryItems();
    const section = this.renderPantrySection(items);
    const file = await this.noteFile();
    if (!file) {
      const content = [
        "---",
        "title: Kitchen Inventory",
        "created: " + new Date().toISOString().slice(0, 10),
        "tags:",
        "  - home",
        "  - kitchen",
        "cssclasses: cards",
        "---",
        "",
        "# Kitchen Inventory",
        "",
        section,
        "",
      ].join("\n");
      await this.app.vault.create(this.notePath(), content);
      new Notice(`Meal Planner: created ${this.notePath()} with ${items.length} pantry items`);
      return;
    }
    const md = await this.app.vault.read(file);
    const updated = this.upsertSection(md, section);
    if (updated !== md) {
      await this.app.vault.modify(file, updated);
    }
    new Notice(`Meal Planner: exported ${items.length} pantry items to ${this.notePath()}`);
  }

  private renderPantrySection(items: PantryItem[]): string {
    const groups = new Map<string, PantryItem[]>();
    for (const it of items) {
      const key = it.location || "Pantry";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }
    const out: string[] = [
      "## 🧺 Meal Planner Pantry",
      "",
      "> Auto-synced from the Meal Planner plugin. Checked = in stock. Edit here and use Import to update the pantry.",
      "",
    ];
    for (const [loc, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      out.push(`### ${loc}`);
      for (const it of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
        const qty = it.quantity != null && it.quantity !== 0 ? ` — ${it.quantity}${it.unit ?? ""}` : "";
        out.push(`- [x] ${it.name}${qty}`);
      }
      out.push("");
    }
    return out.join("\n").trimEnd();
  }

  private upsertSection(md: string, section: string): string {
    const marker = "## 🧺 Meal Planner Pantry";
    const lines = md.split(/\r?\n/);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === marker) { start = i; break; }
    }
    if (start === -1) {
      return `${md.trimEnd()}\n\n${section}\n`;
    }
    // Section ends at the next H1/H2 heading (### groups belong to this section) or EOF
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^#{1,2}\s+/.test(lines[i].trim())) { end = i; break; }
    }
    const before = lines.slice(0, start);
    const after = lines.slice(end);
    return [...before, ...section.split("\n"), "", ...after].join("\n").trimEnd() + "\n";
  }

  // ─── Auto-export (debounced) ────────────────────────────────────────────

  private exportTimer: ReturnType<typeof setTimeout> | null = null;

  async autoExportIfEnabled(): Promise<void> {
    if (!this.settings.autoSyncKitchenInventory) return;
    if (this.exportTimer != null) clearTimeout(this.exportTimer);
    this.exportTimer = setTimeout(async () => {
      this.exportTimer = null;
      try {
        await this.exportToNote();
      } catch (e) {
        console.warn("Meal Planner: auto-export to kitchen inventory failed", e);
      }
    }, 1500);
  }

  clearPendingExport(): void {
    if (this.exportTimer != null) {
      clearTimeout(this.exportTimer);
      this.exportTimer = null;
    }
  }
}

interface ParsedItem {
  name: string;
  quantity?: number;
  unit?: string;
  location?: string;
}
