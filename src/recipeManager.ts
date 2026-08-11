import { App, TFile, TFolder, normalizePath, parseYaml } from "obsidian";
import type { Recipe, MealPlannerSettings, Ingredient } from "./types";
import { recipeToMarkdown, parseIngredientString, type ParsedRecipeData } from "./recipeParser";

export class RecipeManager {
  constructor(private app: App, private settings: MealPlannerSettings) {}

  // ─── Folder management ─────────────────────────────────────────────────────
  async ensureRecipeFolder(): Promise<void> {
    const folder = this.settings.recipeFolder;
    if (!this.app.vault.getAbstractFileByPath(normalizePath(folder))) {
      await this.app.vault.createFolder(normalizePath(folder));
    }
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────
  async getAllRecipes(): Promise<Recipe[]> {
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.settings.recipeFolder));
    if (!folder || !(folder instanceof TFolder)) return [];

    const recipes: Recipe[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === "md") {
        const recipe = await this.readRecipeFile(child);
        if (recipe) recipes.push(recipe);
      }
    }
    return recipes.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getRecipeById(id: string): Promise<Recipe | null> {
    const filePath = normalizePath(`${this.settings.recipeFolder}/${id}.md`);
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return null;
    return this.readRecipeFile(file);
  }

  async createRecipeFromParsed(data: ParsedRecipeData): Promise<Recipe> {
    await this.ensureRecipeFolder();
    const safeName = sanitiseFilename(data.name);
    const filePath = await this.uniqueFilePath(safeName);
    const content = recipeToMarkdown(data);
    const file = await this.app.vault.create(normalizePath(filePath), content);
    const recipe = await this.readRecipeFile(file);
    if (!recipe) throw new Error("Failed to read recipe after creating it.");
    return recipe;
  }

  async createRecipeManual(fields: ManualRecipeFields): Promise<Recipe> {
    await this.ensureRecipeFolder();
    const safeName = sanitiseFilename(fields.name);
    const filePath = await this.uniqueFilePath(safeName);
    const data: ParsedRecipeData = {
      name: fields.name,
      description: fields.description,
      ingredients: fields.ingredients
        .split("\n").map(l => l.trim()).filter(Boolean)
        .map(l => ({ name: l })),
      instructions: fields.instructions
        .split("\n").map(l => l.trim()).filter(Boolean),
      tags: fields.tags.split(",").map(t => t.trim()).filter(Boolean),
      prepTime: fields.prepTime || undefined,
      cookTime: fields.cookTime || undefined,
      servings: fields.servings || undefined,
      sourceUrl: "",
    };
    const content = recipeToMarkdown(data);
    const file = await this.app.vault.create(normalizePath(filePath), content);
    const recipe = await this.readRecipeFile(file);
    if (!recipe) throw new Error("Failed to read recipe after creating it.");
    return recipe;
  }

  async updateRecipeTags(recipe: Recipe, tags: string[]): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(recipe.filePath);
    if (!file || !(file instanceof TFile)) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.tags = tags;
    });
  }

  async deleteRecipe(recipe: Recipe): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(recipe.filePath);
    if (file instanceof TFile) {
      await this.app.vault.trash(file, true);
    }
  }

  openRecipeNote(recipe: Recipe): void {
    const file = this.app.vault.getAbstractFileByPath(recipe.filePath);
    if (file instanceof TFile) {
      this.app.workspace.getLeaf(false).openFile(file);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  private async readRecipeFile(file: TFile): Promise<Recipe | null> {
    try {
      const content = await this.app.vault.read(file);
      const fm = extractFrontmatter(content);
      if (!fm) return null;
      // Gather ingredients from frontmatter or body
      let ingredients: Ingredient[] = [];
      if (fm && fm["ingredients"] !== undefined) {
        const raw = fm["ingredients"];
        const parsed: Ingredient[] = [];
        if (Array.isArray(raw)) {
          for (const item of raw) {
            if (typeof item === 'string') {
              const parsedLine = RecipeManager.parseIngredientLine(item);
              if (parsedLine) parsed.push(parsedLine);
            } else if (typeof item === 'object' && item !== null) {
              const name = String((item as any).name ?? (item as any).ingredient ?? '');
              const amount = (item as any).amount ?? (item as any).quantity ?? '';
              const unit = (item as any).unit ?? '';
              if (name) parsed.push({ name, amount: String(amount), unit: String(unit) } as Ingredient);
            }
          }
        }
        ingredients = parsed;
      } else if (typeof fm?.ingredients === 'string') {
        ingredients = (fm.ingredients as string).split('\n').map(l => RecipeManager.parseIngredientLine(l)).filter(x => x) as Ingredient[];
      }
      if (!ingredients || ingredients.length === 0) {
        const body = content;
        ingredients = RecipeManager.extractIngredientsFromBody(body);
      }
      let instructions: string[] = [];
      if (Array.isArray(fm["instructions"])) {
        instructions = fm["instructions"].map(String);
      } else if (typeof fm["instructions"] === "string") {
        instructions = (fm["instructions"] as string).split("\n").map(s => s.trim()).filter(Boolean);
      }
      if (instructions.length === 0) {
        instructions = RecipeManager.extractInstructionsFromBody(content);
      }
      const id = file.basename;
      return {
        id,
        name: String(fm["name"] ?? id),
        description: fm["description"] ? String(fm["description"]) : undefined,
        ingredients: ingredients?.length ? ingredients : [],
        instructions,
        tags: parseFmTags(fm["tags"]),
        prepTime: fm["prepTime"] ? Number(fm["prepTime"]) : undefined,
        cookTime: fm["cookTime"] ? Number(fm["cookTime"]) : undefined,
        servings: fm["servings"] ? Number(fm["servings"]) : undefined,
        sourceUrl: fm["sourceUrl"] ? String(fm["sourceUrl"]) : undefined,
        filePath: file.path,
        createdAt: String(fm["createdAt"] ?? ""),
        updatedAt: String(fm["updatedAt"] ?? ""),
      };
    } catch {
      return null;
    }
  }

  // Helpers for ingredient parsing (static methods on class)
  static parseIngredientLine(line: string): Ingredient | null {
    const s = line.trim().replace(/^[-*]\s*/, '');
    if (!s) return null;
    return parseIngredientString(s);
  }

  static extractIngredientsFromBody(content: string): Ingredient[] {
    const lines = content.split(/\r?\n/);
    let startIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,6}\s+Ingredients\s*$/.test(lines[i])) { startIndex = i; break; }
    }
    if (startIndex === -1) return [];
    const result: Ingredient[] = [];
    for (let j = startIndex + 1; j < lines.length; j++) {
      const l = lines[j];
      if (/^#{1,6}\s+/.test(l)) break;
      if (/^[-*]/.test(l.trim())) {
        const parsed = RecipeManager.parseIngredientLine(l);
        if (parsed) result.push(parsed);
      }
    }
    return result;
  }

  static extractInstructionsFromBody(content: string): string[] {
    const lines = content.split(/\r?\n/);
    let startIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,6}\s+Instructions\s*$/.test(lines[i])) { startIndex = i; break; }
    }
    if (startIndex === -1) return [];
    const result: string[] = [];
    for (let j = startIndex + 1; j < lines.length; j++) {
      const l = lines[j];
      if (/^#{1,6}\s+/.test(l)) break;
      const t = l.trim();
      if (/^\d+[.)]\s+/.test(t) || /^[-*]\s+/.test(t)) {
        result.push(t.replace(/^\d+[.)]\s+/, "").replace(/^[-*]\s+/, "").trim());
      }
    }
    return result.filter(Boolean);
  }

  private async uniqueFilePath(baseName: string): Promise<string> {
    let filePath = `${this.settings.recipeFolder}/${baseName}.md`;
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(normalizePath(filePath))) {
      filePath = `${this.settings.recipeFolder}/${baseName} ${counter}.md`;
      counter++;
    }
    return filePath;
  }
}

// ─── Manual entry fields ───────────────────────────────────────────────────
export interface ManualRecipeFields {
  name: string;
  description: string;
  ingredients: string;   // newline-separated
  instructions: string;  // newline-separated
  tags: string;          // comma-separated
  prepTime: number;
  cookTime: number;
  servings: number;
}

// ─── Frontmatter utilities ───────────────────────────────────────────────────
function extractFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try { return parseYaml(match[1]) as Record<string, unknown>; } catch { return null; }
}

function updateFrontmatterField(content: string, key: string, value: string): string {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!fmMatch) return content;
  const lines = fmMatch[2].split("\n");
  const existingIdx = lines.findIndex(l => l.startsWith(`${key}:`));
  if (existingIdx >= 0) lines[existingIdx] = `${key}:${value}`; else lines.push(`${key}:${value}`);
  return `---\n${lines.join("\n")}\n---${content.slice(fmMatch[0].length)}`;
}

function parseFmTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(",").map(t => t.trim()).filter(Boolean);
  return [];
}

function sanitiseFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}
