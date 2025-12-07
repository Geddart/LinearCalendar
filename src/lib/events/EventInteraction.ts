/**
 * EventInteraction - Hit testing and event selection system
 * 
 * Provides functions to detect which event is at a given screen coordinate
 * and manages selected/hovered event state.
 */

import { writable, type Writable } from 'svelte/store';
import type { CalendarEvent, ViewportState } from '$lib/types/Event';
import { DEFAULT_LANES } from '$lib/types/Event';

/**
 * Currently selected event (clicked)
 */
export const selectedEvent: Writable<CalendarEvent | null> = writable(null);

/**
 * Currently hovered event
 */
export const hoveredEvent: Writable<CalendarEvent | null> = writable(null);

/**
 * Lane layout constants (must match Calendar.svelte and SimpleEventRenderer.ts)
 */
const LANE_AREA_TOP = 0.10;
const LANE_AREA_BOTTOM = 0.98;
const LANE_GAP = 0.01;
const NUM_LANES = DEFAULT_LANES.length;
const TOTAL_LANE_AREA = LANE_AREA_BOTTOM - LANE_AREA_TOP - (LANE_GAP * (NUM_LANES - 1));
const LANE_HEIGHT = TOTAL_LANE_AREA / NUM_LANES;

/**
 * Hit test to find event at screen coordinates.
 * 
 * @param screenX - X coordinate in screen pixels (relative to canvas)
 * @param screenY - Y coordinate in screen pixels (relative to canvas)
 * @param viewport - Current viewport state
 * @param events - Array of events to test
 * @param eventLanes - Map of event ID to lane order
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @returns The event at the coordinates, or null if none
 */
export function hitTest(
    screenX: number,
    screenY: number,
    viewport: ViewportState,
    events: CalendarEvent[],
    eventLanes: Map<string, number>,
    canvasWidth: number,
    canvasHeight: number
): CalendarEvent | null {
    // Convert screen Y to normalized Y (0 = top, 1 = bottom)
    const normalizedY = screenY / canvasHeight;

    // Find which lane this Y is in
    let hitLaneOrder = -1;
    for (let i = 0; i < NUM_LANES; i++) {
        const laneTop = LANE_AREA_TOP + i * (LANE_HEIGHT + LANE_GAP);
        const laneBottom = laneTop + LANE_HEIGHT + LANE_GAP;
        if (normalizedY >= laneTop && normalizedY < laneBottom) {
            hitLaneOrder = i;
            break;
        }
    }

    if (hitLaneOrder === -1) return null;

    // Convert screen X to time
    // screenX is relative to canvas left edge
    // viewport.centerTime is at canvasWidth/2
    const centerX = canvasWidth / 2;
    const offsetPx = screenX - centerX;
    const clickTime = viewport.centerTime + (offsetPx / viewport.pixelsPerMs);

    // Find events that match this time and lane
    // Return the first (most important) match
    for (const event of events) {
        const eventLane = eventLanes.get(event.id) ?? 0;

        // Check if lane matches
        if (eventLane !== hitLaneOrder) continue;

        // Check if time is within event bounds
        if (clickTime >= event.startTime && clickTime <= event.endTime) {
            return event;
        }
    }

    return null;
}

/**
 * Select an event (typically on click)
 */
export function selectEvent(event: CalendarEvent | null): void {
    selectedEvent.set(event);
}

/**
 * Clear selection
 */
export function clearSelection(): void {
    selectedEvent.set(null);
}

/**
 * Set hovered event (typically on mouse move)
 */
export function setHoveredEvent(event: CalendarEvent | null): void {
    hoveredEvent.set(event);
}
