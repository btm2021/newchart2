# Codex Session Memory: TailAdmin TradingView Dashboard

Use this file as the first prompt/context when opening a new Codex chat session.

## Project Location

Work in:

```text
/Users/baotm/Desktop/free-nextjs-admin-dashboard
```

This is the new target project. It started from TailAdmin's free Next.js admin dashboard and has been extended with a TradingView terminal chart copied from:

```text
/Users/baotm/Desktop/newchart
```

## Product Goal

Build a Tailwind admin dashboard that uses TailAdmin as the main UI shell and includes one full dashboard page for a professional TradingView-style trading chart.

The chart page should live at:

```text
/chart
```

Expected UX:

- Keep TailAdmin sidebar and header visible.
- The chart fills the main content area below the header.
- The chart is not wrapped in extra cards.
- TradingView library assets load locally from `public/charting_library`.
- Custom TradingView indicators load from `public/tv-custom-studies`.
- Datafeed supports multiple market sources through copied datasource adapters.

## Tech Stack

Core app:

- Next.js `16.1.6`
- React `19.2.0`
- React DOM `19.2.0`
- TypeScript `5.9.3`
- Tailwind CSS `4.1.17`
- TailAdmin dashboard structure using App Router under `src/app`

Dashboard/UI libraries:

- ApexCharts and `react-apexcharts`
- FullCalendar
- Flatpickr
- React DnD
- Swiper
- `@svgr/webpack` for SVG components
- `tailwind-merge`

Trading/chart runtime:

- Local TradingView Charting Library under `public/charting_library`
- Custom Pine/TradingView study scripts under `public/tv-custom-studies`
- Datafeed and adapters under `src/lib/datasources`
- Chart layout storage under `src/lib/storage`
- Replay tooling under `src/lib/replay`
- PWA helper under `src/lib/pwa`
- Firebase `12.12.1` for optional remote chart layout/template persistence
- `idb` `8.0.3` for browser storage/symbol cache

## Scripts

Use:

```bash
npm run dev
npm run build
npm run lint
npm run start
```

The dev URL is normally:

```text
http://localhost:3000/chart
```

## Environment

The `.env` and `.env.example` files from `/Users/baotm/Desktop/newchart` were copied into this project root.

Do not print `.env` contents in chat or logs. Treat it as sensitive.

Known env purpose:

- Firebase public config for chart layout/template save/load.
- Workspace ID selection for Firestore-backed chart storage.

Relevant variables are expected to include:

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_WORKSPACE_ID
```

The chart can still load without Firebase config, but TradingView save/load/template features may fail if Firebase is not configured.

## Important File Map

TailAdmin app shell:

```text
src/app/layout.tsx
src/app/(admin)/layout.tsx
src/layout/AppSidebar.tsx
src/layout/AppHeader.tsx
src/context/SidebarContext.tsx
src/context/ThemeContext.tsx
src/app/globals.css
```

Chart page integration:

```text
src/app/(admin)/chart/page.tsx
src/components/chart/chart-app-shell.tsx
src/components/chart/tradingview-host.tsx
```

Copied chart libraries:

```text
src/lib/datasources/
src/lib/firebase/
src/lib/pwa/
src/lib/replay/
src/lib/storage/
src/lib/types/
```

Static chart assets:

```text
public/charting_library/
public/tv-custom-studies/
public/assets/exchanges/
public/sw.js
```

Existing migration note:

```text
CHART_MIGRATION_PROMPT.md
```

This file documents the initial copy/migration checklist.

## What Has Already Been Done

1. Copied the chart React components from the old chart repo into `src/components/chart`.
2. Copied the chart runtime libraries from the old chart repo into `src/lib`.
3. Copied TradingView static assets into `public/charting_library`.
4. Copied custom TradingView studies into `public/tv-custom-studies`.
5. Copied exchange icons into `public/assets/exchanges`.
6. Copied `public/sw.js`.
7. Added route `src/app/(admin)/chart/page.tsx`.
8. Added sidebar menu item `Trading Chart` pointing to `/chart`.
9. Updated `src/app/(admin)/layout.tsx` so `/chart` removes normal dashboard padding/max-width and uses full available height.
10. Added chart CSS to `src/app/globals.css`, scoped around `.chart-page` and replay classes.
11. Added `firebase` and `idb` to `package.json` and updated `package-lock.json`.
12. Copied `.env` and `.env.example` from the chart repo into this dashboard project.
13. Updated ESLint config to ignore vendor/static chart assets in `public/charting_library` and `public/tv-custom-studies`.

## Verification Already Performed

These commands passed after migration:

```bash
npm run build
npm run lint
```

Build output included route:

```text
/chart
```

Lint passed with warnings only. Known warnings at the time of handoff:

- `src/components/chart/tradingview-host.tsx`: hook dependency warning
- `src/lib/datasources/oanda-adapter.ts`: unused import/unused catch variable warnings
- `src/lib/replay/replay-controller.ts`: unused helper warning
- `src/lib/storage/chart-layout-store.ts`: unused destructured `_content` warning

These warnings were not build blockers.

## Key Implementation Constraints

Do not move these paths unless you also update runtime URLs in code:

```text
public/charting_library
public/tv-custom-studies
```

`TradingViewHost` expects:

```ts
await loadScript("/charting_library/charting_library.js");
library_path: "/charting_library/";
custom_css_url: "/charting_library/custom.css";
```

Custom studies are loaded from paths like:

```text
/tv-custom-studies/atr-bot.js
/tv-custom-studies/vsr.js
/tv-custom-studies/fvg.js
```

Keep copied app code under `src/`, because TailAdmin has this TypeScript alias:

```json
"@/*": ["./src/*"]
```

The old chart repo used `@/*` pointed at repo root. In this dashboard, imports such as `@/lib/datasources/registry` require the copied files to stay under `src/lib`.

## CSS/Layout Notes

The old chart repo used global CSS rules like:

```css
body {
  overflow: hidden;
  user-select: none;
}
```

Do not copy those global body rules into TailAdmin. They break dashboard scrolling, inputs, and normal page behavior.

The current TailAdmin integration scopes chart behavior under `.chart-page` and replay classes in `src/app/globals.css`.

The admin layout special case for chart is in:

```text
src/app/(admin)/layout.tsx
```

It checks:

```ts
const isChartPage = pathname === "/chart";
```

and uses:

```text
h-[calc(100dvh-73px)] overflow-hidden p-0
```

for the chart content wrapper.

## Datafeed Architecture

The chart datafeed entry point is:

```text
src/lib/datasources/tradingview-datafeed.ts
```

It uses:

```text
src/lib/datasources/registry.ts
```

to coordinate adapters. Existing adapters include:

- Binance
- OANDA
- Other exchange/source structures copied from the chart repo may exist depending on current files

Symbol defaults come from:

```text
src/lib/storage/workspace-state.ts
```

Current default:

```text
BINANCE_FUTURES:BTCUSDT
interval: 15
chartType: candles
timezone: Asia/Ho_Chi_Minh
```

## Storage Architecture

Workspace state:

```text
src/lib/storage/workspace-state.ts
```

Chart layout/template storage:

```text
src/lib/storage/chart-layout-store.ts
src/lib/storage/tv-save-load-adapter.ts
```

Firebase client:

```text
src/lib/firebase/client.ts
```

If Firebase env is missing, the Firebase client returns `null`; save/load actions that require Firestore can throw.

## PWA/Service Worker

Chart shell registers:

```text
/sw.js
```

from:

```text
public/sw.js
```

This was copied from the old chart repo. If service worker behavior interferes with dashboard development, inspect `src/components/chart/chart-app-shell.tsx` before disabling.

## Git/Workspace State

At handoff, changes were not committed.

Expected modified/new files include:

```text
eslint.config.mjs
package.json
package-lock.json
src/app/(admin)/layout.tsx
src/app/globals.css
src/layout/AppSidebar.tsx
.env
.env.example
CHART_MIGRATION_PROMPT.md
CODEX_SESSION_MEMORY.md
public/assets/
public/charting_library/
public/sw.js
public/tv-custom-studies/
src/app/(admin)/chart/
src/components/chart/
src/lib/
```

There was already a pre-existing dirty `package-lock.json` before part of this migration, so be careful before reverting anything.

## Recommended Next Steps

1. Open `http://localhost:3000/chart` and visually verify chart bootstraps.
2. Confirm Firebase-backed save/load behavior if needed.
3. Optionally clean the remaining lint warnings in copied chart code.
4. Optionally add browser smoke tests for `/chart` asset loading.
5. Commit the migration once visually verified.

## Prompt To Give The Next Codex Session

Use this:

```text
You are working in /Users/baotm/Desktop/free-nextjs-admin-dashboard.

Read CODEX_SESSION_MEMORY.md and CHART_MIGRATION_PROMPT.md first. This project is a TailAdmin Next.js/Tailwind dashboard with a migrated TradingView terminal chart page at /chart. Continue from the current dirty worktree without reverting user changes. Do not print .env contents. Verify changes with npm run lint and npm run build unless the task is purely documentation.
```
