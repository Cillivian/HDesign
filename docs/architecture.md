# HDesign architecture (M0 baseline)

## Product
Local-first interior design workbench: import a floor plan (image/PDF) -> recognised sketch -> natural-language design brief -> local layout/style/MEP generation -> 2D/3D -> drawings + BOM.
AI is optional and always proposes; the local deterministic engine applies.

## Runtime shape
- `apps/web` — React 19 + Vite 8 SPA, Konva 2D, R3F 3D, Zustand + Dexie.
- `apps/server` — Hono AI proxy on port 8791 (DeepSeek OpenAI-compatible API). No database, no project storage.
- `packages/*` — pure TypeScript domains, no DOM:
  - `domain` zod schema, geometry, room helpers, factories, migrations, AI protocol.
  - `catalog` furniture/material/style presets (workstream B).
  - `symbols` shared SVG path symbols for 2D + sheets (workstream B).
  - `autolayout` deterministic placement + MEP rules (workstream B).
  - `plan-recognition` CV/OCR pipeline (workstream C).
  - `drawing` SVG sheet renderer (workstream E).

## Ports
- web: http://localhost:5173 (Vite default host; use localhost not 127.0.0.1)
- api: http://localhost:8791, proxied through Vite at `/api`
- `pnpm dev` runs both (already running during development).

## Key contracts
- Units are millimetres. Plan coordinates: x right, y down. 3D maps (x, y) -> (x, 0, y), Y up.
- `packages/domain/src/schema.ts` — Project, Layer, Wall, Opening, Room, FurnitureItem, MepDevice, Circuit, SheetSpec.
- `packages/domain/src/ai.ts` — DesignBrief, DesignPatch, ParseDraft, API request/response schemas (shared with server).
- `apps/web/src/store/doc-store.ts` — document + undo history. Use `commit(recipe)` for atomic history; `beginGesture/endGesture` around drags.
- `apps/web/src/store/ui-store.ts` — tool, selection, viewport, panels, theme.
- `apps/web/src/design-system/` — CSS-variable tokens + primitives. Never hard-code palette hex in UI; use `bg-surface`, `text-ink`, `border-line`, `text-accent`, `text-water`, `text-electric`.
- `apps/web/src/services/api-client.ts` — typed JSON / SSE / error envelope client.
- Server AI: `apps/server/src/provider/*` (DeepSeek adapter + mock), `apps/server/src/ai/validate.ts` (JSON extraction, zod validation, repair retry).
  DeepSeek JSON mode requires the word "json" in the prompt; thinking is disabled for structured calls; images only in user messages.

## Quality gates
- `pnpm typecheck` (all packages), `pnpm lint`, `pnpm test`, `pnpm build`.
- UI must use tokens and primitives; no purple gradients / oversized rounded cards / emoji icons.
- All AI-generated entities carry `meta.source = 'ai'` and stay editable/undoable.

## File ownership (during parallel build)
- Lead: root config, app shell, design system, doc/ui stores, server core/provider, docs, integration.
- A: `packages/domain` extensions, `apps/web/src/editor/**`, panels/{layers,properties}.
- B: `packages/{catalog,symbols,autolayout}/**`, panels/{assets,styles,materials,mep}.
- C: `packages/plan-recognition/**`, server `routes/parse.ts` + parse prompt, web `import/**`, `panels/import/**`, services {pdf,ocr,ai-parse,recognition.worker}, fixtures/plans.
- D: `apps/web/src/scene3d/**`, `panels/scene`.
- E: `packages/drawing/**`, panels/sheets, `pages/ProjectsPage.tsx`, `store/persistence.ts` additions, services {file-io,export/**}.
- F: server `routes/{design,chat}.ts` + prompts, web `panels/ai/**`, `store/ai-store.ts`, services/{ai-design,patch-executor,bom}, fixtures/ai.
Do not edit another workstream's files; ask Lead if a shared contract must change.

## Environment notes
- Use pnpm only (npm cache under ~/.npm is not writable).
- Playwright: browsers are installed under `.playwright-browsers`; use `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers` and `channel: 'chromium'` (bundled headless shell hangs in this sandbox).
- AI is unconfigured by default; keep every non-AI flow working. `AI_MOCK=1` replays `fixtures/ai/*.json`.
