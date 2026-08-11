import type { MealEntry, MealPlan, MealSlot, MealPlannerSettings } from "./types";

export class MealPlanManager {
  constructor(
    private plan: MealPlan,
    private settings: MealPlannerSettings,
    private onSave: () => Promise<void>
  ) {}

  // ─── Entry key ─────────────────────────────────────────────────────────────

  private key(dateStr: string, slotId: string): string {
    return `${dateStr}__${slotId}`;
  }

  // ─── Reads ─────────────────────────────────────────────────────────────────

  getEntries(dateStr: string, slotId: string): MealEntry[] {
    return this.plan.entries[this.key(dateStr, slotId)] ?? [];
  }

  getEntriesForDate(dateStr: string): Map<string, MealEntry[]> {
    const result = new Map<string, MealEntry[]>();
    for (const slot of this.settings.mealSlots) {
      const entries = this.getEntries(dateStr, slot.id);
      if (entries.length > 0) result.set(slot.id, entries);
    }
    return result;
  }

  getEntriesForWeek(mondayDateStr: string): Map<string, Map<string, MealEntry[]>> {
    const result = new Map<string, Map<string, MealEntry[]>>();
    for (let i = 0; i < 7; i++) {
      const dateStr = addDays(mondayDateStr, i);
      result.set(dateStr, this.getEntriesForDate(dateStr));
    }
    return result;
  }

  // ─── Writes ────────────────────────────────────────────────────────────────

  async addEntry(entry: MealEntry): Promise<void> {
    const key = this.key(entry.dateStr, entry.slotId);
    if (!this.plan.entries[key]) {
      this.plan.entries[key] = [];
    }
    this.plan.entries[key].push(entry);
    await this.onSave();
  }

  async setEntries(dateStr: string, slotId: string, entries: MealEntry[]): Promise<void> {
    this.plan.entries[this.key(dateStr, slotId)] = entries;
    await this.onSave();
  }

  async clearEntry(dateStr: string, slotId: string): Promise<void> {
    delete this.plan.entries[this.key(dateStr, slotId)];
    await this.onSave();
  }

  async clearEntriesForDate(dateStr: string): Promise<void> {
    for (const slot of this.settings.mealSlots) {
      delete this.plan.entries[this.key(dateStr, slot.id)];
    }
    await this.onSave();
  }

  async removeEntry(dateStr: string, slotId: string, recipeId: string): Promise<void> {
    const key = this.key(dateStr, slotId);
    const entries = this.plan.entries[key];
    if (entries) {
      this.plan.entries[key] = entries.filter(e => e.recipeId !== recipeId);
      if (this.plan.entries[key].length === 0) {
        delete this.plan.entries[key];
      }
    }
    await this.onSave();
  }

  async moveEntry(fromDate: string, fromSlot: string, recipeId: string, toDate: string, toSlot: string): Promise<void> {
    const fromKey = this.key(fromDate, fromSlot);
    const entries = this.plan.entries[fromKey] ?? [];
    const idx = entries.findIndex(e => e.recipeId === recipeId);
    if (idx < 0) return;
    const [entry] = entries.splice(idx, 1);
    if (entries.length === 0) {
      delete this.plan.entries[fromKey];
    } else {
      this.plan.entries[fromKey] = entries;
    }
    const toKey = this.key(toDate, toSlot);
    if (!this.plan.entries[toKey]) this.plan.entries[toKey] = [];
    const moved: MealEntry = {
      ...entry,
      dateStr: toDate,
      slotId: toSlot,
    };
    this.plan.entries[toKey].push(moved);
    await this.onSave();
  }

  // ─── Daily note helpers ────────────────────────────────────────────────────

  /**
   * Returns the markdown block to inject into a daily note.
   * Each slot renders as "**Label:** [[Recipe Name]], [[Recipe Name]]" or "**Label:** —" if empty.
   */
  buildDailyNoteBlock(dateStr: string): string {
    const slots = [...this.settings.mealSlots].sort((a, b) => a.order - b.order);
    const lines = slots.map(slot => {
      const entries = this.getEntries(dateStr, slot.id);
      if (entries.length > 0) {
        const links = entries.map(entry => {
          return `[[${entry.recipeName}]]`;
        }).join(", ");
        return `**${slot.label}:** ${links}`;
      }
      return `**${slot.label}:** —`;
    });

    return lines.join("\n");
  }

  // ─── Slot helpers (delegated from settings) ────────────────────────────────

  get slots(): MealSlot[] {
    return [...this.settings.mealSlots].sort((a, b) => a.order - b.order);
  }
}

// ─── Date utilities ────────────────────────────────────────────────────────

/** Returns ISO date string for today in local time */
export function todayDateStr(): string {
  const d = new Date();
  return localISODate(d);
}

/** Returns ISO date string (YYYY-MM-DD) for the Monday of the week containing dateStr */
export function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return localISODate(d);
}

/** Add N days to an ISO date string */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return localISODate(d);
}

/** Format as "Mon 7 Apr" */
export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
