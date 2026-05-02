# Prompt for Codex: migrate TradingView chart into TailAdmin dashboard

You are working in `/Users/baotm/Desktop/free-nextjs-admin-dashboard`.

Goal: keep the TailAdmin Next.js/Tailwind dashboard as the main app and expose the copied TradingView terminal chart as a single dashboard page at `/chart`.

## Source repo

The original chart repo is `/Users/baotm/Desktop/newchart`.

Important source entry points:

- `/Users/baotm/Desktop/newchart/app/page.tsx`
- `/Users/baotm/Desktop/newchart/components/chart/chart-app-shell.tsx`
- `/Users/baotm/Desktop/newchart/components/chart/tradingview-host.tsx`
- `/Users/baotm/Desktop/newchart/lib/datasources/*`
- `/Users/baotm/Desktop/newchart/lib/storage/*`
- `/Users/baotm/Desktop/newchart/lib/replay/*`
- `/Users/baotm/Desktop/newchart/public/charting_library/*`
- `/Users/baotm/Desktop/newchart/public/tv-custom-studies/*`

## Files already copied into TailAdmin

- `src/components/chart/`
- `src/lib/`
- `public/charting_library/`
- `public/tv-custom-studies/`
- `public/assets/exchanges/`
- `public/sw.js`

## TailAdmin integration already started

- Route page: `src/app/(admin)/chart/page.tsx`
- Sidebar link: `src/layout/AppSidebar.tsx`, item `Trading Chart` pointing to `/chart`
- Admin layout special case: `src/app/(admin)/layout.tsx` removes dashboard padding/max-width for `/chart`
- Chart CSS: appended to `src/app/globals.css`, scoped around `.chart-page` and replay classes

## Dependencies required by copied chart code

Keep these dependencies in `package.json`:

- `firebase`
- `idb`

The dashboard already has Next/React/TypeScript.

## Important implementation notes

1. Do not move the TradingView static library out of `public/charting_library`.
   `TradingViewHost` loads `/charting_library/charting_library.js` and uses `library_path: "/charting_library/"`.

2. Do not move custom studies out of `public/tv-custom-studies`.
   `TradingViewHost` loads scripts such as `/tv-custom-studies/atr-bot.js`.

3. Keep chart app code under `src/`.
   TailAdmin has `@/*` mapped to `./src/*`, so imports like `@/lib/datasources/registry` require `src/lib/datasources/registry.ts`.

4. Keep chart styling scoped.
   The original chart repo's `app/globals.css` set global `body { overflow: hidden; user-select: none; }`. Do not copy those global body rules into TailAdmin because they break dashboard scrolling and forms.

5. The chart page should use the TailAdmin admin shell but no inner content card.
   The chart needs the full content area below `AppHeader`, so keep `/chart` using `h-[calc(100dvh-73px)] overflow-hidden p-0` in `src/app/(admin)/layout.tsx`.

6. Firebase is optional at runtime, but save/load layout features require environment variables:
   `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
   Without these, basic chart loading can still work, but save/load actions may fail.

## Verification checklist

Run:

```bash
npm install
npm run lint
npm run build
npm run dev
```

Then open:

```text
http://localhost:3000/chart
```

Expected behavior:

- Dashboard sidebar/header remain visible.
- The chart fills the main dashboard content area.
- TradingView scripts load from `/charting_library/`.
- Custom indicators load from `/tv-custom-studies/`.
- Symbol search resolves Binance/OANDA symbols via `src/lib/datasources`.
- No global dashboard scrolling/form behavior is broken by chart CSS.

## If build fails

- Missing `firebase` or `idb`: install them with `npm install firebase idb`.
- Import alias failures: confirm copied chart code is under `src/`, not repo root.
- TradingView asset 404: confirm `public/charting_library/charting_library.js` exists.
- Custom study 404: confirm `public/tv-custom-studies/*.js` exists.
- Type errors from TradingView globals: inspect `src/lib/types/charting.ts`; add the narrow missing declaration there instead of weakening TypeScript globally.
