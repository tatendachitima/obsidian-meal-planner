# Meal Planner

Plan your meals visually, keep your recipes in plain Markdown, track your pantry, and generate shopping lists — all inside Obsidian.

## Features

- **Weekly planner** — a visual week grid with customizable meal slots (breakfast, lunch, dinner, snack, dessert, or your own). Drag recipes onto days.
- **Recipes** — plain Markdown notes in your vault (`Recipes/` folder). Create manually, or **import from a URL** (JSON-LD recipe extraction: AllRecipes, BBC Good Food, NYT Cooking, and more).
- **Daily note integration** — planned meals are written into your daily notes under a `## Meals` heading. Boundary-based insertion keeps your notes clean (no HTML comment markers), with an option to auto-update when you open today's note.
- **Pantry** — track quantities, units, expiry (with status dots), locations, and purchase/usage stats. Bulk select, CSV import/export.
- **Kitchen inventory sync** — sync the pantry with a Markdown note (`Kitchen Inventory.md`): *Import from note* reads checked items into the pantry and unchecked ones into your shopping list; *Export to note* writes the pantry back under a plugin-owned section. Optional auto-export after pantry changes.
- **Depletion engine** — plan a week of meals and the plugin computes ingredient needs, depletes your pantry, and pushes deficits to your **shopping list** (week/month views, mark items acquired).
- **Mobile-friendly** — works on desktop and mobile (uses only the Obsidian Vault/Workspace APIs).

## Installation

### Community plugins (once approved)
Settings → Community plugins → Browse → search "Meal Planner".

### Manual / BRAT (until then)
- **BRAT:** add `https://github.com/tatendachitima/obsidian-meal-planner` via the BRAT plugin.
- **Manual:** download the latest release, unzip into `<vault>/.obsidian/plugins/weekly-meal-planner/`, enable the plugin in Settings → Community plugins.

## Usage

1. Open the plugin from the 🍴 ribbon icon or the command palette → *Meal Planner: Open meal planner*.
2. Add recipes (manual or from URL).
3. Assign recipes to slots in the weekly grid.
4. Open the **Pantry** tab: add items, or use *Import from note* to pull from `Kitchen Inventory.md`.
5. Plan a full week, then run depletion from the plan view to update pantry + shopping list.
6. Your daily notes show the day's meals automatically.

### Kitchen inventory workflow

Keep `Kitchen Inventory.md` (vault root) as your human-friendly list:

```markdown
## 🥫 Pantry (dry goods)
- [x] Rice — 2 kg
- [ ] Sugar
```

- `- [x]` (checked) → imported into the **pantry** (merge by name)
- `- [ ]` (unchecked) → added to the **week shopping list**
- Section headings become pantry **locations**

Configure the note name and auto-export in Settings → **Kitchen inventory sync**. There are also two commands: *Sync kitchen inventory (import from note)* and *Sync kitchen inventory (export to note)*.

## Settings

- **Recipe folder** — where recipe notes live (default `Recipes`).
- **Daily note folder / Meals section heading** — where meal blocks are written.
- **Auto-update daily note on open** — refresh today's note when you open it.
- **Boundary-based daily note insertion** — replace only the meals block under the heading (no markers).
- **Meal slots** — add, rename, and reorder slots (drag or arrow buttons).
- **Kitchen inventory sync** — note name and auto-export toggle.

## Security & privacy

- No telemetry, no analytics, no external services.
- The only network call is the **user-initiated** recipe import (URL you paste), fetched via Obsidian's `requestUrl` and parsed locally. See [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md).
- All data stays in your vault (`data.json` in the plugin folder, recipe notes, daily notes).

## Development

```bash
npm ci
npm run build   # type-check + bundle to main.js
npm run test:depletion
npm run test:depletion-unit
npm run test:integration
```

Source is TypeScript in `src/`, bundled with esbuild. Releases are built and attached by the GitHub Actions workflow.

## License

MIT — see [LICENSE](LICENSE).
