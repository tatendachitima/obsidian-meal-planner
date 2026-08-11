import type { ShoppingListItem } from "./types";

export class ShoppingListManager {
  constructor(private week: ShoppingListItem[], private month: ShoppingListItem[], private onChange: () => Promise<void>) {}

  getWeekList(): ShoppingListItem[] {
    return this.week;
  }
  getMonthList(): ShoppingListItem[] {
    return this.month;
  }

  async addItem(item: ShoppingListItem): Promise<void> {
    if (item.period === "week") {
      this.week.push(item);
    } else {
      this.month.push(item);
    }
    await this.onChange();
  }

  async updateItem(item: ShoppingListItem): Promise<void> {
    const list = item.period === 'week' ? this.week : this.month;
    const idx = list.findIndex(i => i.id === item.id);
    if (idx >= 0) {
      list[idx] = item;
      await this.onChange();
    }
  }

  async deleteItem(id: string, period: 'week'|'month'): Promise<void> {
    const list = period === 'week' ? this.week : this.month;
    const idx = list.findIndex(i => i.id === id);
    if (idx >= 0) {
      list.splice(idx, 1);
      await this.onChange();
    }
  }

  async markAcquired(id: string, period: 'week'|'month', acquired: boolean): Promise<void> {
    const list = period === 'week' ? this.week : this.month;
    const idx = list.findIndex(i => i.id === id);
    if (idx >= 0) {
      list[idx].acquired = acquired;
      await this.onChange();
    }
  }

  async addOrUpdateItem(item: ShoppingListItem): Promise<void> {
    const list = item.period === 'week' ? this.week : this.month;
    const idx = list.findIndex(i => i.name === item.name && i.unit === item.unit);
    if (idx >= 0) {
      list[idx].quantity += item.quantity;
    } else {
      list.push(item);
    }
    await this.onChange();
  }
}
