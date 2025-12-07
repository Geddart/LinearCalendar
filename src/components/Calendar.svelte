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
	import type {
		ViewportState,
		CalendarEvent,
		RenderableEvent,
	} from "$lib/types/Event";
	import { DEFAULT_LANES } from "$lib/types/Event";
	import EventDetailPanel from "./EventDetailPanel.svelte";
	import { hitTest, selectEvent } from "$lib/events/EventInteraction";

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

	// Time grid state - extended for smooth LOD transitions
	let gridLines: {
		key: string; // Unique identifier for stable rendering
		x: number;
		label: string;
		isMajor: boolean;
		opacity: number; // For fade transitions (0-1)
		lineHeight: number; // For growing sub-indicators (0-1, 1 = full height)
		isSubUnit: boolean; // Is this a sub-unit indicator?
		fontWeight: number; // Variable font weight (400-700) for smooth transitions
		fontSize: number; // Font size in pixels (11-13) for smooth transitions
		labelOpacity?: number; // Optional label-specific opacity for hour labels
	}[] = [];
	let contextLabels = { year: "", month: "", dayNum: "", weekday: "" };
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

		// Generate events
		events = [
			...generateLifeEvents(),
			...generateMockEvents(100),
			...generateTodayEvents(),
		];

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
	 * CONTINUOUS SPACING-BASED TIME GRID
	 *
	 * Instead of discrete LOD levels with thresholds, this system renders
	 * ALL time units that have sufficient pixel spacing. Each unit type
	 * fades in/out continuously based on its spacing.
	 */
	function updateTimeGrid() {
		if (!viewport) return;

		const { startTime, endTime, centerTime, pixelsPerMs, width } = viewport;
		const halfWidth = width / 2;

		// Time constants
		const MINUTE_MS = 60000;
		const HOUR_MS = 3600000;
		const DAY_MS = 86400000;
		const WEEK_MS = 604800000;
		const MONTH_MS = 2628000000; // Average month
		const YEAR_MS = 31536000000;
		const DECADE_MS = YEAR_MS * 10;
		const CENTURY_MS = YEAR_MS * 100;

		// Calculate pixel spacing for each time unit
		const spacings = {
			minute: MINUTE_MS * pixelsPerMs,
			hour: HOUR_MS * pixelsPerMs,
			day: DAY_MS * pixelsPerMs,
			week: WEEK_MS * pixelsPerMs,
			month: MONTH_MS * pixelsPerMs,
			year: YEAR_MS * pixelsPerMs,
			decade: DECADE_MS * pixelsPerMs,
			century: CENTURY_MS * pixelsPerMs,
		};

		// Minimum readable spacing (pixels) for each unit type
		const minSpacing: Record<string, number> = {
			minute: 25,
			hour: 35,
			day: 50,
			week: 45,
			month: 30,
			year: 25,
			decade: 30,
			century: 40,
		};

		// Calculate opacity based on spacing
		const calculateOpacity = (
			spacing: number,
			required: number,
		): number => {
			const fadeStart = required * 0.4;
			const fadeEnd = required;
			if (spacing < fadeStart) return 0;
			if (spacing >= fadeEnd) return 1;
			return (spacing - fadeStart) / (fadeEnd - fadeStart);
		};

		// ISO week number helper
		const getISOWeek = (d: Date): number => {
			const date = new Date(d.getTime());
			date.setHours(0, 0, 0, 0);
			date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
			const week1 = new Date(date.getFullYear(), 0, 4);
			return (
				1 +
				Math.round(
					((date.getTime() - week1.getTime()) / 86400000 -
						3 +
						((week1.getDay() + 6) % 7)) /
						7,
				)
			);
		};

		// Context labels (for the floating card)
		const centerDate = new Date(centerTime);
		contextLabels = {
			year: centerDate.getFullYear().toString(),
			month: `${centerDate.toLocaleString("en-US", { month: "long" })} ${centerDate.getDate()}`,
			dayNum: "",
			weekday: centerDate.toLocaleString("en-US", { weekday: "long" }),
		};

		const newGridLines: typeof gridLines = [];

		// Track unit hierarchy for line darkness (larger units = darker)
		const unitHierarchy: Record<string, number> = {
			century: 1.0,
			decade: 0.9,
			year: 0.85,
			month: 0.6,
			week: 0.5,
			day: 0.4,
			hour: 0.3,
			minute: 0.2,
		};

		// Helper to add grid lines for a time unit type
		function addUnitLines(
			unitName: string,
			opacity: number,
			getLabel: (date: Date) => string,
			getImportance: (date: Date) => number,
			alignDate: (startDate: Date) => Date,
			incrementDate: (date: Date) => void,
		) {
			if (opacity < 0.01) return;

			const startDate = new Date(startTime);
			let currentDate = alignDate(startDate);

			while (currentDate.getTime() < endTime) {
				const currentTime = currentDate.getTime();
				const screenX =
					halfWidth + (currentTime - centerTime) * pixelsPerMs;

				if (
					screenX > (isMobile ? 0 : CONTEXT_COL_WIDTH) &&
					screenX < width
				) {
					const importance = getImportance(currentDate);
					const label = getLabel(currentDate);
					const fontWeight = Math.round(400 + importance * 250);
					const fontSize = Math.round(10 + importance * 3);
					const finalOpacity = opacity * (0.5 + importance * 0.5);

					// Proximity check: skip if a label already exists within 15px
					// This prevents stacking (e.g., year + month + day at Jan 1)
					const MIN_LABEL_DISTANCE = 15;
					const tooClose = newGridLines.some(
						(line) =>
							Math.abs(line.x - screenX) < MIN_LABEL_DISTANCE,
					);

					if (!tooClose) {
						// Use unit hierarchy to determine if line is major (darker)
						const hierarchyLevel = unitHierarchy[unitName] || 0.5;
						const isMajorLine = hierarchyLevel >= 0.85; // year, decade, century are major
						const isSubLine = hierarchyLevel <= 0.4; // day, hour, minute are sub-units

						newGridLines.push({
							key: `${unitName}-${currentTime}`,
							x: screenX,
							label: label,
							isMajor: isMajorLine,
							opacity: finalOpacity,
							lineHeight: 1,
							isSubUnit: isSubLine,
							fontWeight: fontWeight,
							fontSize: fontSize,
							labelOpacity: finalOpacity,
						});
					}
				}

				incrementDate(currentDate);
			}
		}

		// CENTURY LABELS
		if (spacings.century > minSpacing.century * 0.4) {
			const opacity = calculateOpacity(
				spacings.century,
				minSpacing.century,
			);
			addUnitLines(
				"century",
				opacity,
				(d) => d.getFullYear().toString(),
				() => 1.0,
				(d) => new Date(Math.floor(d.getFullYear() / 100) * 100, 0, 1),
				(d) => d.setFullYear(d.getFullYear() + 100),
			);
		}

		// DECADE LABELS - Progressive disclosure based on spacing
		// Century marks first (1900, 2000), then 50-year marks, then all decades
		// PERFORMANCE: Skip if spacing too small
		if (spacings.decade >= 10) {
			// Minimum spacing for any decade to appear
			const decadeSpacing = spacings.decade;
			const startDate = new Date(startTime);
			let currentDate = new Date(
				Math.floor(startDate.getFullYear() / 10) * 10,
				0,
				1,
			);

			while (currentDate.getTime() < endTime) {
				const year = currentDate.getFullYear();

				// Progressive disclosure:
				// - Century marks (1900, 2000) appear at 15px
				// - 50-year marks (1950, 2050) appear at 35px
				// - All other decades appear at 60px
				let requiredSpacing: number;
				let importance: number;

				if (year % 100 === 0) {
					requiredSpacing = 15;
					importance = 1.0;
				} else if (year % 50 === 0) {
					requiredSpacing = 35;
					importance = 0.7;
				} else {
					requiredSpacing = 60;
					importance = 0.4;
				}

				const fadeStart = requiredSpacing * 0.5;
				const fadeEnd = requiredSpacing;
				let decadeOpacity = 0;
				if (decadeSpacing >= fadeEnd) {
					decadeOpacity = 1;
				} else if (decadeSpacing > fadeStart) {
					decadeOpacity =
						(decadeSpacing - fadeStart) / (fadeEnd - fadeStart);
				}

				if (decadeOpacity > 0.01) {
					const currentTime = currentDate.getTime();
					const screenX =
						halfWidth + (currentTime - centerTime) * pixelsPerMs;

					if (
						screenX > (isMobile ? 0 : CONTEXT_COL_WIDTH) &&
						screenX < width
					) {
						const MIN_LABEL_DISTANCE = 15;
						const tooClose = newGridLines.some(
							(line) =>
								Math.abs(line.x - screenX) < MIN_LABEL_DISTANCE,
						);

						if (!tooClose) {
							const finalOpacity =
								decadeOpacity * (0.5 + importance * 0.5);

							newGridLines.push({
								key: `decade-${currentTime}`,
								x: screenX,
								label: year.toString(),
								isMajor: year % 100 === 0,
								opacity: finalOpacity,
								lineHeight: 1,
								isSubUnit: false,
								fontWeight: Math.round(400 + importance * 200),
								fontSize: Math.round(10 + importance * 3),
								labelOpacity: finalOpacity,
							});
						}
					}
				}

				currentDate.setFullYear(currentDate.getFullYear() + 10);
			}
		}

		// YEAR LABELS - Progressive disclosure based on spacing
		// Decade years (2020, 2030) first, then ending in 5 (2025), then all
		// PERFORMANCE: Skip if spacing too small
		if (spacings.year >= 10) {
			// Minimum spacing for any year to appear
			const yearSpacing = spacings.year;
			const startDate = new Date(startTime);
			let currentDate = new Date(startDate.getFullYear(), 0, 1);

			while (currentDate.getTime() < endTime) {
				const year = currentDate.getFullYear();

				// Progressive disclosure:
				// - Decade years (2020) appear at 15px
				// - Years ending in 5 (2025) appear at 25px
				// - All other years appear at 40px
				let requiredSpacing: number;
				let importance: number;

				if (year % 10 === 0) {
					requiredSpacing = 15;
					importance = 1.0;
				} else if (year % 5 === 0) {
					requiredSpacing = 25;
					importance = 0.7;
				} else {
					requiredSpacing = 40;
					importance = 0.4;
				}

				const fadeStart = requiredSpacing * 0.5;
				const fadeEnd = requiredSpacing;
				let yearOpacity = 0;
				if (yearSpacing >= fadeEnd) {
					yearOpacity = 1;
				} else if (yearSpacing > fadeStart) {
					yearOpacity =
						(yearSpacing - fadeStart) / (fadeEnd - fadeStart);
				}

				if (yearOpacity > 0.01) {
					const currentTime = currentDate.getTime();
					const screenX =
						halfWidth + (currentTime - centerTime) * pixelsPerMs;

					if (
						screenX > (isMobile ? 0 : CONTEXT_COL_WIDTH) &&
						screenX < width
					) {
						const MIN_LABEL_DISTANCE = 15;
						const tooClose = newGridLines.some(
							(line) =>
								Math.abs(line.x - screenX) < MIN_LABEL_DISTANCE,
						);

						if (!tooClose) {
							const finalOpacity =
								yearOpacity * (0.5 + importance * 0.5);

							newGridLines.push({
								key: `year-${currentTime}`,
								x: screenX,
								label: year.toString(),
								isMajor: true,
								opacity: finalOpacity,
								lineHeight: 1,
								isSubUnit: false,
								fontWeight: Math.round(400 + importance * 200),
								fontSize: Math.round(10 + importance * 3),
								labelOpacity: finalOpacity,
							});
						}
					}
				}

				currentDate.setFullYear(currentDate.getFullYear() + 1);
			}
		}

		// MONTH LABELS - Progressive disclosure based on spacing
		// January first, then quarterly months, then all
		// PERFORMANCE: Skip if spacing too small
		if (spacings.month >= 8) {
			// Minimum spacing for any month to appear
			const monthSpacing = spacings.month;
			const startDate = new Date(startTime);
			let currentDate = new Date(
				startDate.getFullYear(),
				startDate.getMonth(),
				1,
			);

			while (currentDate.getTime() < endTime) {
				const month = currentDate.getMonth();

				// Progressive disclosure:
				// - January (0) appears at 10px
				// - Quarterly months (Apr=3, Jul=6, Oct=9) appear at 20px
				// - All other months appear at 35px
				let requiredSpacing: number;
				let importance: number;

				if (month === 0) {
					requiredSpacing = 10;
					importance = 1.0;
				} else if (month % 3 === 0) {
					requiredSpacing = 20;
					importance = 0.7;
				} else {
					requiredSpacing = 35;
					importance = 0.4;
				}

				const fadeStart = requiredSpacing * 0.5;
				const fadeEnd = requiredSpacing;
				let monthOpacity = 0;
				if (monthSpacing >= fadeEnd) {
					monthOpacity = 1;
				} else if (monthSpacing > fadeStart) {
					monthOpacity =
						(monthSpacing - fadeStart) / (fadeEnd - fadeStart);
				}

				if (monthOpacity > 0.01) {
					const currentTime = currentDate.getTime();
					const screenX =
						halfWidth + (currentTime - centerTime) * pixelsPerMs;

					if (
						screenX > (isMobile ? 0 : CONTEXT_COL_WIDTH) &&
						screenX < width
					) {
						const MIN_LABEL_DISTANCE = 15;
						const tooClose = newGridLines.some(
							(line) =>
								Math.abs(line.x - screenX) < MIN_LABEL_DISTANCE,
						);

						if (!tooClose) {
							const finalOpacity =
								monthOpacity * (0.5 + importance * 0.5);
							const label =
								month === 0
									? currentDate.getFullYear().toString()
									: currentDate.toLocaleString("en-US", {
											month: "short",
										});

							newGridLines.push({
								key: `month-${currentTime}`,
								x: screenX,
								label: label,
								isMajor: month === 0,
								opacity: finalOpacity,
								lineHeight: 1,
								isSubUnit: false,
								fontWeight: Math.round(400 + importance * 200),
								fontSize: Math.round(10 + importance * 2),
								labelOpacity: finalOpacity,
							});
						}
					}
				}

				currentDate.setMonth(currentDate.getMonth() + 1);
			}
		}

		// WEEK LABELS
		if (spacings.week > minSpacing.week * 0.4) {
			const opacity = calculateOpacity(spacings.week, minSpacing.week);
			addUnitLines(
				"week",
				opacity,
				(d) => `W${getISOWeek(d)}`,
				() => 0.5,
				(d) => {
					const dow = d.getDay();
					return new Date(
						d.getFullYear(),
						d.getMonth(),
						d.getDate() - dow,
					);
				},
				(d) => d.setDate(d.getDate() + 7),
			);
		}

		// DAY LABELS
		if (spacings.day > minSpacing.day * 0.4) {
			const opacity = calculateOpacity(spacings.day, minSpacing.day);
			addUnitLines(
				"day",
				opacity,
				(d) =>
					`${d.getDate()} ${d.toLocaleString("en-US", { weekday: "short" })}`,
				(d) => (d.getDate() === 1 ? 1.0 : 0.5),
				(d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()),
				(d) => d.setDate(d.getDate() + 1),
			);
		}

		// HOUR LABELS - Progressive disclosure based on spacing
		// Midnight/noon first, then 6am/6pm, then every 3h, then every hour
		// PERFORMANCE: Skip entirely if spacing is too small for even midnight to show
		if (spacings.hour >= 2.5) {
			// Minimum spacing for any hour to appear
			const hourSpacing = spacings.hour;
			const startDate = new Date(startTime);
			let currentDate = new Date(
				startDate.getFullYear(),
				startDate.getMonth(),
				startDate.getDate(),
				startDate.getHours(),
			);

			while (currentDate.getTime() < endTime) {
				const hour = currentDate.getHours();

				// Progressive disclosure thresholds:
				// - Midnight (0h) appears when spacing >= 5px
				// - Noon (12h) appears when spacing >= 8px
				// - 6am/6pm appears when spacing >= 12px
				// - 3h/9h/15h/21h appears when spacing >= 18px
				// - All others appear when spacing >= 25px
				let requiredSpacing: number;
				let importance: number;

				if (hour === 0) {
					requiredSpacing = 5;
					importance = 1.0;
				} else if (hour === 12) {
					requiredSpacing = 8;
					importance = 0.9;
				} else if (hour % 6 === 0) {
					requiredSpacing = 12;
					importance = 0.7;
				} else if (hour % 3 === 0) {
					requiredSpacing = 18;
					importance = 0.5;
				} else {
					requiredSpacing = 25;
					importance = 0.3;
				}

				const fadeStart = requiredSpacing * 0.5;
				const fadeEnd = requiredSpacing;
				let hourOpacity = 0;
				if (hourSpacing >= fadeEnd) {
					hourOpacity = 1;
				} else if (hourSpacing > fadeStart) {
					hourOpacity =
						(hourSpacing - fadeStart) / (fadeEnd - fadeStart);
				}

				if (hourOpacity > 0.01) {
					const currentTime = currentDate.getTime();
					const screenX =
						halfWidth + (currentTime - centerTime) * pixelsPerMs;

					if (
						screenX > (isMobile ? 0 : CONTEXT_COL_WIDTH) &&
						screenX < width
					) {
						// Proximity check
						const MIN_LABEL_DISTANCE = 15;
						const tooClose = newGridLines.some(
							(line) =>
								Math.abs(line.x - screenX) < MIN_LABEL_DISTANCE,
						);

						if (!tooClose) {
							const finalOpacity =
								hourOpacity * (0.5 + importance * 0.5);
							const hierarchyLevel = unitHierarchy["hour"] || 0.3;

							newGridLines.push({
								key: `hour-${currentTime}`,
								x: screenX,
								label: `${hour}h`,
								isMajor: hour === 0, // Midnight is major
								opacity: finalOpacity,
								lineHeight: 1,
								isSubUnit: hierarchyLevel <= 0.4,
								fontWeight: Math.round(400 + importance * 200),
								fontSize: Math.round(10 + importance * 2),
								labelOpacity: finalOpacity,
							});
						}
					}
				}

				currentDate.setHours(currentDate.getHours() + 1);
			}
		}

		// MINUTE LABELS - Progressive disclosure based on spacing
		// :30 appears first, then :15/:45, then :10 intervals, then :05, then all
		// PERFORMANCE: Skip entirely if spacing is too small for even :30 to show
		if (spacings.minute >= 2.5) {
			// Minimum spacing for any minute to appear
			const minuteSpacing = spacings.minute;
			const startDate = new Date(startTime);
			let currentDate = new Date(
				startDate.getFullYear(),
				startDate.getMonth(),
				startDate.getDate(),
				startDate.getHours(),
				startDate.getMinutes(),
			);

			while (currentDate.getTime() < endTime) {
				const minute = currentDate.getMinutes();
				if (minute !== 0) {
					// Progressive disclosure thresholds:
					// - :30 appears when spacing >= 5px
					// - :15/:45 appears when spacing >= 10px
					// - :10/:20/:40/:50 appears when spacing >= 15px
					// - :05/:25/:35/:55 appears when spacing >= 18px
					// - All others appear when spacing >= 22px
					let requiredSpacing: number;
					let importance: number;

					if (minute === 30) {
						requiredSpacing = 5;
						importance = 0.9;
					} else if (minute === 15 || minute === 45) {
						requiredSpacing = 10;
						importance = 0.7;
					} else if (minute % 10 === 0) {
						requiredSpacing = 15;
						importance = 0.55;
					} else if (minute % 5 === 0) {
						requiredSpacing = 18;
						importance = 0.45;
					} else {
						requiredSpacing = 22;
						importance = 0.3;
					}

					// Calculate opacity for this specific minute type
					const fadeStart = requiredSpacing * 0.5;
					const fadeEnd = requiredSpacing;
					let minuteOpacity = 0;
					if (minuteSpacing >= fadeEnd) {
						minuteOpacity = 1;
					} else if (minuteSpacing > fadeStart) {
						minuteOpacity =
							(minuteSpacing - fadeStart) / (fadeEnd - fadeStart);
					}

					if (minuteOpacity > 0.01) {
						const currentTime = currentDate.getTime();
						const screenX =
							halfWidth +
							(currentTime - centerTime) * pixelsPerMs;

						if (screenX > 0 && screenX < width) {
							const finalOpacity =
								minuteOpacity * (0.5 + importance * 0.5);

							newGridLines.push({
								key: `minute-${currentTime}`,
								x: screenX,
								label: `:${minute.toString().padStart(2, "0")}`,
								isMajor: false,
								opacity: finalOpacity,
								lineHeight: 1,
								isSubUnit: true,
								fontWeight: Math.round(400 + importance * 150),
								fontSize: 10,
								labelOpacity: finalOpacity,
							});
						}
					}
				}
				currentDate.setMinutes(currentDate.getMinutes() + 1);
			}
		}

		gridLines = newGridLines;
		debugLastCenterTime = centerTime;
	}

	function getVisibleEvents(): RenderableEvent[] {
		if (!viewport) return [];
		const { startTime, endTime, lodLevel } = viewport;

		const filtered = events.filter(
			(e) =>
				e.endTime > startTime &&
				e.startTime < endTime &&
				e.importance.effective >= getImportanceThreshold(lodLevel),
		);

		// Sort by importance for rendering order (most important on top)
		filtered.sort(
			(a, b) => b.importance.effective - a.importance.effective,
		);

		return filtered.map((e) => {
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
		<div class="debug-overlay">
			<div class="debug-title">Stats for Nerds</div>
			<div class="debug-section">
				<div><span class="label">FPS:</span> {debugStats.fps}</div>
				<div>
					<span class="label">Objects:</span>
					{debugStats.objectsDrawn}
				</div>
				<div>
					<span class="label">Grid Lines:</span>
					{debugStats.gridLinesCount}
				</div>
				<div>
					<span class="label">Draw Calls:</span>
					{debugStats.drawCalls}
				</div>
			</div>
			<div class="debug-divider"></div>
			<div class="debug-section">
				<div><span class="label">LOD:</span> {viewport.lodLevel}</div>
				<div>
					<span class="label">Zoom:</span>
					{viewport.pixelsPerMs.toExponential(2)}
				</div>
				<div>
					<span class="label">Visible:</span>
					{debugStats.visibleRange}
				</div>
			</div>
			<div class="debug-divider"></div>
			<div class="debug-section">
				<div>
					<span class="label">Center:</span>
					{debugStats.centerTime}
				</div>
				{#if debugStats.memoryUsage}
					<div>
						<span class="label">Memory:</span>
						{debugStats.memoryUsage}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Toast notification for view changes -->
	{#key toastKey}
		{#if toastVisible}
			<div class="toast" class:visible={toastVisible}>
				{toastMessage}
			</div>
		{/if}
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

	.debug-overlay {
		position: absolute;
		top: 40px;
		right: 10px;
		background: rgba(0, 0, 0, 0.85);
		color: white;
		padding: 12px 16px;
		border-radius: 8px;
		font-family: "SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace;
		font-size: 11px;
		pointer-events: none;
		z-index: 20;
		min-width: 180px;
		backdrop-filter: blur(4px);
	}

	.debug-overlay .debug-title {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #888;
		margin-bottom: 8px;
		padding-bottom: 6px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.debug-overlay .debug-section {
		margin: 4px 0;
	}

	.debug-overlay .debug-section div {
		margin: 3px 0;
		display: flex;
		justify-content: space-between;
	}

	.debug-overlay .label {
		color: #aaa;
		margin-right: 12px;
	}

	.debug-overlay .debug-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 8px 0;
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

	/* Toast notification */
	.toast {
		position: absolute;
		bottom: 80px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.85);
		color: white;
		padding: 12px 24px;
		border-radius: 8px;
		font-size: 16px;
		font-weight: 600;
		pointer-events: none;
		z-index: 100;
		opacity: 0;
		backdrop-filter: blur(8px);
	}

	.toast.visible {
		opacity: 1;
		animation: toast-fade 1.5s ease forwards;
	}

	@keyframes toast-fade {
		0% {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
		70% {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
		100% {
			opacity: 0;
			transform: translateX(-50%) translateY(-10px);
		}
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

		/* Reposition Stats for Nerds to bottom-right, less intrusive */
		.debug-overlay {
			font-size: 9px;
			padding: 8px 10px;
			min-width: 140px;
			top: auto;
			bottom: 130px; /* Increased from 80px to clear the usage help */
			right: 16px;
			background: rgba(0, 0, 0, 0.8); /* Slightly more transparent */
			backdrop-filter: blur(8px);
		}

		.debug-overlay .debug-title {
			font-size: 8px;
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
