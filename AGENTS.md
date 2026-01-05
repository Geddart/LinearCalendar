# Repository Guidelines

## Project Structure & Module Organization
- SvelteKit app in `src`; layout/page entry live in `routes/+layout.svelte` and `routes/+page.svelte`; server routes under `routes/api/**` and `routes/auth/**` (Google OAuth + Calendar API proxy).
- Components sit in `src/components`; domain logic in `src/lib` (`api` providers, event store/interaction, rendering, viewport input, utils, `types`). Static assets go in `static/`; production output lands in `build/`.
- Re-export shared helpers via `src/lib/index.ts` when useful; keep mock providers in `src/lib/api` for offline development.

## Build, Test, and Development Commands
- `npm install` — install dependencies.
- `npm run dev -- --open` — Vite dev server with browser launch.
- `npm run check` — SvelteKit sync plus `svelte-check` using `tsconfig.json`.
- `npm run build` then `npm run preview` — production bundle and local preview server.
- `npm run test` / `npm run test:run` — Vitest in watch or CI mode; scope runs with `vitest src/lib/rendering/TimeGridRenderer.test.ts` when iterating.

## Coding Style & Naming Conventions
- TypeScript + Svelte with 4-space indentation (see `src/lib/events/EventStore.ts`); keep `<script lang="ts">` typed and favor named exports for shared helpers.
- Components use `PascalCase.svelte`; stores/utilities are camelCase `.ts`. Place rendering in `src/lib/rendering`, state in `src/lib/events` or `src/lib/stores`, and pure helpers in `src/lib/utils`.
- Keep effects localized to components; prefer deterministic helpers for calculations (sun cycles, coloring, instanced rendering).

## Testing Guidelines
- Tests live beside source as `*.test.ts` (e.g., `src/lib/rendering/TimeGridRenderer.test.ts`, `src/lib/events/EventStore.test.ts`); add new cases near the modules they cover.
- Validate new calculations/rendering paths and store mutations; run `npm run test:run` and `npm run check` before PRs.

## Commit & Pull Request Guidelines
- Use short, imperative subjects consistent with history ("Add Google Calendar integration", "Fix iOS mobile resize").
- PRs need a summary, linked issue/Linear ticket, screenshots or clips for UI changes, and notes on migrations or env updates; list automated tests and any manual verification.

## Security & Configuration
- Google flows need `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` in the server environment (`$env/dynamic/private` in `src/routes/auth/google/*` and `src/routes/api/google/*`).
- Keep secrets out of git; use `.env.local` for development, avoid logging tokens, and enforce HTTPS settings in non-dev deploys.
