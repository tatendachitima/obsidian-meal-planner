import { App, TFile, normalizePath } from "obsidian";
import type { MealPlannerSettings } from "./types";
import type { MealPlanManager } from "./mealPlanManager";

// Markers that wrap the auto-generated block so we can replace it on update
const BLOCK_START = "<!-- meal-planner:start -->";
const BLOCK_END   = "<!-- meal-planner:end -->";

export class DailyNoteIntegration {
  constructor(
    private app: App,
    private settings: MealPlannerSettings,
    private mealPlanManager: MealPlanManager
  ) {}

  /**
   * Find the daily note file for a given date string.
   * Looks in the configured folder for a file whose basename matches the date.
   */
  findDailyNote(dateStr: string): TFile | null {
    const folder = this.settings.dailyNoteFolder;

    // Try direct path first: folder/YYYY-MM-DD.md
    const directPath = normalizePath(`${folder}/${dateStr}.md`);
    const direct = this.app.vault.getAbstractFileByPath(directPath);
    if (direct instanceof TFile) return direct;

    // Also search by scanning the folder for a file containing the date string
    // (handles cases where the daily note plugin uses a different format)
    const folderFile = this.app.vault.getAbstractFileByPath(normalizePath(folder));
    if (!folderFile) return null;

    // Search all markdown files in the vault whose path includes the date
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.path.startsWith(normalizePath(folder)) && file.basename === dateStr) {
        return file;
      }
    }

    return null;
  }

  /**
   * Inject or update the meal plan block in a daily note.
   * Creates the section heading if it doesn't exist.
   * Replaces the block if it already exists (idempotent).
   */
  async updateDailyNote(dateStr: string): Promise<void> {
    const file = this.findDailyNote(dateStr);
    if (!file) return; // Don't create notes automatically; only update existing ones

    const mealBlock = this.mealPlanManager.buildDailyNoteBlock(dateStr);
    await this.app.vault.process(file, (content) => this.injectMealBlock(content, mealBlock));
  }

  /**
   * Inject the block into note content, returning the modified string.
   * Finds the heading defined in settings and inserts below it.
   */
  private injectMealBlock(content: string, mealBlock: string): string {
    // Boundary-based (default) unless explicitly disabled
    if (this.settings.boundaryInsertion) {
      return this.injectMealBlockBoundary(content, mealBlock);
    }
    // Fallback to legacy marker-based approach for compatibility
    const wrappedBlock = `${BLOCK_START}\n${mealBlock}\n${BLOCK_END}`;
    const existingPattern = new RegExp(
      `${escapeRegex(BLOCK_START)}[\\s\\S]*?${escapeRegex(BLOCK_END)}`,
      "m"
    );
    if (existingPattern.test(content)) {
      return content.replace(existingPattern, wrappedBlock);
    }
    const headingPattern = new RegExp(
      `^(#{1,6}\\s+${escapeRegex(this.settings.dailyNoteSectionHeading)}\\s*)$`,
      "m"
    );
    const headingMatch = content.match(headingPattern);
    if (headingMatch && headingMatch.index !== undefined) {
      const insertAt = headingMatch.index + headingMatch[0].length;
      return `${content.slice(0, insertAt)}\n\n${wrappedBlock}\n${content.slice(insertAt)}`;
    }
    const altHeadingPattern = /^(#{2,6}\\s+Meal(s)?\\s*)$/m;
    const altMatch = content.match(altHeadingPattern);
    if (altMatch && altMatch.index !== undefined) {
      const insertAtAlt = altMatch.index + altMatch[0].length;
      return `${content.slice(0, insertAtAlt)}\n\n${wrappedBlock}\n${content.slice(insertAtAlt)}`;
    }
    const heading = `## ${this.settings.dailyNoteSectionHeading}`;
    return `${content.trimEnd()}\n\n${heading}\n\n${wrappedBlock}\n`;
  }

  private injectMealBlockBoundary(content: string, mealBlock: string): string {
    // Replace the content under the heading up to the next heading without using markers
    const lines = content.split(/\r?\n/);
    const headingRe = new RegExp(`^#{1,6}\\s+${escapeRegex(this.settings.dailyNoteSectionHeading)}\\s*$`);
    let headingIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (headingIdx === -1 && headingRe.test(lines[i])) {
        headingIdx = i;
        break;
      }
    }
    const mealLines = mealBlock.split("\n");
    if (headingIdx >= 0) {
      // Determine end of section: next heading or EOF
      let endIdx = headingIdx + 1;
      const nextHeadingRe = /^#{1,6}\s+/;
      while (endIdx < lines.length && !nextHeadingRe.test(lines[endIdx])) endIdx++;
      const before = lines.slice(0, headingIdx + 1);
      const newBlock = ["", ...mealLines, ""];
      const after = lines.slice(endIdx);
      return [...before, ...newBlock, ...after].join("\n");
    }
    // No heading: append at end with heading
    const heading = `## ${this.settings.dailyNoteSectionHeading}`;
    return `${content.trimEnd()}\n\n${heading}\n\n${mealBlock}\n`;
  }

  /**
   * Remove the meal block from a daily note entirely.
   */
  async removeMealBlock(dateStr: string): Promise<void> {
    const file = this.findDailyNote(dateStr);
    if (!file) return;

    if (this.settings.boundaryInsertion) {
      // Boundary-based removal: remove the meal block under the heading if present
      await this.app.vault.process(file, (content) => {
        const lines = content.split(/\r?\n/);
        const headingRe = new RegExp(`^#{1,6}\\s+${escapeRegex(this.settings.dailyNoteSectionHeading)}\\s*$`);
        let headingIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (headingIdx === -1 && headingRe.test(lines[i])) {
            headingIdx = i;
            break;
          }
        }
        if (headingIdx >= 0) {
          let endIdx = headingIdx + 1;
          const nextHeadingRe = /^#{1,6}\s+/;
          while (endIdx < lines.length && !nextHeadingRe.test(lines[endIdx])) endIdx++;
          const before = lines.slice(0, headingIdx + 1);
          const after = lines.slice(endIdx);
          const newContent = [...before, ...after].join("\n");
          return newContent !== content ? newContent : content;
        }
        return content;
      });
      return;
    }
    // Fallback to legacy marker-based removal
    const pattern = new RegExp(
      `\n?${escapeRegex(BLOCK_START)}[\\s\\S]*?${escapeRegex(BLOCK_END)}\n?`,
      "m"
    );
    await this.app.vault.process(file, (content) => {
      const newContent = content.replace(pattern, "\n");
      return newContent !== content ? newContent : content;
    });
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}
