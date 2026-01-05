# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LinearCalendar is a SvelteKit-based web application that visualizes calendar events on an infinite, zoomable timeline with WebGL rendering. The app integrates with Google Calendar and features day/night cycles, seasonal rendering, and an interval tree-based event store for efficient range queries.

## Development Commands

### Core Commands
- `npm install` - Install dependencies
- `npm run dev` - Start development server (default: http://localhost:5173)
- `npm run dev -- --open` - Start dev server and open in browser
- `npm run build` - Build production bundle (outputs to `build/`)
- `npm run preview` - Preview production build locally
- `npm run check` - Run SvelteKit sync + svelte-check for type checking
- `npm run check:watch` - Run type checking in watch mode

### Testing
- `npm run test` - Run Vitest in watch mode
- `npm run test:run` - Run tests once (CI mode)
- `vitest src/lib/rendering/TimeGridRenderer.test.ts` - Run specific test file

## Architecture

### Core Rendering Pipeline
The app uses WebGL for performant rendering of large numbers of events across vast time spans:

1. **ViewportController** (`src/lib/viewport/ViewportController.ts`) - Manages pan/zoom state and calculates visible time range
2. **EventStore** (`src/lib/events/EventStore.ts`) - Interval tree structure for O(log n + k) range queries; deduplicates events by ID
3. **TimeGridRenderer** (`src/lib/rendering/TimeGridRenderer.ts`) - Calculates grid lines and labels with progressive disclosure based on zoom level
4. **InstancedEventRenderer** (`src/lib/rendering/InstancedEventRenderer.ts`) - WebGL instanced rendering for thousands of event rectangles
5. **DayNightWebGLRenderer** & **SeasonsWebGLRenderer** - Ambient background visualizations

### Data Flow

**Google Calendar Integration:**
- OAuth flow: `src/routes/auth/google/+server.ts` → `src/routes/auth/google/callback/+server.ts`
- API proxy endpoints: `src/routes/api/google/calendars/+server.ts` and `src/routes/api/google/events/+server.ts`
- Frontend providers: `src/lib/api/GoogleCalendarProvider.ts` wraps the proxy API
- `EventLoader` (`src/lib/api/EventLoader.ts`) orchestrates multi-calendar loading with caching via `CachingProvider`

**Event Storage:**
- Events added to `EventStore` via `addEvents()`, which rebuilds interval tree on new events
- Store queried via `queryRange(startTime, endTime)` or `queryRangeWithImportance(startTime, endTime, minImportance)`
- `CalendarProvider` interface (`src/lib/api/CalendarProvider.ts`) abstracts data sources (Mock, Google, future Apple/CalDAV)

### Key Stores (Svelte)
- `authStore` - Google OAuth state (access token, expiry, email)
- `calendarStore` - Available calendars and their metadata
- `activeCalendars` - User-selected calendars to display
- `locationStore` - User location for sun calculations
- `eventLoadingStore` - Loading state for async event fetching

### Component Structure
- `Calendar.svelte` - Main component; orchestrates all renderers, viewport, and input handling
- `EventDetailPanel.svelte` - Selected event details panel
- `CalendarSelector.svelte` - Multi-select UI for calendars
- `GoogleConnectButton.svelte` - OAuth flow trigger
- `LocationSettings.svelte` - Geolocation/manual location input

## Important Technical Details

### WebGL Shader Loading
Vite config includes custom GLSL loader for `.vert`, `.frag`, `.glsl` files - they're imported as strings. See `vite.config.ts:8-18`.

### SvelteKit Adapter
Uses `@sveltejs/adapter-static` in SPA mode (`fallback: 'index.html'`). All routes are client-side rendered. Production build outputs to `build/` directory.

### Environment Variables (Server-side only)
Required for Google Calendar integration:
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_CLIENT_SECRET` - OAuth client secret
- `GOOGLE_REDIRECT_URI` - OAuth callback URL (e.g., `http://localhost:5173/auth/google/callback`)

Access via `$env/dynamic/private` in server routes (`src/routes/auth/**`, `src/routes/api/**`). Never expose these client-side.

### Event Model
See `src/lib/types/Event.ts` for full schema. Key fields:
- `startTime`, `endTime` - Unix timestamps in milliseconds
- `importance.effective` - Used for LOD filtering (0-1, higher = more important)
- `lane` - Vertical position (0-7 by default, see `DEFAULT_LANES`)
- `color` - Hex string for event background

### Viewport Coordinate System
- Time (ms) maps to X position via `pixelsPerMs` scale
- Y axis divided into lanes (0-7); events assigned to lanes to prevent overlap
- `ViewportState` tracks `centerTime` (ms), `zoom` (log scale), canvas dimensions

### Progressive Disclosure
`TimeGridRenderer.calculateTimeGrid()` uses continuous spacing-based logic to show/hide grid lines and labels as zoom changes. No discrete LOD levels—opacity fades smoothly. Font weight and size vary by zoom.

## Development Workflow

### Adding New Event Sources
1. Implement `CalendarProvider` interface in `src/lib/api/`
2. Register provider in `EventLoader.ts`
3. Add auth flow in `src/routes/auth/` if needed
4. Update `CalendarSelector.svelte` to support new provider type

### Modifying Renderers
- All renderers extend or use `WebGLContext` (`src/lib/rendering/WebGLContext.ts`) for GL state
- Update shaders by modifying strings in renderer files (no separate shader files currently)
- Test with `npm run dev` and verify in browser at various zoom levels

### Testing
Tests use Vitest with `node` environment (see `vitest.config.ts`). Focus on:
- EventStore range query correctness (`EventStore.test.ts`)
- TimeGridRenderer calculations at different zoom levels (`TimeGridRenderer.test.ts`)
- Mock data generation for visual/integration testing

## Code Style

- **Indentation:** 4 spaces (tabs in some files; follow existing style in each file)
- **TypeScript:** Strict mode enabled; use explicit types for function parameters and returns
- **Svelte:** `<script lang="ts">` blocks; prefer named exports from `$lib`
- **Naming:** PascalCase for components (`.svelte`), camelCase for utilities/stores (`.ts`)
- **Effects:** Keep reactive statements (`$:`) in components; pure functions for calculations

## Existing Documentation

This project has an `AGENTS.md` file with additional guidelines for AI agents. Key points from that file are incorporated above.
