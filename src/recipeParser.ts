import { requestUrl } from "obsidian";
import type { Ingredient, Recipe } from "./types";

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ParsedRecipeData {
  name: string;
  description?: string;
  ingredients: Ingredient[];
  instructions: string[];
  tags: string[];
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  sourceUrl: string;
  image?: string;
}

export async function fetchAndParseRecipe(url: string): Promise<ParsedRecipeData> {
  const response = await requestUrl({ url, method: "GET" });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  const html = response.text;

  // Try JSON-LD first (most reliable — used by AllRecipes, BBC Food, NYT Cooking, etc.)
  const jsonLd = tryParseJsonLd(html, url);
  if (jsonLd) return jsonLd;

  // Fall back to heuristic HTML parsing
  const heuristic = tryHeuristicParse(html, url);
  if (heuristic) return heuristic;

  throw new Error(
    "Could not extract a recipe from this page. The site may not use standard recipe markup. " +
    "Try copying the recipe text and using the manual entry form instead."
  );
}

// ─── JSON-LD parser ──────────────────────────────────────────────────────────

function tryParseJsonLd(html: string, url: string): ParsedRecipeData | null {
  // Find all <script type="application/ld+json"> blocks
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const recipe = findRecipeInGraph(data);
      if (recipe) return normaliseJsonLd(recipe, url);
    } catch {
      // malformed JSON — try next block
    }
  }
  return null;
}

/** Recursively find a Recipe node in @graph arrays or nested objects */
function findRecipeInGraph(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;

  if (obj["@type"] === "Recipe") return obj;

  // @graph is an array of typed objects
  if (Array.isArray(obj["@graph"])) {
    for (const node of obj["@graph"] as unknown[]) {
      const found = findRecipeInGraph(node);
      if (found) return found;
    }
  }

  // Sometimes wrapped in an array at the top level
  if (Array.isArray(data)) {
    for (const node of data as unknown[]) {
      const found = findRecipeInGraph(node);
      if (found) return found;
    }
  }

  return null;
}

function normaliseJsonLd(r: Record<string, unknown>, url: string): ParsedRecipeData {
  return {
    name: extractString(r["name"]) ?? "Untitled Recipe",
    description: extractString(r["description"]),
    ingredients: parseIngredientStrings(extractStringArray(r["recipeIngredient"])),
    instructions: parseInstructions(r["recipeInstructions"]),
    tags: extractStringArray(r["keywords"]).flatMap(k => k.split(",").map(t => normaliseTag(t.trim()))).filter(Boolean),
    prepTime: parseDuration(extractString(r["prepTime"])),
    cookTime: parseDuration(extractString(r["cookTime"])),
    servings: parseServings(r["recipeYield"]),
    sourceUrl: url,
    image: extractImage(r["image"]),
  };
}

// ─── Heuristic HTML parser ────────────────────────────────────────────────────

function tryHeuristicParse(html: string, url: string): ParsedRecipeData | null {
  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  const name = titleMatch ? stripTags(titleMatch[1]).trim() : null;
  if (!name) return null;

  // Try to extract featured image
  const image = extractImageFromHtml(html);

  // Ingredients: look for <li> items near the word "ingredient"
  const ingredients: Ingredient[] = [];
  const ingSection = extractSectionByKeyword(html, "ingredient");
  if (ingSection) {
    const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m: RegExpExecArray | null;
    while ((m = liPattern.exec(ingSection)) !== null) {
      const text = stripTags(m[1]).trim();
      if (text.length > 1 && text.length < 300) {
        ingredients.push(parseIngredientString(text));
      }
    }
  }

  // Instructions: look for <li> or <p> near "instruction" / "method" / "direction"
  const instructions: string[] = [];
  const instrSection = extractSectionByKeyword(html, "instruction|method|direction|step");
  if (instrSection) {
    const liPattern = /<(?:li|p)[^>]*>([\s\S]*?)<\/(?:li|p)>/gi;
    let m: RegExpExecArray | null;
    while ((m = liPattern.exec(instrSection)) !== null) {
      const text = stripTags(m[1]).trim();
      if (text.length > 10) instructions.push(text);
    }
  }

  if (ingredients.length === 0 && instructions.length === 0) return null;

  return {
    name,
    ingredients,
    instructions,
    tags: [],
    sourceUrl: url,
    image,
  };
}

/** Find a section of HTML that contains a keyword, returning surrounding content */
function extractSectionByKeyword(html: string, keyword: string): string | null {
  const idx = html.search(new RegExp(keyword, "i"));
  if (idx === -1) return null;
  // Return a window around the keyword — large enough to capture the section
  return html.slice(Math.max(0, idx - 200), Math.min(html.length, idx + 8000));
}

// ─── Ingredient text parser ───────────────────────────────────────────────────

/** Parses a human-readable ingredient string like "2 cups all-purpose flour, sifted"
 *  or "4 medium potatoes ((or 1 large, peeled and diced into 1-inch chunks))". */
export function parseIngredientString(text: string): Ingredient {
  const cleaned = stripTags(text).replace(/\s+/g, " ").trim();
  if (!cleaned) return { name: cleaned };

  // Pattern: optional amount + optional unit + name + optional notes (after comma or parentheses)
  const pattern = /^([\d\s\u00BC-\u00BE\u2150-\u215E\/.-]+)?\s*([a-zA-Z]{1,20})?\s+(.+)$/;
  const match = cleaned.match(pattern);

  if (!match) return { name: cleaned };

  const [, amountRaw, unitRaw, rest] = match;

  // Units + size/container descriptors that should be kept as the unit
  // (descriptors like "medium" stay as the unit so "4 medium potatoes"
  //  becomes amount=4, unit=medium, name=potatoes instead of name="medium potatoes")
  const knownUnits = new Set([
    "tsp","teaspoon","teaspoons","tbsp","tablespoon","tablespoons",
    "cup","cups","oz","ounce","ounces","lb","pound","pounds",
    "g","gram","grams","kg","kilogram","kilograms",
    "ml","milliliter","milliliters","l","liter","liters",
    "pinch","pinches","dash","handful","handfuls","bunch","bunches",
    "clove","cloves","slice","slices","piece","pieces","head","heads",
    "can","cans","package","packages","pkg","bag","bags","box","boxes",
    "jar","jars","tin","tins","bottle","bottles","carton","cartons",
    "loaf","loaves","stick","sticks","bar","bars","block","blocks",
    "roll","rolls","wedge","wedges","stalk","stalks","leaf","leaves",
    "sprig","sprigs","fillet","fillets","small","medium","large",
    "whole","half","halves",
  ]);

  const unit = unitRaw && knownUnits.has(unitRaw.toLowerCase()) ? unitRaw : undefined;
  const namePart = unit ? rest : (unitRaw ? `${unitRaw} ${rest}` : rest);

  // Pull parenthetical prep notes out of the name — handles "(...)" and "((...))"
  const parens: string[] = [];
  const deParen = namePart.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    const t = inner.trim();
    if (t) parens.push(t);
    return " ";
  });
  const flattened = deParen.replace(/\s+/g, " ").trim();

  // Split trailing notes at a comma (e.g. "flour, sifted")
  const commaMatch = flattened.match(/^([^,]+),\s*(.+)$/);
  const name = (commaMatch ? commaMatch[1] : flattened)
    .replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  const commaNotes = commaMatch?.[2]?.trim();

  const notes = [commaNotes, ...parens]
    .filter(Boolean)
    .join(" — ")
    .replace(/[()]/g, "")
    .replace(/^[—\-\s,]+|[—\-\s,]+$/g, "")
    .trim() || undefined;

  return {
    amount: amountRaw?.trim(),
    unit,
    name,
    notes: notes || undefined,
  };
}

function parseIngredientStrings(lines: string[]): Ingredient[] {
  return lines.map(parseIngredientString).filter(i => i.name.length > 0);
}

// ─── Instruction parser ───────────────────────────────────────────────────────

function parseInstructions(raw: unknown): string[] {
  if (!raw) return [];

  if (typeof raw === "string") {
    return raw.split(/\.\s+/).map(s => s.trim()).filter(s => s.length > 5);
  }

  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      if (typeof item === "string") return [stripTags(item).trim()];
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        // HowToStep
        if (obj["text"]) return [stripTags(String(obj["text"])).trim()];
        // HowToSection contains itemListElement
        if (Array.isArray(obj["itemListElement"])) {
          return parseInstructions(obj["itemListElement"]);
        }
      }
      return [];
    }).filter(s => s.length > 0);
  }

  return [];
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

/** Parse ISO 8601 duration like PT1H30M → minutes */
function parseDuration(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = raw.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return undefined;
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const total = hours * 60 + minutes;
  return total > 0 ? total : undefined;
}

function parseServings(raw: unknown): number | undefined {
  if (!raw) return undefined;
  const str = Array.isArray(raw) ? String(raw[0]) : String(raw);
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : undefined;
}

function extractString(val: unknown): string | undefined {
  if (typeof val === "string") return val.trim() || undefined;
  if (Array.isArray(val) && typeof val[0] === "string") return val[0].trim();
  return undefined;
}

function extractStringArray(val: unknown): string[] {
  if (!val) return [];
  if (typeof val === "string") return val ? [val] : [];
  if (Array.isArray(val)) return val.filter(v => typeof v === "string");
  return [];
}

function extractImage(val: unknown): string | undefined {
  if (!val) return undefined;
  if (typeof val === "string") return val;
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0];
    if (typeof first === "string") return first;
    if (typeof first === "object" && first !== null) {
      const obj = first as Record<string, unknown>;
      if (typeof obj["url"] === "string") return obj["url"];
    }
  }
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj["url"] === "string") return obj["url"];
  }
  return undefined;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").trim();
}

function normaliseTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/#/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_\-/]/g, "");
}

function extractImageFromHtml(html: string): string | undefined {
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogImage) return ogImage[1];
  
  const twitterImage = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (twitterImage) return twitterImage[1];
  
  const schemaImage = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (schemaImage) {
    for (const match of schemaImage) {
      try {
        const data = JSON.parse(match.replace(/<script[^>]*>|<\/script>/gi, ""));
        if (data && data["@type"] === "Recipe" && data["image"]) {
          return extractImage(data["image"]);
        }
        if (data && Array.isArray(data)) {
          for (const item of data) {
            if (item && item["@type"] === "Recipe" && item["image"]) {
              return extractImage(item["image"]);
            }
          }
        }
      } catch {}
    }
  }
  
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+(?:jpg|jpeg|png|webp|gif)[^"']*)["']/i);
  if (imgMatch) return imgMatch[1];
  
  return undefined;
}

// ─── Recipe → Markdown frontmatter ───────────────────────────────────────────

export function recipeToMarkdown(data: ParsedRecipeData): string {
  const now = new Date().toISOString();

  const frontmatter = [
    "---",
    `name: "${data.name.replace(/"/g, '\\"')}"`,
    data.description ? `description: "${data.description.replace(/"/g, '\\"').slice(0, 300)}"` : "",
    data.image ? `image: "${data.image}"` : "",
    data.prepTime ? `prepTime: ${data.prepTime}` : "",
    data.cookTime ? `cookTime: ${data.cookTime}` : "",
    data.servings ? `servings: ${data.servings}` : "",
    data.sourceUrl ? `sourceUrl: "${data.sourceUrl}"` : "",
    data.tags.length > 0 ? `tags:\n${data.tags.map(t => `  - ${t}`).join("\n")}` : "tags: []",
    `createdAt: "${now}"`,
    `updatedAt: "${now}"`,
    "---",
  ].filter(Boolean).join("\n");

  const ingredientLines = data.ingredients.length > 0
    ? data.ingredients.map(i => {
        const parts = [i.amount, i.unit, i.name, i.notes ? `(${i.notes})` : ""].filter(Boolean);
        return `- ${parts.join(" ")}`;
      }).join("\n")
    : "_No ingredients listed._";

  const instructionLines = data.instructions.length > 0
    ? data.instructions.map((step, idx) => `${idx + 1}. ${step}`).join("\n")
    : "_No instructions listed._";

  return [
    frontmatter,
    "",
    `# ${data.name}`,
    "",
    data.description ? `> ${data.description}\n` : "",
    "## Ingredients",
    "",
    ingredientLines,
    "",
    "## Instructions",
    "",
    instructionLines,
    "",
    data.sourceUrl ? `---\n*Source: [${data.sourceUrl}](${data.sourceUrl})*` : "",
  ].filter(s => s !== undefined).join("\n").trim() + "\n";
}
