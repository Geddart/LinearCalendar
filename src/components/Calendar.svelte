<script lang="ts">
	import { onMount, tick } from "svelte";
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
	import GoogleConnectButton from "./GoogleConnectButton.svelte";
	import CalendarSelector from "./CalendarSelector.svelte";
	import {
		authStore,
		loadAuthState,
		saveAuthState,
	} from "$lib/stores/authStore";
	import { googleProvider } from "$lib/api/GoogleCalendarProvider";
	import type { CalendarInfo } from "$lib/api/CalendarProvider";
	import { calendarStore, activeCalendars } from "$lib/stores/calendarStore";
	import { generateHistoricalEvents } from "$lib/api/HistoricalEvents";
	import { locationStore } from "$lib/stores/locationStore";
	import { DayNightWebGLRenderer } from "$lib/rendering/DayNightWebGLRenderer";
	import { SeasonsWebGLRenderer } from "$lib/rendering/SeasonsWebGLRenderer";
	import LocationSettings from "./LocationSettings.svelte";
	import { eventLoader } from "$lib/api/EventLoader";
	import {
		eventLoadingStore,
		isLoadingEvents as loadingEventsStore,
	} from "$lib/stores/eventLoadingStore";

	let canvas: HTMLCanvasElement;
	let ctx: WebGLContext;
	let renderer: InstancedEventRenderer;
	let inputHandler: InputHandler;
	let dayNightRenderer: DayNightWebGLRenderer;
	let seasonsRenderer: SeasonsWebGLRenderer;
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

	// Loading indicator for initial calendar list fetch
	let isLoadingCalendarList = false;

	// Combined loading state: calendar list fetch OR lazy event loading
	$: isLoadingEvents = isLoadingCalendarList || $loadingEventsStore;

	// Now indicator state
	let nowTime = Date.now();
	let isFollowingNow = false;
	let isSnappedToNow = false;
	let isSnapEnabled = true;

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
	let contextLabels = {
		year: "",
		month: "",
		dayNum: "",
		weekday: "",
		time: "",
	};

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

	// Google Calendar integration state
	let showCalendarSelector = false;
	let showLocationSettings = false;

	// Day/night overlay uses WebGL rendering (no state needed here)
	let googleCalendars: CalendarInfo[] = [];

	/**
	 * Open calendar settings modal and fetch available calendars
	 */
	async function openCalendarSettings() {
		try {
			const result = await googleProvider.getCalendars();
			if (!result.error) {
				googleCalendars = result.data;
			}
		} catch (err) {
			console.error("Failed to fetch calendars:", err);
		}
		showCalendarSelector = true;
	}

	/**
	 * Handle calendar selection save - reload events from selected calendars
	 */
	async function handleCalendarsSave() {
		showToast("Calendars updated");
		// Events will be reloaded via calendarStore subscription
	}

	/**
	 * Load events from Google calendars and historical events
	 *
	 * Note: Google Calendar events are now loaded lazily via EventLoader
	 * based on viewport position. This function only handles:
	 * - Historical events (loaded immediately if enabled)
	 * - Setting up the EventLoader with calendar info
	 */
	async function loadEventsFromCalendars(state: {
		selected: Set<string>;
		visible: Set<string>;
		showHistorical: boolean;
	}) {
		const allEvents: CalendarEvent[] = [];

		// Load historical events if enabled (these are static, load all at once)
		if (state.showHistorical) {
			const historical = generateHistoricalEvents();
			allEvents.push(...historical);
		}

		// Clear event store and add historical events
		eventStore.clear();
		eventLoader.clearCache();

		if (allEvents.length > 0) {
			eventStore.addEvents(allEvents);
		}

		// Set up EventLoader with visible calendars for lazy loading
		if ($authStore.isConnected && state.selected.size > 0) {
			const visibleCalendars = googleCalendars.filter(
				(c) => state.selected.has(c.id) && state.visible.has(c.id),
			);
			eventLoader.setCalendars(visibleCalendars);

			// Trigger initial load for current viewport
			if (viewport) {
				eventLoader.updateViewport(
					viewport.startTime,
					viewport.endTime,
				);
			}
		}

		// Update local events array for lane computation
		events = allEvents;

		// Recompute lane assignments
		computeLaneAssignments();
	}

	// Dynamic lane calculation based on visible calendars
	// Include color for each lane
	$: visibleCalendarList = $calendarStore.showHistorical
		? [
				{ id: "historical", name: "Historical", color: "#4285f4" },
				...googleCalendars.filter((c) =>
					$calendarStore.visible.has(c.id),
				),
			]
		: googleCalendars.filter((c) => $calendarStore.visible.has(c.id));

	$: laneCount = Math.max(1, visibleCalendarList.length);

	/**
	 * Get the color for an event based on its category (calendar ID)
	 */
	function getEventColor(event: CalendarEvent): string {
		// Use the event's own color if set
		if (event.color) return event.color;

		// Find the calendar's color
		const calendar = visibleCalendarList.find(
			(c) => c.id === event.category,
		);
		if (calendar?.color) return calendar.color;

		// Default colors by category
		if (event.category === "historical") return "#4285f4";

		return "#888888";
	}

	// Layout constants
	const CONTEXT_COL_WIDTH = 130;

	// Lane layout - events organized by calendar (dynamic)
	const LANE_AREA_TOP = 0.12; // Padding at top
	const LANE_AREA_BOTTOM = 0.95; // Padding at bottom
	const LANE_GAP = 0.015; // Gap between lanes

	// Reactive lane height based on number of visible calendars
	$: totalLaneArea =
		LANE_AREA_BOTTOM - LANE_AREA_TOP - LANE_GAP * (laneCount - 1);
	$: laneHeight = laneCount > 0 ? totalLaneArea / laneCount : 0.2;

	onMount(() => {
		unsubscribe = viewportController.subscribe((state) => {
			viewport = state;
		});

		ctx = new WebGLContext(canvas);
		renderer = new InstancedEventRenderer(ctx);
		dayNightRenderer = new DayNightWebGLRenderer(ctx);
		seasonsRenderer = new SeasonsWebGLRenderer(ctx);

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

		// Load calendar store state
		calendarStore.load();

		// Load location store state
		locationStore.load();

		// Track if we've already loaded calendars to prevent duplicate fetches
		let hasLoadedCalendars = false;

		// Subscribe to auth changes - load calendars when connected
		const authUnsub = authStore.subscribe(async (auth) => {
			if (auth.isConnected && !hasLoadedCalendars) {
				hasLoadedCalendars = true;
				isLoadingCalendarList = true;
				try {
					// Fetch calendar list
					const result = await googleProvider.getCalendars();
					if (!result.error && result.data) {
						googleCalendars = result.data;
						calendarStore.setAvailable(result.data);

						// If has saved selections, load those; otherwise select primary
						if ($calendarStore.selected.size === 0) {
							const primary = result.data.find(
								(c) => c.isPrimary,
							);
							if (primary) {
								calendarStore.setSelected([primary.id]);
							}
						}
					}
				} catch (err) {
					console.error("Failed to load calendars:", err);
				}
				isLoadingCalendarList = false;
			}
		});

		// Subscribe to calendar changes and load events
		const calendarUnsub = calendarStore.subscribe((state) => {
			if (state.selected.size > 0 || state.showHistorical) {
				loadEventsFromCalendars(state);
			}
		});

		// Subscribe to follow-now state changes
		const followNowUnsub = viewportController.subscribeFollowNow(
			(following) => {
				isFollowingNow = following;
			},
		);

		// Subscribe to snap-to-now state changes
		const snapUnsub = viewportController.subscribeSnap((snapped) => {
			isSnappedToNow = snapped;
		});

		// Subscribe to snap enabled state changes
		const snapEnabledUnsub = viewportController.subscribeSnapEnabled(
			(enabled) => {
				isSnapEnabled = enabled;
			},
		);

		// Subscribe to viewport changes for lazy loading events
		const viewportUnsub = viewportController.subscribe((state) => {
			// Trigger lazy loading when viewport changes
			if (state.startTime && state.endTime) {
				eventLoader.updateViewport(state.startTime, state.endTime);
			}
		});

		// Pre-compute lane assignments (will be called by loadEventsFromCalendars)

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
			authUnsub?.();
			calendarUnsub?.();
			followNowUnsub?.();
			snapUnsub?.();
			snapEnabledUnsub?.();
			viewportUnsub?.();
		};
	});

	/**
	 * Compute lane assignments for all events.
	 * Uses calendar-based lanes - each calendar gets its own horizontal lane.
	 */
	function computeLaneAssignments() {
		eventLanes.clear();

		// Build a map from calendar ID to lane index
		const calendarToLane = new Map<string, number>();
		visibleCalendarList.forEach((cal, index) => {
			calendarToLane.set(cal.id, index);
		});

		for (const event of events) {
			// Determine which lane this event belongs to
			let laneIndex = 0;

			if (event.category === "historical") {
				// Historical events go to the historical lane
				laneIndex = calendarToLane.get("historical") ?? 0;
			} else if (event.category) {
				// Google events use their calendar ID as category
				laneIndex = calendarToLane.get(event.category) ?? 0;
			}

			eventLanes.set(event.id, laneIndex);
		}
	}

	/**
	 * Get the lane index for an event.
	 * Computes on-the-fly for lazy-loaded events that don't have a pre-computed lane.
	 */
	function getLaneForEvent(event: CalendarEvent): number {
		// Check if we have a pre-computed lane
		const cachedLane = eventLanes.get(event.id);
		if (cachedLane !== undefined) {
			return cachedLane;
		}

		// Compute lane on-the-fly for lazy-loaded events
		if (event.category === "historical") {
			const idx = visibleCalendarList.findIndex(
				(c) => c.id === "historical",
			);
			return idx >= 0 ? idx : 0;
		} else if (event.category) {
			const idx = visibleCalendarList.findIndex(
				(c) => c.id === event.category,
			);
			return idx >= 0 ? idx : 0;
		}

		return 0;
	}

	function render() {
		if (!ctx || !viewport) return;

		// Check for canvas size changes every frame (iOS Safari changes during zoom)
		if (ctx.resize()) {
			viewportController.resize(canvas.clientWidth, canvas.clientHeight);
		}

		// Update "now" time each frame for the now indicator
		nowTime = Date.now();

		// Update viewport if following "now" mode
		viewportController.updateFollowNow();

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

		// Render seasons overlay (visible at Year view and more zoomed out)
		seasonsRenderer.render(viewport, $locationStore.latitude);

		// Render day/night overlay (visible at Day view and more zoomed in)
		dayNightRenderer.render(
			viewport,
			$locationStore.latitude,
			$locationStore.longitude,
		);

		const visibleEvents = getVisibleEvents();
		renderer.render(visibleEvents, viewport, laneCount);

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
			// Get lane for event (computes on-the-fly for lazy-loaded events)
			const laneOrder = getLaneForEvent(e);

			// Get the calendar's color for this event
			const calendarColor = getEventColor(e);
			const rgb = hexToRgb(calendarColor);

			// Calculate Y position based on lane layout (with gaps)
			// Center is at middle of (laneHeight + LANE_GAP) span so events fill separator to separator
			const laneY =
				LANE_AREA_TOP +
				laneOrder * (laneHeight + LANE_GAP) +
				(laneHeight + LANE_GAP) / 2;

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

	// Helper to format time as hh:mm:ss
	function formatTimeHHMMSS(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		});
	}

	// Display time: use real-time nowTime when following, otherwise use context label time
	$: displayTime = isFollowingNow
		? formatTimeHHMMSS(nowTime)
		: contextLabels.time;

	// Get all visible events from the store for UI (labels, hit testing)
	// This includes both historical events and lazy-loaded events
	$: visibleEventsForUI = viewport
		? eventStore.queryRange(viewport.startTime, viewport.endTime)
		: [];

	// Compute which events should show labels (filter overlapping events in same lane)
	// Only the first event in each overlapping group shows a label
	$: labelsToShow = (() => {
		const showLabel = new Set<string>();
		// Group events by lane
		const laneEvents = new Map<number, CalendarEvent[]>();
		for (const event of visibleEventsForUI) {
			const lane = getLaneForEvent(event);
			if (!laneEvents.has(lane)) laneEvents.set(lane, []);
			laneEvents.get(lane)!.push(event);
		}
		// For each lane, find overlapping groups and only show first label
		for (const [_, laneEvts] of laneEvents) {
			// Sort by start time
			const sorted = [...laneEvts].sort(
				(a, b) => a.startTime - b.startTime,
			);
			// Track occupied time ranges
			const occupied: { start: number; end: number }[] = [];
			for (const evt of sorted) {
				// Check if this event overlaps with any occupied range
				const overlaps = occupied.some(
					(r) => evt.startTime < r.end && evt.endTime > r.start,
				);
				if (!overlaps) {
					// No overlap, show this label and mark its range as occupied
					showLabel.add(evt.id);
					occupied.push({ start: evt.startTime, end: evt.endTime });
				}
				// If overlaps, skip showing label for this event
			}
		}
		return showLabel;
	})();

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
			visibleEventsForUI,
			getLaneForEvent,
			canvas.clientWidth,
			canvas.clientHeight,
			laneCount,
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

	<!-- Day/night overlay is now rendered in WebGL -->

	<!-- Lane separators with labels -->
	<div
		class="lane-overlay"
		style="left: {isMobile ? 0 : CONTEXT_COL_WIDTH}px;"
	>
		{#each visibleCalendarList as cal, i}
			<div
				class="lane-separator"
				style="top: {(LANE_AREA_TOP + i * (laneHeight + LANE_GAP)) *
					100}%"
			>
				<span class="lane-label" style="color: {cal.color || '#888'}"
					>{cal.name}</span
				>
			</div>
		{/each}
	</div>

	<!-- Event labels overlay (HTML text on top of WebGL events) -->
	{#if viewport}
		<div
			class="event-labels-overlay"
			style="left: {isMobile ? 0 : CONTEXT_COL_WIDTH}px;"
		>
			{#each visibleEventsForUI as event (event.id)}
				{@const isVisible =
					event.startTime < viewport.endTime &&
					event.endTime > viewport.startTime}
				{@const pixelWidth =
					(event.endTime - event.startTime) * viewport.pixelsPerMs}
				{@const labelOpacity = Math.min(
					1,
					Math.max(0, (pixelWidth - 40) / 60),
				)}
				{@const overlayOffset = isMobile ? 0 : CONTEXT_COL_WIDTH}
				{@const overlayWidth = viewport.width - overlayOffset}
				{@const eventStartX =
					(event.startTime - viewport.startTime) *
						viewport.pixelsPerMs -
					overlayOffset}
				{@const eventEndX =
					(event.endTime - viewport.startTime) *
						viewport.pixelsPerMs -
					overlayOffset}
				{@const laneOrder = getLaneForEvent(event)}
				{@const eventY =
					LANE_AREA_TOP +
					laneOrder * (laneHeight + LANE_GAP) +
					laneHeight / 2}
				{@const labelLeft = Math.max(0, eventStartX) + 4}
				{@const labelRight = Math.min(eventEndX, overlayWidth) - 4}
				{@const labelWidth = Math.max(0, labelRight - labelLeft)}
				{@const canShowLabel =
					labelsToShow.has(event.id) &&
					eventStartX >= 0 &&
					labelWidth > 40}
				{#if isVisible && pixelWidth > 5}
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<div
						class="event-label"
						class:has-text={canShowLabel && labelOpacity > 0.1}
						style="
							left: {labelLeft}px;
							top: {eventY * 100}%;
							width: {labelWidth}px;
						"
						on:click|stopPropagation={() => selectEvent(event)}
					>
						{#if canShowLabel && labelOpacity > 0.05}
							<span
								class="event-title"
								style="opacity: {labelOpacity};"
							>
								{event.title}
							</span>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Context column (sticky left) - always show full date -->
	<div class="context-column" style="width: {CONTEXT_COL_WIDTH}px;">
		<div class="context-year">{contextLabels.year}</div>
		<div class="context-month">{contextLabels.month}</div>
		<div class="context-day-num">{contextLabels.dayNum}</div>
		<div class="context-weekday">{contextLabels.weekday}</div>
		<div class="context-time">{displayTime}</div>

		{#if isSnappedToNow}
			<div class="snap-indicator" title="Locked to current time">🔒</div>
		{/if}

		<GoogleConnectButton on:settingsClick={openCalendarSettings} />

		<button
			class="today-button"
			on:click={() => viewportController.goToToday()}
		>
			Today
		</button>

		<button
			class="follow-now-button"
			class:active={isFollowingNow}
			on:click={() => viewportController.toggleFollowNow()}
			title={isFollowingNow
				? "Stop following time"
				: "Follow current time"}
		>
			🕐
		</button>

		<button
			class="location-button"
			on:click={() => (showLocationSettings = true)}
			title="Location settings"
		>
			📍
		</button>

		<button
			class="snap-toggle-button"
			class:disabled={!isSnapEnabled}
			class:snapping={isSnappedToNow}
			on:click={() => viewportController.toggleSnapEnabled()}
			title={isSnapEnabled ? "Disable snap-to-now" : "Enable snap-to-now"}
		>
			🧲
		</button>

		{#if isLoadingEvents}
			<div class="loading-indicator">Loading...</div>
		{/if}
	</div>

	<!-- Center date indicator (red line) -->
	<div class="center-line"></div>

	<!-- Now time indicator (blue line) -->
	{#if viewport}
		{@const nowX = (nowTime - viewport.startTime) * viewport.pixelsPerMs}
		{#if nowX >= 0 && nowX <= viewport.width}
			<div
				class="now-indicator"
				class:following={isFollowingNow}
				style="left: {nowX}px;"
			></div>
		{/if}
	{/if}

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

	<!-- Calendar selector modal -->
	<CalendarSelector
		calendars={googleCalendars}
		visible={showCalendarSelector}
		on:close={() => (showCalendarSelector = false)}
		on:save={handleCalendarsSave}
	/>

	<!-- Location settings modal -->
	<LocationSettings
		visible={showLocationSettings}
		on:close={() => (showLocationSettings = false)}
		on:save={() => (showLocationSettings = false)}
	/>

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

	/* Day/night cycle overlay */
	.day-night-overlay {
		position: absolute;
		top: 28px;
		right: 0;
		height: 10px;
		pointer-events: none;
		overflow: hidden;
		transition: opacity 0.3s ease;
	}

	.day-night-segment {
		position: absolute;
		top: 0;
		height: 100%;
		transition: opacity 0.2s ease;
	}

	.sun-icon {
		position: absolute;
		top: -2px;
		transform: translateX(-50%);
		font-size: 10px;
		pointer-events: none;
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.1));
	}

	/* Location settings button */
	.location-button {
		position: fixed;
		bottom: 24px;
		left: 150px;
		width: 40px;
		height: 40px;
		padding: 0;
		background: rgba(100, 100, 100, 0.9);
		color: white;
		border: none;
		border-radius: 50%;
		font-size: 18px;
		cursor: pointer;
		transition: all 0.2s ease;
		z-index: 100;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.location-button:hover {
		background: rgba(80, 80, 80, 0.95);
		transform: scale(1.05);
	}

	.grid-label {
		position: absolute;
		top: 8px;
		left: 6px;
		font-size: 12px; /* Base size - but can be overridden inline */
		color: #555;
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
		color: #111;
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

	.context-time {
		font-size: 12px;
		color: #999;
		font-family: "SF Mono", "Menlo", "Monaco", "Consolas", monospace;
		margin-top: 2px;
	}

	/* Snap indicator (lock icon when snapped to now) */
	.snap-indicator {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 6px;
		padding: 4px 8px;
		background: rgba(33, 150, 243, 0.15);
		border-radius: 4px;
		font-size: 14px;
		color: #1976d2;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: scale(0.9);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Snap toggle button (magnet icon) */
	.snap-toggle-button {
		position: fixed;
		bottom: 24px;
		left: 200px;
		width: 40px;
		height: 40px;
		padding: 0;
		background: rgba(33, 150, 243, 0.9);
		color: white;
		border: none;
		border-radius: 50%;
		font-size: 18px;
		cursor: pointer;
		transition: all 0.2s ease;
		z-index: 100;
		box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.snap-toggle-button:hover {
		background: rgba(25, 118, 210, 0.95);
		transform: scale(1.05);
	}

	.snap-toggle-button.disabled {
		background: rgba(100, 100, 100, 0.5);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		opacity: 0.6;
	}

	.snap-toggle-button.snapping {
		animation: snap-blink 0.25s ease-in-out 5;
	}

	@keyframes snap-blink {
		0%,
		100% {
			background: rgba(33, 150, 243, 0.9);
			transform: scale(1);
		}
		50% {
			background: rgba(255, 193, 7, 0.95);
			transform: scale(1.15);
		}
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

	/* Follow-now button (clock icon) - next to Today button */
	.follow-now-button {
		position: fixed;
		bottom: 24px;
		left: 100px; /* Next to Today button */
		width: 40px;
		height: 40px;
		padding: 0;
		background: rgba(33, 150, 243, 0.9);
		color: white;
		border: none;
		border-radius: 50%;
		font-size: 18px;
		cursor: pointer;
		transition: all 0.2s ease;
		z-index: 100;
		box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.follow-now-button:hover {
		background: rgba(25, 118, 210, 0.95);
		transform: scale(1.05);
	}

	.follow-now-button.active {
		background: #1565c0;
		box-shadow: 0 0 20px rgba(33, 150, 243, 0.6);
		animation: pulse-glow 2s infinite;
	}

	@keyframes pulse-glow {
		0%,
		100% {
			box-shadow: 0 0 12px rgba(33, 150, 243, 0.4);
		}
		50% {
			box-shadow: 0 0 24px rgba(33, 150, 243, 0.8);
		}
	}

	/* Now time indicator line (blue) */
	.now-indicator {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: linear-gradient(180deg, #2196f3 0%, #1976d2 100%);
		pointer-events: none;
		z-index: 6;
		box-shadow: 0 0 8px rgba(33, 150, 243, 0.5);
	}

	.now-indicator.following {
		box-shadow: 0 0 16px rgba(33, 150, 243, 0.8);
	}

	.loading-indicator {
		margin-top: 12px;
		padding: 8px 12px;
		background: rgba(33, 150, 243, 0.1);
		color: #2196f3;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 500;
		text-align: center;
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.6;
		}
		50% {
			opacity: 1;
		}
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

	/* Event labels overlay */
	.event-labels-overlay {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		overflow: hidden;
		will-change: contents;
	}

	.event-label {
		position: absolute;
		transform: translateY(-50%);
		pointer-events: auto;
		cursor: pointer;
		box-sizing: border-box;
		overflow: hidden;
		will-change: transform, left;
	}

	.event-label:hover {
		z-index: 10;
	}

	.event-title {
		display: block;
		padding: 2px 6px;
		font-size: 11px;
		font-weight: 500;
		color: #fff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
		line-height: 1.2;
		transition: opacity 0.1s ease;
	}
</style>
