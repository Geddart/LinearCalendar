<script lang="ts">
	import { onMount } from "svelte";
	import { WebGLContext } from "$lib/rendering/WebGLContext";
	import { InstancedEventRenderer } from "$lib/rendering/InstancedEventRenderer";
	import { viewportController } from "$lib/viewport/ViewportController";
	import { InputHandler } from "$lib/viewport/InputHandler";
	import {
		generateMockEvents,
		generateLifeEvents,
		generateTodayEvents,
	} from "$lib/api/MockDataProvider";
	import { hexToRgb } from "$lib/utils/colorUtils";
	import {
		calculateTimeGrid,
		type GridLine,
	} from "$lib/rendering/TimeGridRenderer";
	import type {
		ViewportState,
		CalendarEvent,
		RenderableEvent,
	} from "$lib/types/Event";
	import { DEFAULT_LANES } from "$lib/types/Event";
	import EventDetailPanel from "./EventDetailPanel.svelte";
	import DebugOverlay from "./DebugOverlay.svelte";
	import Toast from "./Toast.svelte";
	import { hitTest, selectEvent } from "$lib/events/EventInteraction";
	import { eventStore } from "$lib/events/EventStore";

	let canvas: HTMLCanvasElement;
	let ctx: WebGLContext;
	let renderer: InstancedEventRenderer;
	let inputHandler: InputHandler;
	let frameId: number;

	// Event data with pre-computed lanes
	let events: CalendarEvent[] = [];
	let eventLanes: Map<string, number> = new Map(); // event.id -> lane index
	let viewport: ViewportState | null = null;
	let unsubscribe: (() => void) | null = null;

	// Debug stats for nerds
	let debugStats = {
		fps: 0,
		objectsDrawn: 0,
		gridLinesCount: 0,
		drawCalls: 0,
		centerTime: "",
		visibleRange: "",
		memoryUsage: "",
	};
	let lastFrameTime = performance.now();
	let frameCount = 0;
	let fpsUpdateInterval = 0;

	// Toast notification for view changes
	let toastMessage = "";
	let toastVisible = false;
	let toastKey = 0; // Unique key to force re-render on rapid presses
	let toastTimeout: ReturnType<typeof setTimeout>;

	// Mobile detection
	let isMobile = false;

	// DEBUG: Track last centerTime to only log when panning
	let debugLastCenterTime = 0;

	function showToast(message: string) {
		// Increment key to force Svelte to re-create the element (restarts animation)
		toastKey++;
		toastMessage = message;
		toastVisible = true;
		clearTimeout(toastTimeout);
		toastTimeout = setTimeout(() => {
			toastVisible = false;
		}, 1500);
	}

	// Time grid state - now using imported GridLine type
	let gridLines: GridLine[] = [];
	let contextLabels = { year: "", month: "", dayNum: "", weekday: "" };

	// Memoization cache for updateTimeGrid (prevent recalculating every frame)
	let lastGridConfig = {
		pixelsPerMs: 0,
		centerTime: 0,
		width: 0,
	};

	// Memoization cache for getVisibleEvents (prevent filtering/mapping every frame)
	let lastVisibleEventsConfig = {
		startTime: 0,
		endTime: 0,
		lodLevel: 0,
	};
	let cachedVisibleEvents: RenderableEvent[] = [];

	let showMonth = false;
	let showDay = false;

	// Layout constants
	const CONTEXT_COL_WIDTH = 130;

	// Lane layout - events organized by calendar (from DEFAULT_LANES)
	// Lanes are compact with small gaps between them
	const LANE_AREA_TOP = 0.1; // Leave space for grid labels at top
	const LANE_AREA_BOTTOM = 0.98; // Use more vertical space
	const LANE_GAP = 0.01; // Small gap between lanes for visual separation
	const TOTAL_LANE_AREA =
		LANE_AREA_BOTTOM -
		LANE_AREA_TOP -
		LANE_GAP * (DEFAULT_LANES.length - 1);
	const LANE_HEIGHT = TOTAL_LANE_AREA / DEFAULT_LANES.length;

	onMount(() => {
		unsubscribe = viewportController.subscribe((state) => {
			viewport = state;
		});

		ctx = new WebGLContext(canvas);
		renderer = new InstancedEventRenderer(ctx);

		viewportController.setCanvas(canvas);
		ctx.resize();
		// Use CSS dimensions for viewport (not DPR-scaled buffer dimensions)
		viewportController.resize(canvas.clientWidth, canvas.clientHeight);

		inputHandler = new InputHandler(canvas);

		// Wire up view change callback for toast notifications
		inputHandler.onViewChange = (viewName: string) => {
			showToast(viewName);
		};

		// Detect mobile
		isMobile =
			/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
				navigator.userAgent,
			) || window.matchMedia("(max-width: 768px)").matches;

		// Generate events and add to EventStore for O(log n) queries
		events = [
			...generateLifeEvents(),
			...generateMockEvents(100),
			...generateTodayEvents(),
		];
		eventStore.addEvents(events);

		// Pre-compute lane assignments ONCE - this prevents jumping
		computeLaneAssignments();

		const handleResize = () => {
			if (ctx.resize()) {
				// Use CSS dimensions for viewport
				viewportController.resize(
					canvas.clientWidth,
					canvas.clientHeight,
				);
			}

			// Update mobile status on resize
			isMobile =
				/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
					navigator.userAgent,
				) || window.matchMedia("(max-width: 768px)").matches;
		};
		window.addEventListener("resize", handleResize);

		const renderLoop = () => {
			render();
			frameId = requestAnimationFrame(renderLoop);
		};
		frameId = requestAnimationFrame(renderLoop);

		return () => {
			window.removeEventListener("resize", handleResize);
			cancelAnimationFrame(frameId);
			inputHandler?.destroy();
			unsubscribe?.();
		};
	});

	/**
	 * Compute lane assignments for all events ONCE at startup.
	 * Now uses calendar-based lanes instead of greedy algorithm.
	 * Events are assigned to lanes based on their calendarLaneId.
	 */
	function computeLaneAssignments() {
		for (const event of events) {
			// Find the lane for this event based on its calendarLaneId
			const lane = DEFAULT_LANES.find(
				(l) => l.id === event.calendarLaneId,
			);
			const laneOrder = lane ? lane.order : 0; // Default to first lane if not found
			eventLanes.set(event.id, laneOrder);
		}
	}

	function render() {
		if (!ctx || !viewport) return;

		// Check for canvas size changes every frame (iOS Safari changes during zoom)
		if (ctx.resize()) {
			viewportController.resize(canvas.clientWidth, canvas.clientHeight);
		}

		// Track FPS
		const now = performance.now();
		frameCount++;
		fpsUpdateInterval += now - lastFrameTime;
		lastFrameTime = now;

		// Update debug stats every 500ms (expensive operations)
		if (fpsUpdateInterval >= 500) {
			debugStats.fps = Math.round(
				(frameCount / fpsUpdateInterval) * 1000,
			);
			frameCount = 0;
			fpsUpdateInterval = 0;

			// Update memory usage (if available)
			if ((performance as any).memory) {
				const mem = (performance as any).memory;
				debugStats.memoryUsage = `${Math.round(mem.usedJSHeapSize / 1024 / 1024)}MB`;
			}

			// Format center time (expensive toLocaleString - only update every 500ms)
			const centerDate = new Date(viewport.centerTime);
			debugStats.centerTime = centerDate
				.toLocaleString("en-CA", {
					year: "numeric",
					month: "2-digit",
					day: "2-digit",
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit",
					hour12: false,
				})
				.replace(",", "");

			// Format visible time range (only update every 500ms)
			const visibleMs = viewport.width / viewport.pixelsPerMs;
			debugStats.visibleRange = formatDuration(visibleMs);
		}

		ctx.clear(0.98, 0.98, 0.99);

		updateTimeGrid();

		const visibleEvents = getVisibleEvents();
		renderer.render(visibleEvents, viewport);

		// Update lightweight debug stats (these are cheap, can run every frame)
		debugStats.objectsDrawn = visibleEvents.length;
		debugStats.gridLinesCount = gridLines.length;
		// With instanced rendering: 1 draw call for all events + grid lines drawn via HTML
		debugStats.drawCalls = visibleEvents.length > 0 ? 1 : 0;
	}

	/**
	 * Format milliseconds into human-readable duration
	 */
	function formatDuration(ms: number): string {
		const seconds = ms / 1000;
		const minutes = seconds / 60;
		const hours = minutes / 60;
		const days = hours / 24;
		const years = days / 365.25;

		if (years >= 1) return `${years.toFixed(1)} years`;
		if (days >= 1) return `${days.toFixed(1)} days`;
		if (hours >= 1) return `${hours.toFixed(1)} hours`;
		if (minutes >= 1) return `${minutes.toFixed(1)} min`;
		return `${seconds.toFixed(1)} sec`;
	}

	/**
	 * Update time grid using extracted renderer module.
	 * Uses memoization to skip recalculation when viewport hasn't changed significantly.
	 */
	function updateTimeGrid() {
		if (!viewport) return;

		// Memoization: skip recalculation if viewport hasn't changed significantly
		const zoomChanged =
			Math.abs(viewport.pixelsPerMs - lastGridConfig.pixelsPerMs) /
				viewport.pixelsPerMs >
			0.001;
		const panChanged =
			Math.abs(viewport.centerTime - lastGridConfig.centerTime) *
				viewport.pixelsPerMs >
			0.5;
		const sizeChanged = viewport.width !== lastGridConfig.width;

		if (
			!zoomChanged &&
			!panChanged &&
			!sizeChanged &&
			gridLines.length > 0
		) {
			return; // Use cached result
		}

		// Update cache
		lastGridConfig.pixelsPerMs = viewport.pixelsPerMs;
		lastGridConfig.centerTime = viewport.centerTime;
		lastGridConfig.width = viewport.width;

		const result = calculateTimeGrid({
			startTime: viewport.startTime,
			endTime: viewport.endTime,
			centerTime: viewport.centerTime,
			pixelsPerMs: viewport.pixelsPerMs,
			width: viewport.width,
			isMobile,
			contextColWidth: CONTEXT_COL_WIDTH,
		});

		gridLines = result.gridLines;
		contextLabels = result.contextLabels;
	}

	function getVisibleEvents(): RenderableEvent[] {
		if (!viewport) return [];
		const { startTime, endTime, lodLevel } = viewport;

		// Memoization: skip recalculation if viewport hasn't changed significantly
		const rangeChanged =
			Math.abs(startTime - lastVisibleEventsConfig.startTime) *
				viewport.pixelsPerMs >
				1 ||
			Math.abs(endTime - lastVisibleEventsConfig.endTime) *
				viewport.pixelsPerMs >
				1;
		const lodChanged = lodLevel !== lastVisibleEventsConfig.lodLevel;

		if (!rangeChanged && !lodChanged && cachedVisibleEvents.length > 0) {
			return cachedVisibleEvents; // Use cached result
		}

		// Update cache
		lastVisibleEventsConfig.startTime = startTime;
		lastVisibleEventsConfig.endTime = endTime;
		lastVisibleEventsConfig.lodLevel = lodLevel;

		const importanceThreshold = getImportanceThreshold(lodLevel);

		// Use EventStore for O(log n + k) range query instead of O(n) filter
		const filtered = eventStore.queryRangeWithImportance(
			startTime,
			endTime,
			importanceThreshold,
		);

		// Sort by importance for rendering order (most important on top)
		filtered.sort(
			(a, b) => b.importance.effective - a.importance.effective,
		);

		cachedVisibleEvents = filtered.map((e) => {
			// Use pre-computed lane order from calendar-based assignment
			const laneOrder = eventLanes.get(e.id) ?? 0;

			// Get the lane definition to use its color
			const lane = DEFAULT_LANES[laneOrder] || DEFAULT_LANES[0];
			const rgb = hexToRgb(lane.color);

			// Calculate Y position based on lane layout (with gaps)
			// Lanes are positioned from top to bottom based on DEFAULT_LANES order
			// Center is at middle of (LANE_HEIGHT + LANE_GAP) span so events fill separator to separator
			const laneY =
				LANE_AREA_TOP +
				laneOrder * (LANE_HEIGHT + LANE_GAP) +
				(LANE_HEIGHT + LANE_GAP) / 2;

			return {
				id: parseInt(e.id.replace(/\D/g, "")) || 0,
				startTime: e.startTime,
				endTime: e.endTime,
				// Y position for WebGL (0 = bottom, 1 = top) - invert from screen coords
				y: 1 - laneY,
				colorR: rgb.r,
				colorG: rgb.g,
				colorB: rgb.b,
				colorA: 1,
				importance: e.importance.effective,
				flags: 0,
			};
		});

		return cachedVisibleEvents;
	}

	// Reactive layout offset - always 0 since context column is now a floating card
	$: contextOffset = 0;

	function getImportanceThreshold(lodLevel: number): number {
		return Math.pow(lodLevel / 10, 2);
	}

	/**
	 * Track mouse position for distinguishing clicks from drags
	 */
	let mouseDownPos: { x: number; y: number } | null = null;
	const DRAG_THRESHOLD = 5; // pixels - movement beyond this is considered a drag

	function handleCanvasMouseDown(e: MouseEvent) {
		mouseDownPos = { x: e.clientX, y: e.clientY };
	}

	function handleCanvasMouseUp(e: MouseEvent) {
		if (!mouseDownPos) return;

		// Check if this was a drag (moved more than threshold)
		const dx = e.clientX - mouseDownPos.x;
		const dy = e.clientY - mouseDownPos.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance > DRAG_THRESHOLD) {
			// This was a drag, not a click - don't open panel
			mouseDownPos = null;
			return;
		}

		mouseDownPos = null;

		// This was a click - perform hit test
		if (!viewport || !canvas) return;

		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		const event = hitTest(
			x,
			y,
			viewport,
			events,
			eventLanes,
			canvas.clientWidth,
			canvas.clientHeight,
		);

		selectEvent(event);
	}
</script>

<div class="calendar-container">
	<canvas
		bind:this={canvas}
		on:mousedown={handleCanvasMouseDown}
		on:mouseup={handleCanvasMouseUp}
	></canvas>

	<!-- Grid lines (HTML overlay) with smooth LOD transitions -->
	<div class="grid-overlay" style="left: {contextOffset}px;">
		{#each gridLines as line (line.key)}
			<div
				class="grid-line"
				class:major={line.isMajor}
				class:sub-unit={line.isSubUnit}
				style="left: {line.x - contextOffset}px; 
					   opacity: {line.opacity}; 
					   height: {line.lineHeight * 100}%;
					   top: 0;"
			>
				{#if line.label}
					<span
						class="grid-label"
						class:major={line.isMajor}
						style="opacity: {line.labelOpacity ??
							line.opacity}; font-weight: {line.fontWeight}; font-size: {line.fontSize}px;"
						>{line.label}</span
					>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Lane separators with labels -->
	<div
		class="lane-overlay"
		style="left: {isMobile ? 0 : CONTEXT_COL_WIDTH}px;"
	>
		{#each DEFAULT_LANES as lane, i}
			<div
				class="lane-separator"
				style="top: {(LANE_AREA_TOP + i * (LANE_HEIGHT + LANE_GAP)) *
					100}%"
			>
				<span class="lane-label" style="color: {lane.color}"
					>{lane.name}</span
				>
			</div>
		{/each}
	</div>

	<!-- Context column (sticky left) - always show full date -->
	<div class="context-column" style="width: {CONTEXT_COL_WIDTH}px;">
		<div class="context-year">{contextLabels.year}</div>
		<div class="context-month">{contextLabels.month}</div>
		<div class="context-day-num">{contextLabels.dayNum}</div>
		<div class="context-weekday">{contextLabels.weekday}</div>

		<button
			class="today-button"
			on:click={() => viewportController.goToToday()}
		>
			Today
		</button>
	</div>

	<!-- Center date indicator (red line) -->
	<div class="center-line"></div>

	<!-- Debug overlay - Stats for Nerds -->
	{#if viewport}
		<DebugOverlay
			fps={debugStats.fps}
			objectsDrawn={debugStats.objectsDrawn}
			gridLinesCount={debugStats.gridLinesCount}
			drawCalls={debugStats.drawCalls}
			lodLevel={viewport.lodLevel}
			pixelsPerMs={viewport.pixelsPerMs}
			visibleRange={debugStats.visibleRange}
			centerTime={debugStats.centerTime}
			memoryUsage={debugStats.memoryUsage}
			{isMobile}
		/>
	{/if}

	<!-- Toast notification for view changes -->
	{#key toastKey}
		<Toast message={toastMessage} visible={toastVisible} />
	{/key}

	<!-- Keyboard shortcuts help (desktop only) -->
	{#if !isMobile}
		<div class="shortcuts-help">
			<div class="shortcuts-title">Keyboard Shortcuts</div>
			<div class="shortcut">
				<span class="key">←</span><span class="key">→</span> Pan
			</div>
			<div class="shortcut">
				<span class="key">↑</span><span class="key">↓</span> Zoom
			</div>
			<div class="shortcut">
				<span class="key">⌘</span>+Scroll Zoom
			</div>
			<div class="shortcut">
				<span class="key">⇧</span>+<span class="key">←</span><span
					class="key">→</span
				> Jump
			</div>
			<div class="shortcut"><span class="key">T</span> Today</div>
			<div class="shortcut">
				<span class="key">1</span>-<span class="key">9</span> Presets
			</div>
		</div>
	{/if}

	<!-- Mobile gestures help -->
	{#if isMobile}
		<div class="mobile-help">
			<div class="mobile-gesture">
				<span class="gesture-icon">👆</span> Drag to pan
			</div>
			<div class="mobile-gesture">
				<span class="gesture-icon">🤏</span> Pinch to zoom
			</div>
		</div>
	{/if}

	<!-- Event detail panel (slide-out) -->
	<EventDetailPanel />
</div>

<style>
	.calendar-container {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
	}

	canvas {
		width: 100%;
		height: 100%;
		display: block;
	}

	.grid-overlay {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		overflow: hidden;
	}

	/* Lane overlay for calendar lanes */
	.lane-overlay {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.lane-separator {
		position: absolute;
		left: 0;
		right: 0;
		height: 1px;
		background: rgba(0, 0, 0, 0.08);
	}

	.lane-label {
		position: absolute;
		top: 4px;
		left: 8px;
		font-size: 11px;
		font-weight: 600;
		font-family:
			"Inter",
			-apple-system,
			BlinkMacSystemFont,
			"Segoe UI",
			sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		opacity: 0.6;
	}

	.grid-line {
		position: absolute;
		top: 0;
		width: 1px;
		background: #ccc;
		transition: opacity 0.2s ease;
	}

	.grid-line.major {
		background: #999;
		width: 1px;
	}

	.grid-line.sub-unit {
		background: #ddd;
	}

	.grid-label {
		position: absolute;
		top: 8px;
		left: 6px;
		font-size: 12px; /* Base size - but can be overridden inline */
		color: #888;
		font-family:
			"Inter",
			-apple-system,
			BlinkMacSystemFont,
			"Segoe UI",
			sans-serif;
		white-space: nowrap;
		/* Smooth transitions for opacity and color */
		transition:
			opacity 0.15s ease,
			color 0.15s ease;
		/* font-weight and font-size are set inline for smooth variable font transitions */
	}

	.grid-label.major {
		/* Only color changes for major - size controlled via inline style */
		color: #333;
	}

	.context-column {
		position: absolute;
		top: 16px;
		left: 16px;
		bottom: auto;
		right: auto;
		width: auto !important; /* Override inline width */
		min-width: 140px;
		background: rgba(255, 255, 255, 0.95);
		border: 1px solid rgba(0, 0, 0, 0.05);
		border-radius: 12px;
		padding: 12px 16px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
		z-index: 10;
	}

	.context-year {
		font-size: 24px;
		font-weight: 700;
		color: #000;
		margin-bottom: 4px;
	}

	.context-month {
		font-size: 16px;
		color: #444;
		margin-bottom: 2px;
	}

	.context-day-num {
		font-size: 14px;
		color: #666;
	}

	.context-weekday {
		font-size: 13px;
		color: #888;
	}

	/* Center date indicator line */
	.center-line {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 1px;
		background: #e53935;
		opacity: 0.7;
		pointer-events: none;
		z-index: 5;
	}

	/* Today button - fixed position like mobile */
	.today-button {
		position: fixed;
		bottom: 24px;
		left: 24px;
		right: auto;
		width: auto;
		padding: 10px 16px;
		background: #e53935;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
		z-index: 100;
		box-shadow: 0 4px 12px rgba(229, 57, 53, 0.3);
		pointer-events: auto;
	}

	.today-button:hover {
		background: #c62828;
	}

	.today-button:active {
		background: #b71c1c;
	}

	/* Keyboard shortcuts help box */
	.shortcuts-help {
		position: absolute;
		bottom: 16px;
		right: 16px;
		background: rgba(0, 0, 0, 0.75);
		color: white;
		padding: 12px 16px;
		border-radius: 8px;
		font-size: 12px;
		pointer-events: none;
		z-index: 15;
	}

	.shortcuts-title {
		font-weight: 600;
		margin-bottom: 8px;
		font-size: 13px;
		color: #ddd;
	}

	.shortcut {
		margin: 4px 0;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.key {
		display: inline-block;
		background: rgba(255, 255, 255, 0.15);
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 4px;
		padding: 2px 6px;
		font-family: monospace;
		font-size: 11px;
		min-width: 18px;
		text-align: center;
	}

	/* Mobile gestures help */
	.mobile-help {
		position: absolute;
		bottom: 16px;
		right: 16px;
		background: rgba(0, 0, 0, 0.75);
		color: white;
		padding: 12px 16px;
		border-radius: 8px;
		font-size: 13px;
		pointer-events: none;
		z-index: 15;
	}

	.mobile-gesture {
		margin: 4px 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.gesture-icon {
		font-size: 16px;
	}

	/* Hide shortcuts on mobile */
	/* Mobile Styles */
	@media (max-width: 768px) {
		.shortcuts-help {
			display: none;
		}

		/* Mobile adjustments for floating card */
		.context-column {
			pointer-events: none; /* Let clicks pass through empty areas on mobile */
		}

		/* Re-enable pointer events for content */
		.context-column > * {
			pointer-events: auto;
		}

		.context-year {
			font-size: 20px; /* Slightly smaller on mobile */
			margin-bottom: 2px;
		}

		.context-month {
			font-size: 14px;
		}

		/* Ensure usage help is visible */
		.mobile-help {
			bottom: 24px;
			right: 24px;
			background: rgba(0, 0, 0, 0.85);
			backdrop-filter: blur(8px);
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		}
	}
</style>
