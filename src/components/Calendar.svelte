<script lang="ts">
	import { onMount } from "svelte";
	import { WebGLContext } from "$lib/rendering/WebGLContext";
	import { SimpleEventRenderer } from "$lib/rendering/SimpleEventRenderer";
	import { viewportController } from "$lib/viewport/ViewportController";
	import { InputHandler } from "$lib/viewport/InputHandler";
	import {
		generateMockEvents,
		generateLifeEvents,
	} from "$lib/api/MockDataProvider";
	import { hexToRgb } from "$lib/utils/colorUtils";
	import type {
		ViewportState,
		CalendarEvent,
		RenderableEvent,
	} from "$lib/types/Event";

	let canvas: HTMLCanvasElement;
	let ctx: WebGLContext;
	let renderer: SimpleEventRenderer;
	let inputHandler: InputHandler;
	let frameId: number;

	// Event data with pre-computed lanes
	let events: CalendarEvent[] = [];
	let eventLanes: Map<string, number> = new Map(); // event.id -> lane index
	let viewport: ViewportState | null = null;
	let unsubscribe: (() => void) | null = null;

	// Time grid state - extended for smooth LOD transitions
	let gridLines: {
		x: number;
		label: string;
		isMajor: boolean;
		opacity: number; // For fade transitions (0-1)
		lineHeight: number; // For growing sub-indicators (0-1, 1 = full height)
		isSubUnit: boolean; // Is this a sub-unit indicator?
	}[] = [];
	let contextLabels = { year: "", month: "", dayNum: "", weekday: "" };
	let showMonth = false;
	let showDay = false;

	// Layout constants
	const CONTEXT_COL_WIDTH = 130;
	const NUM_LANES = 8;
	const LANE_BASE_Y = 0.85;
	const LANE_SPACING = 0.08;

	onMount(() => {
		unsubscribe = viewportController.subscribe((state) => {
			viewport = state;
		});

		ctx = new WebGLContext(canvas);
		renderer = new SimpleEventRenderer(ctx);

		viewportController.setCanvas(canvas);
		ctx.resize();
		viewportController.resize(canvas.width, canvas.height);

		inputHandler = new InputHandler(canvas);

		// Generate events
		events = [...generateLifeEvents(), ...generateMockEvents(100)];

		// Pre-compute lane assignments ONCE - this prevents jumping
		computeLaneAssignments();

		const handleResize = () => {
			if (ctx.resize()) {
				viewportController.resize(canvas.width, canvas.height);
			}
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
	 * Uses a greedy algorithm: assign each event to the first lane
	 * where it doesn't overlap with existing events.
	 *
	 * This is the key fix for jumping - lanes are stable regardless
	 * of what's visible in the viewport.
	 */
	function computeLaneAssignments() {
		// Sort events by start time
		const sorted = [...events].sort((a, b) => a.startTime - b.startTime);

		// Track when each lane becomes free
		const laneEndTimes: number[] = new Array(NUM_LANES).fill(0);

		for (const event of sorted) {
			// Find first available lane
			let assignedLane = 0;
			for (let lane = 0; lane < NUM_LANES; lane++) {
				if (event.startTime >= laneEndTimes[lane]) {
					assignedLane = lane;
					break;
				}
				// If no lane fits, use modulo of least-full lane
				if (lane === NUM_LANES - 1) {
					assignedLane = lane % NUM_LANES;
				}
			}

			// Assign and mark lane as occupied
			eventLanes.set(event.id, assignedLane);
			laneEndTimes[assignedLane] = event.endTime;
		}
	}

	function render() {
		if (!ctx || !viewport) return;

		ctx.clear(0.98, 0.98, 0.99);

		updateTimeGrid();

		const visibleEvents = getVisibleEvents();
		renderer.render(visibleEvents, viewport);
	}

	/**
	 * Update time grid lines and labels based on viewport
	 *
	 * SMOOTH LOD TRANSITIONS:
	 * - Main lines: always at full opacity and height
	 * - Sub-unit lines: fade in and grow from top as you zoom in toward next level
	 * - Labels: use consistent styling to avoid jarring font changes
	 */
	function updateTimeGrid() {
		if (!viewport) return;

		const { startTime, endTime, centerTime, pixelsPerMs, width } = viewport;

		// Time constants
		const HOUR_MS = 3600000;
		const DAY_MS = 86400000;
		const WEEK_MS = 604800000;
		const MONTH_MS = 2628000000;
		const YEAR_MS = 31536000000;

		// Calculate pixels per year for LOD decisions
		const pxPerYear = YEAR_MS * pixelsPerMs;

		// LOD thresholds with next-level info
		interface LODLevel {
			unit:
				| "millennium"
				| "century"
				| "decade"
				| "year"
				| "month"
				| "week"
				| "day"
				| "hour";
			threshold: number; // pxPerYear threshold to enter this level
			nextThreshold: number; // threshold to enter next (more detailed) level
			yearStep?: number; // for year-based iteration
			intervalMs?: number; // for time-based iteration
			subUnit?:
				| "century"
				| "decade"
				| "year"
				| "month"
				| "week"
				| "day"
				| "hour"
				| "minute";
		}

		const lodLevels: LODLevel[] = [
			{
				unit: "millennium",
				threshold: 0,
				nextThreshold: 0.5,
				yearStep: 1000,
				subUnit: "century",
			},
			{
				unit: "century",
				threshold: 0.5,
				nextThreshold: 5,
				yearStep: 100,
				subUnit: "decade",
			},
			{
				unit: "decade",
				threshold: 5,
				nextThreshold: 50,
				yearStep: 10,
				subUnit: "year",
			},
			{
				unit: "year",
				threshold: 50,
				nextThreshold: 400,
				yearStep: 1,
				subUnit: "month",
			},
			{
				unit: "month",
				threshold: 400,
				nextThreshold: 4000,
				intervalMs: MONTH_MS,
				subUnit: "week",
			},
			{
				unit: "week",
				threshold: 4000,
				nextThreshold: 15000,
				intervalMs: WEEK_MS,
				subUnit: "day",
			},
			{
				unit: "day",
				threshold: 15000,
				nextThreshold: 200000,
				intervalMs: DAY_MS,
				subUnit: "hour",
			},
			{
				unit: "hour",
				threshold: 200000,
				nextThreshold: Infinity,
				intervalMs: HOUR_MS,
				subUnit: "minute",
			},
		];

		// Find current LOD level
		let currentLOD = lodLevels[lodLevels.length - 1];
		for (const lod of lodLevels) {
			if (pxPerYear >= lod.threshold && pxPerYear < lod.nextThreshold) {
				currentLOD = lod;
				break;
			}
		}

		// Calculate transition progress (0 = just entered this level, 1 = about to enter next level)
		const logProgress =
			(Math.log(pxPerYear) - Math.log(currentLOD.threshold || 0.1)) /
			(Math.log(currentLOD.nextThreshold) -
				Math.log(currentLOD.threshold || 0.1));
		const transitionProgress = Math.max(0, Math.min(1, logProgress));

		// Context labels
		const centerDate = new Date(centerTime);
		contextLabels = {
			year: centerDate.getFullYear().toString(),
			month: `${centerDate.toLocaleString("en-US", { month: "long" })} ${centerDate.getDate()}`,
			dayNum: "", // combined with month now
			weekday: centerDate.toLocaleString("en-US", { weekday: "long" }),
		};

		const newGridLines: typeof gridLines = [];
		const halfWidth = width / 2;

		// Helper to add LOD-specific grid lines (current level only, no major boundaries)
		function addLODLines() {
			const startDate = new Date(startTime);
			let currentDate: Date;

			// Initialize to properly aligned boundary for current LOD
			switch (currentLOD.unit) {
				case "millennium":
					currentDate = new Date(
						Math.floor(startDate.getFullYear() / 1000) * 1000,
						0,
						1,
					);
					break;
				case "century":
					currentDate = new Date(
						Math.floor(startDate.getFullYear() / 100) * 100,
						0,
						1,
					);
					break;
				case "decade":
					currentDate = new Date(
						Math.floor(startDate.getFullYear() / 10) * 10,
						0,
						1,
					);
					break;
				case "year":
					currentDate = new Date(startDate.getFullYear(), 0, 1);
					break;
				case "month":
					currentDate = new Date(
						startDate.getFullYear(),
						startDate.getMonth(),
						1,
					);
					break;
				case "week":
					// Align to start of week (Sunday)
					const dayOfWeek = startDate.getDay();
					currentDate = new Date(
						startDate.getFullYear(),
						startDate.getMonth(),
						startDate.getDate() - dayOfWeek,
					);
					break;
				case "day":
					currentDate = new Date(
						startDate.getFullYear(),
						startDate.getMonth(),
						startDate.getDate(),
					);
					break;
				case "hour":
					currentDate = new Date(
						startDate.getFullYear(),
						startDate.getMonth(),
						startDate.getDate(),
						startDate.getHours(),
					);
					break;
				default:
					return;
			}

			while (currentDate.getTime() < endTime) {
				const currentTime = currentDate.getTime();
				const screenX =
					halfWidth + (currentTime - centerTime) * pixelsPerMs;

				if (screenX > CONTEXT_COL_WIDTH && screenX < width) {
					let label = "";
					let isMajor = false;

					// Generate labels for current LOD level only (NO month/year labels here)
					switch (currentLOD.unit) {
						case "millennium":
						case "century":
						case "decade":
						case "year":
							label = currentDate.getFullYear().toString();
							isMajor = true;
							break;
						case "month":
							// Month labels only, year boundaries handled separately
							label = currentDate.toLocaleString("en-US", {
								month: "short",
							});
							isMajor = currentDate.getMonth() === 0; // January
							break;
						case "week":
							// Week labels only (W1, W2...), month boundaries handled separately
							label = `W${Math.ceil(currentDate.getDate() / 7)}`;
							break;
						case "day":
							// Day with weekday: "9 Mon"
							const weekdayShort = currentDate.toLocaleString(
								"en-US",
								{ weekday: "short" },
							);
							label = `${currentDate.getDate()} ${weekdayShort}`;
							break;
						case "hour":
							// Hour labels only
							label = `${currentDate.getHours()}h`;
							break;
					}

					newGridLines.push({
						x: screenX,
						label,
						isMajor,
						opacity: 1,
						lineHeight: 1,
						isSubUnit: false,
					});
				}

				// Increment using calendar for proper alignment
				switch (currentLOD.unit) {
					case "millennium":
						currentDate.setFullYear(
							currentDate.getFullYear() + 1000,
						);
						break;
					case "century":
						currentDate.setFullYear(
							currentDate.getFullYear() + 100,
						);
						break;
					case "decade":
						currentDate.setFullYear(currentDate.getFullYear() + 10);
						break;
					case "year":
						currentDate.setFullYear(currentDate.getFullYear() + 1);
						break;
					case "month":
						currentDate.setMonth(currentDate.getMonth() + 1);
						break;
					case "week":
						currentDate.setDate(currentDate.getDate() + 7);
						break;
					case "day":
						currentDate.setDate(currentDate.getDate() + 1);
						break;
					case "hour":
						currentDate.setHours(currentDate.getHours() + 1);
						break;
				}
			}
		}

		// Helper to add major boundaries at EXACT calendar positions
		// These are always calendar-aligned regardless of current LOD
		function addMajorBoundaries() {
			const startDate = new Date(startTime);

			// Add month boundaries (for week/day/hour views)
			if (["week", "day", "hour"].includes(currentLOD.unit)) {
				let monthDate = new Date(
					startDate.getFullYear(),
					startDate.getMonth(),
					1,
				);

				while (monthDate.getTime() < endTime) {
					const screenX =
						halfWidth +
						(monthDate.getTime() - centerTime) * pixelsPerMs;

					if (screenX > CONTEXT_COL_WIDTH && screenX < width) {
						// Check if there's already a line very close (to prevent duplicates)
						const hasDuplicate = newGridLines.some(
							(l) => Math.abs(l.x - screenX) < 3,
						);

						if (!hasDuplicate) {
							newGridLines.push({
								x: screenX,
								label:
									monthDate.getMonth() === 0
										? monthDate.getFullYear().toString()
										: monthDate.toLocaleString("en-US", {
												month: "short",
											}),
								isMajor: true,
								opacity: 1,
								lineHeight: 1,
								isSubUnit: false,
							});
						} else {
							// Update existing line to be major with month label
							const existing = newGridLines.find(
								(l) => Math.abs(l.x - screenX) < 3,
							);
							if (existing) {
								existing.label =
									monthDate.getMonth() === 0
										? monthDate.getFullYear().toString()
										: monthDate.toLocaleString("en-US", {
												month: "short",
											});
								existing.isMajor = true;
							}
						}
					}

					monthDate.setMonth(monthDate.getMonth() + 1);
				}
			}

			// Add year boundaries (for month view)
			if (currentLOD.unit === "month") {
				let yearDate = new Date(startDate.getFullYear(), 0, 1);

				while (yearDate.getTime() < endTime) {
					const screenX =
						halfWidth +
						(yearDate.getTime() - centerTime) * pixelsPerMs;

					if (screenX > CONTEXT_COL_WIDTH && screenX < width) {
						// Update the January line to show year instead
						const existing = newGridLines.find(
							(l) => Math.abs(l.x - screenX) < 3,
						);
						if (existing) {
							existing.label = yearDate.getFullYear().toString();
							existing.isMajor = true;
						}
					}

					yearDate.setFullYear(yearDate.getFullYear() + 1);
				}
			}

			// Add day boundaries (for hour view) - shows "9 Mon" format
			if (currentLOD.unit === "hour") {
				let dayDate = new Date(
					startDate.getFullYear(),
					startDate.getMonth(),
					startDate.getDate(),
				);

				while (dayDate.getTime() < endTime) {
					const screenX =
						halfWidth +
						(dayDate.getTime() - centerTime) * pixelsPerMs;

					if (screenX > CONTEXT_COL_WIDTH && screenX < width) {
						const weekdayShort = dayDate.toLocaleString("en-US", {
							weekday: "short",
						});
						const dayLabel = `${dayDate.getDate()} ${weekdayShort}`;

						// Check if there's already a line very close (to prevent duplicates)
						const hasDuplicate = newGridLines.some(
							(l) => Math.abs(l.x - screenX) < 3,
						);

						if (!hasDuplicate) {
							newGridLines.push({
								x: screenX,
								label: dayLabel,
								isMajor: true,
								opacity: 1,
								lineHeight: 1,
								isSubUnit: false,
							});
						} else {
							// Update existing line
							const existing = newGridLines.find(
								(l) => Math.abs(l.x - screenX) < 3,
							);
							if (existing) {
								existing.label = dayLabel;
								existing.isMajor = true;
							}
						}
					}

					dayDate.setDate(dayDate.getDate() + 1);
				}
			}
		}

		// Helper to add sub-unit indicators that fade in as you zoom
		function addSubUnitLines() {
			if (!currentLOD.subUnit || transitionProgress < 0.3) return;

			const subOpacity = Math.min(1, (transitionProgress - 0.3) / 0.5); // Fade in from 30% to 80%

			// Special handling for minutes - progressive disclosure
			if (currentLOD.subUnit === "minute") {
				addProgressiveMinutes(subOpacity);
				return;
			}

			// Use calendar-based iteration for other sub-units
			const startDate = new Date(startTime);
			let currentDate: Date;

			switch (currentLOD.subUnit) {
				case "century":
					// Centuries within millennia
					currentDate = new Date(
						Math.floor(startDate.getFullYear() / 100) * 100,
						0,
						1,
					);
					break;
				case "decade":
					// Decades within centuries
					currentDate = new Date(
						Math.floor(startDate.getFullYear() / 10) * 10,
						0,
						1,
					);
					break;
				case "year":
					// Years within decades
					currentDate = new Date(startDate.getFullYear(), 0, 1);
					break;
				case "month":
					// Months within years - start at beginning of year
					currentDate = new Date(
						startDate.getFullYear(),
						startDate.getMonth(),
						1,
					);
					break;
				case "week":
					// Weeks - align to actual Sunday boundaries for consistency
					// Find the Sunday on or before startDate
					const dayOfWeek = startDate.getDay(); // 0 = Sunday
					currentDate = new Date(
						startDate.getFullYear(),
						startDate.getMonth(),
						startDate.getDate() - dayOfWeek,
					);
					break;
				case "day":
					// Days within weeks
					currentDate = new Date(
						startDate.getFullYear(),
						startDate.getMonth(),
						startDate.getDate(),
					);
					break;
				case "hour":
					// Hours within days
					currentDate = new Date(
						startDate.getFullYear(),
						startDate.getMonth(),
						startDate.getDate(),
						startDate.getHours(),
					);
					break;
				default:
					return;
			}

			while (currentDate.getTime() < endTime) {
				const currentTime = currentDate.getTime();
				const screenX =
					halfWidth + (currentTime - centerTime) * pixelsPerMs;

				if (screenX > CONTEXT_COL_WIDTH && screenX < width) {
					// Check if this sub-unit aligns with a parent boundary (should be skipped)
					let isParentBoundary = false;
					switch (currentLOD.subUnit) {
						case "century":
							isParentBoundary =
								currentDate.getFullYear() % 1000 === 0;
							break;
						case "decade":
							isParentBoundary =
								currentDate.getFullYear() % 100 === 0;
							break;
						case "year":
							isParentBoundary =
								currentDate.getFullYear() % 10 === 0;
							break;
						case "month":
							isParentBoundary = currentDate.getMonth() === 0; // January = year boundary
							break;
						case "week":
							isParentBoundary =
								currentDate.getDate() <= 7 &&
								currentDate.getMonth() !==
									new Date(
										currentTime - 604800000,
									).getMonth();
							break;
						case "day":
							isParentBoundary = currentDate.getDate() === 1; // First of month
							break;
						case "hour":
							isParentBoundary = currentDate.getHours() === 0; // Midnight
							break;
					}

					// Calculate opacity reduction based on proximity to existing lines
					// Lines fade out smoothly as they get closer to other lines
					const fadeDistance = 40; // Distance at which fade starts
					let proximityFactor = 1.0;
					for (const line of newGridLines) {
						const dist = Math.abs(line.x - screenX);
						if (dist < fadeDistance) {
							// Smooth fade: full opacity at fadeDistance, zero at 0
							proximityFactor = Math.min(
								proximityFactor,
								dist / fadeDistance,
							);
						}
					}

					const finalOpacity = subOpacity * proximityFactor;

					// Only add if opacity is visible and not a parent boundary
					if (!isParentBoundary && finalOpacity > 0.05) {
						// Generate label for sub-unit (will fade in as it approaches becoming the main unit)
						let subLabel = "";
						switch (currentLOD.subUnit) {
							case "century":
								subLabel = currentDate.getFullYear().toString();
								break;
							case "decade":
								subLabel = currentDate.getFullYear().toString();
								break;
							case "year":
								subLabel = currentDate.getFullYear().toString();
								break;
							case "month":
								subLabel = currentDate.toLocaleString("en-US", {
									month: "short",
								});
								break;
							case "week":
								subLabel = `W${Math.ceil(currentDate.getDate() / 7)}`;
								break;
							case "day":
								const dayWeekday = currentDate.toLocaleString(
									"en-US",
									{ weekday: "short" },
								);
								subLabel = `${currentDate.getDate()} ${dayWeekday}`;
								break;
							case "hour":
								subLabel = `${currentDate.getHours()}h`;
								break;
						}

						newGridLines.push({
							x: screenX,
							label: subLabel,
							isMajor: false,
							opacity: finalOpacity,
							lineHeight: 1,
							isSubUnit: true,
						});
					}
				}

				// Increment using calendar for proper alignment
				switch (currentLOD.subUnit) {
					case "century":
						currentDate.setFullYear(
							currentDate.getFullYear() + 100,
						);
						break;
					case "decade":
						currentDate.setFullYear(currentDate.getFullYear() + 10);
						break;
					case "year":
						currentDate.setFullYear(currentDate.getFullYear() + 1);
						break;
					case "month":
						currentDate.setMonth(currentDate.getMonth() + 1);
						break;
					case "week":
						currentDate.setDate(currentDate.getDate() + 7);
						break;
					case "day":
						currentDate.setDate(currentDate.getDate() + 1);
						break;
					case "hour":
						currentDate.setHours(currentDate.getHours() + 1);
						break;
				}
			}
		}

		// Progressive minute disclosure: :30 → :15/:45 → :10/:20/:40/:50 → :05s → all
		function addProgressiveMinutes(baseOpacity: number) {
			const startDate = new Date(startTime);
			// Start at the beginning of the hour
			let hourDate = new Date(
				startDate.getFullYear(),
				startDate.getMonth(),
				startDate.getDate(),
				startDate.getHours(),
				0,
			);

			// Define progressive minute tiers with their appearance thresholds
			// Each tier fades in at a different transitionProgress level
			const minuteTiers = [
				{ minutes: [30], threshold: 0.3 }, // :30 appears first
				{ minutes: [15, 45], threshold: 0.5 }, // :15, :45 appear next
				{ minutes: [10, 20, 40, 50], threshold: 0.7 }, // 10-minute intervals
				{ minutes: [5, 25, 35, 55], threshold: 0.85 }, // 5-minute intervals
				{
					minutes: [
						1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19,
						21, 22, 23, 24, 26, 27, 28, 29, 31, 32, 33, 34, 36, 37,
						38, 39, 41, 42, 43, 44, 46, 47, 48, 49, 51, 52, 53, 54,
						56, 57, 58, 59,
					],
					threshold: 0.95,
				}, // Individual minutes
			];

			while (hourDate.getTime() < endTime) {
				for (const tier of minuteTiers) {
					// Skip tier if transition hasn't reached its threshold
					if (transitionProgress < tier.threshold) continue;

					// Calculate tier-specific opacity (fade in from threshold to threshold + 0.15)
					const tierProgress = Math.min(
						1,
						(transitionProgress - tier.threshold) / 0.15,
					);
					const tierOpacity = baseOpacity * tierProgress;

					for (const minute of tier.minutes) {
						const minuteDate = new Date(hourDate.getTime());
						minuteDate.setMinutes(minute);

						const currentTime = minuteDate.getTime();
						if (currentTime < startTime || currentTime > endTime)
							continue;

						const screenX =
							halfWidth +
							(currentTime - centerTime) * pixelsPerMs;

						if (screenX > CONTEXT_COL_WIDTH && screenX < width) {
							// Calculate proximity-based fade
							const fadeDistance = 40;
							let proximityFactor = 1.0;
							for (const line of newGridLines) {
								const dist = Math.abs(line.x - screenX);
								if (dist < fadeDistance) {
									proximityFactor = Math.min(
										proximityFactor,
										dist / fadeDistance,
									);
								}
							}

							const finalOpacity = tierOpacity * proximityFactor;

							if (finalOpacity > 0.05) {
								newGridLines.push({
									x: screenX,
									label: `:${minute.toString().padStart(2, "0")}`,
									isMajor: false,
									opacity: finalOpacity,
									lineHeight: 1,
									isSubUnit: true,
								});
							}
						}
					}
				}

				hourDate.setHours(hourDate.getHours() + 1);
			}
		}

		addLODLines();
		addMajorBoundaries();
		addSubUnitLines();

		gridLines = newGridLines;
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
			const rgb = hexToRgb(e.color);
			// Use pre-computed lane - THIS IS THE KEY FIX
			const lane = eventLanes.get(e.id) ?? 0;

			return {
				id: parseInt(e.id.replace(/\D/g, "")) || 0,
				startTime: e.startTime,
				endTime: e.endTime,
				// Stable Y position from pre-computed lane
				y: LANE_BASE_Y - lane * LANE_SPACING,
				colorR: rgb.r,
				colorG: rgb.g,
				colorB: rgb.b,
				colorA: 1,
				importance: e.importance.effective,
				flags: 0,
			};
		});
	}

	function getImportanceThreshold(lodLevel: number): number {
		return Math.pow(lodLevel / 10, 2);
	}
</script>

<div class="calendar-container">
	<canvas bind:this={canvas}></canvas>

	<!-- Grid lines (HTML overlay) with smooth LOD transitions -->
	<div class="grid-overlay" style="left: {CONTEXT_COL_WIDTH}px;">
		{#each gridLines as line}
			<div
				class="grid-line"
				class:major={line.isMajor}
				class:sub-unit={line.isSubUnit}
				style="left: {line.x - CONTEXT_COL_WIDTH}px; 
					   opacity: {line.opacity}; 
					   height: {line.lineHeight * 100}%;
					   top: 0;"
			>
				{#if line.label}
					<span
						class="grid-label"
						class:major={line.isMajor}
						style="opacity: {line.opacity};">{line.label}</span
					>
				{/if}
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

	<!-- Debug overlay -->
	{#if viewport}
		<div class="debug-overlay">
			<div>LOD: {viewport.lodLevel}</div>
			<div>Zoom: {viewport.pixelsPerMs.toExponential(2)}</div>
		</div>
	{/if}
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

	.grid-line {
		position: absolute;
		top: 0;
		width: 1px;
		background: #ddd;
		transition: opacity 0.2s ease;
	}

	.grid-line.major {
		background: #bbb;
	}

	.grid-line.sub-unit {
		background: #ccc;
	}

	.grid-label {
		position: absolute;
		top: 8px;
		left: 6px;
		font-size: 11px;
		color: #999;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		white-space: nowrap;
	}

	.grid-label.major {
		font-size: 13px;
		font-weight: 600;
		color: #333;
	}

	.context-column {
		position: absolute;
		top: 0;
		left: 0;
		bottom: 0;
		background: rgba(255, 255, 255, 0.95);
		border-right: 1px solid #ddd;
		padding: 16px 12px;
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
		top: 10px;
		right: 10px;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		padding: 8px 12px;
		border-radius: 6px;
		font-family: monospace;
		font-size: 12px;
		pointer-events: none;
		z-index: 20;
	}

	.debug-overlay div {
		margin: 2px 0;
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

	/* Today button */
	.today-button {
		position: absolute;
		bottom: 16px;
		left: 12px;
		right: 12px;
		padding: 8px 12px;
		background: #e53935;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.today-button:hover {
		background: #c62828;
	}

	.today-button:active {
		background: #b71c1c;
	}
</style>
