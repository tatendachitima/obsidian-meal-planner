# Security & Privacy Appendix

Scope
- This appendix documents data flows, storage, and privacy considerations for the Obsidian Meal Planner plugin.

What the plugin stores locally
- Settings (recipes folder, daily notes folder, headers, auto-update toggle, meal slots).
- Meal plan data (per-date, per-slot assignments) in the plugin data store (data.json) as part of the Obsidian plugin persistence path used by the host app.
- Daily note integration state: the plugin reads and writes to daily notes using Obsidian's vault API; it does not upload note contents to external services by default.

What leaves the local machine
- If you use Import Recipe (URL-based) functionality, the plugin fetches data from remote URLs via Obsidian's requestUrl API. The plugin parses the data locally to extract a recipe and then saves a note in your vault. Remote fetches mean the URL and server responses are transmitted to your workstation; this is not sent to the plugin authors or any third party by the plugin itself unless you copy data out of Obsidian.
- If you enable any future cloud-based features (e.g., Claude integration), the plugin should minimize data exposure by only sending the necessary data for the requested context and providing user controls to opt-in.

Security considerations
- API keys: The current repository does not include an API key field for Claude or other external services. If such keys are introduced, they should be stored in Obsidian's settings (encrypted at rest by the OS) and never logged. Access should be restricted to the plugin, following least-privilege principles.
- Logging: Avoid verbose or sensitive logs in production. The plugin currently logs minimal information via console; consider a configurable debug mode that logs only non-sensitive events.
- Content sanitization: Rendered content from external sources (e.g., imported recipes) is stored in vault notes. Basic Markdown rendering is used by Obsidian; avoid injecting raw HTML or scripts via user-generated content to prevent XSS-like concerns in Obsidian renderers. The current approach uses Markdown generation (recipe frontmatter, MD blocks) which is safe in Obsidian's rendering surface.
- Data minimization: Only store data necessary for UI and daily-note integration. If a Claude integration is added, ensure prompts and payloads are minimized and user consent is explicit for any data sent remotely.

Data residency & sync
- Data resides on the user's device within the Obsidian vault or plugin data directory.
- If you enable Obsidian Sync or third-party backup solutions, plugin data may be replicated depending on your sync rules. Review your sync policies if this is a concern.

Recommendations
- When introducing external integrations (e.g., Claude), provide clear user-facing prompts that describe what data is sent and give an explicit opt-in.
- Add a telemetry/logging toggle to allow users to disable non-essential data sharing.
- Consider storing any future API credentials in a secure, encrypted store and do not ship secrets in repository or logs.

Note
- This appendix reflects the current state of the plugin in this repository. If you alter the data model or add remote integrations, update this appendix accordingly.
- Phase 2: Depletion and Shopping Data flows
- The depletion engine operates entirely on the local Obsidian vault data; pantry and shopping lists are stored in data.json (PluginData)
- No external network calls are performed in MVP; any future enhancements to pull recipes or price data would require explicit opt-in
- No telemetry or usage data is transmitted unless explicitly added by you in future enhancements
- Phase 2: Depletion and Shopping Data flows
- The depletion engine operates entirely on the local Obsidian vault data; pantry and shopping lists are stored in data.json (PluginData)
- No external network calls are performed in MVP; any future enhancements to pull recipes or price data would require explicit opt-in
- No telemetry or usage data is transmitted unless explicitly added by you in future enhancements
