# HDesign architecture

## Runtime

- `apps/web` — React 19 + Vite 8 SPA. Konva 2D editor, React Three Fiber 3D scene (lazy chunk),
  Zustand stores, Dexie (IndexedDB) persistence, Tailwind 4 + CSS-variable design tokens.
- `apps/server` — Hono AI proxy on port 8791 (production also serves `apps/web/dist`). No database,
  no project storage. DeepSeek OpenAI-compatible provider + deterministic mock provider.
- `packages/*` — pure TypeScript, no DOM:
  - `domain` — zod schemas, geometry, room-face extraction, factories, migrations, AI contracts.
  - `catalog` — 154 furniture SKUs, 53 materials, 12 style presets, palette extraction, style apply.
  - `symbols` — 83 furniture + 17 MEP SVG path symbols shared by 2D and sheets.
  - `autolayout` — deterministic furniture layout + water/electric point rules.
  - `plan-recognition` — local CV/OCR pipeline over RGBA rasters.
  - `drawing` — deterministic SVG sheets + BOM/CSV + `.hdz` package helpers.

## Data flow

```
image/PDF → raster → CV worker ─┐
              DeepSeek vision ──┴→ ParseDraft → review/calibration → editable sketch
sketch + prompt → DeepSeek brief → DesignBrief candidates → local patch executor
                → style/material/layout/MEP → diff preview → one undoable commit
document → 2D Konva / 3D R3F / SVG sheets / PNG / PDF / CSV
```

## Key contracts

- Units are millimetres. Plan x→right, y→down; 3D maps `(x, y)` → `(x, 0, y)`, Y up.
- `packages/domain/src/schema.ts` — Project, Layer, Wall, Opening, Room, FurnitureItem, MepDevice,
  Circuit, SheetSpec. Default sheet scale is 1:50 (auto-fit warns on overflow).
- `packages/domain/src/ai.ts` — DesignBrief, DesignPatch, ParseDraft and API envelopes.
- `apps/web/src/store/doc-store.ts` — immutable document + explicit history:
  `commit(recipe)` pushes one entry; `beginGesture` / `endGesture` merge drags and skip no-op
  gestures; undo/redo cap 100.
- `apps/web/src/store/ui-store.ts` — tool, selection, viewport, panels, theme, pending SKU.
- `apps/web/src/services/api-client.ts` — typed JSON, SSE, shared error envelope.

## Implementation notes

- **Konva 10.9 removed `fillOpacity`**: translucent fills are pre-baked into `rgba()` strings
  (`editor/lib/draw.ts`), otherwise rooms paint opaque.
- **Vite worker bundling**: `new Worker(new URL('../services/recognition.worker.ts', import.meta.url), { type: 'module' })`
  must stay inline; storing the URL in a variable breaks production worker emission.
- **DeepSeek**: `deepseek-flash` supports Vision + JSON Output; JSON mode requires the word “json”
  in the prompt; thinking is disabled for structured calls; images only in user messages.
  `completeValidated` extracts JSON, validates with zod, and feeds errors back once.
- **AI applies locally**: model emits `DesignBrief` / `DesignPatch` only. The patch executor
  clamps sizes, verifies ids, keeps furniture inside rooms, and commits once. AI entities carry
  `meta.source='ai'`.
- **Mock AI**: `AI_MOCK=1` replays `fixtures/ai/*.json`; UI marks 演示数据. The e2e suite runs the
  production bundle with this provider on port 8793.
- **Responsive shell**: below 1180px side panels become drawers (auto-collapsed) with a backdrop;
  below 768px the top bar collapses labels and stats. No horizontal overflow at 1024/768.
- **Textures and 3D**: procedural canvas textures and parametric furniture; no external assets,
  fonts or CDNs. WebGL2-only with a fallback card.
- **Sheets**: A3 default, 1:50 default, 6 kinds, deterministic ids; PDF uses jspdf + svg2pdf with
  a 300dpi raster fallback when CJK text is present; print CSS targets A3 landscape.

## Verification

```bash
pnpm typecheck        # all packages + web + server
pnpm lint             # eslint (dev scripts and generated assets ignored)
pnpm test             # domain 12, catalog 16, autolayout 14, drawing 28, recognition 49,
                      # server 55, web 166
pnpm e2e              # 15 Playwright specs against production build + AI_MOCK server
pnpm build            # web build (3D and export libs split into lazy chunks)
```

E2E covers gallery/project I/O, 2D drawing + undo + layers, 3D presets, import→recognise→apply,
AI brief→一键上图→undo, BOM/CSV, sheet exports, axe accessibility and keyboard command palette.

## Known limitations

Curved walls/stairs are not supported; recognition is rectilinear and needs manual confirmation on
hard scans; PDF Chinese text is rasterised for CJK; BOM is an estimate; AI suggestions must be
reviewed; no accounts, cloud sync, collaboration, or photoreal rendering.
