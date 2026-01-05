/**
 * EventInteraction - Hit testing and event selection system
 * 
 * Provides functions to detect which event is at a given screen coordinate
 * and manages selected/hovered event state.
 */

import { writable, type Writable } from 'svelte/store';
import type { CalendarEvent, ViewportState } from '$lib/types/Event';

/**
 * Currently selected event (clicked)
 */
export const selectedEvent: Writable<CalendarEvent | null> = writable(null);

/**
 * Currently hovered event
 */
export const hoveredEvent: Writable<CalendarEvent | null> = writable(null);

/**
 * Lane layout constants (must match Calendar.svelte)
 */
const LANE_AREA_TOP = 0.12;
const LANE_AREA_BOTTOM = 0.95;
const LANE_GAP = 0.015;

/** Minimum clickable width in pixels for thin events */
const MIN_HIT_WIDTH_PX = 20;

/**
 * Hit test to find event at screen coordinates.
 * 
 * @param screenX - X coordinate in screen pixels (relative to canvas)
 * @param screenY - Y coordinate in screen pixels (relative to canvas)
 * @param viewport - Current viewport state
 * @param events - Array of events to test
 * @param getLane - Function to get lane order for an event
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param laneCount - Number of lanes (for dynamic lane calculation)
 * @returns The event at the coordinates, or null if none
 */
export function hitTest(
    screenX: number,
    screenY: number,
    viewport: ViewportState,
    events: CalendarEvent[],
    getLane: (event: CalendarEvent) => number,
    canvasWidth: number,
    canvasHeight: number,
    laneCount: number = 8
): CalendarEvent | null {
    // Convert screen Y to normalized Y (0 = top, 1 = bottom)
    const normalizedY = screenY / canvasHeight;

    // Calculate lane height dynamically
    const numLanes = Math.max(1, laneCount);
    const totalLaneArea = LANE_AREA_BOTTOM - LANE_AREA_TOP - (LANE_GAP * (numLanes - 1));
    const laneHeight = totalLaneArea / numLanes;

    // Find which lane this Y is in
    let hitLaneOrder = -1;
    for (let i = 0; i < numLanes; i++) {
        const laneTop = LANE_AREA_TOP + i * (laneHeight + LANE_GAP);
        const laneBottom = laneTop + laneHeight + LANE_GAP;
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
        const eventLane = getLane(event);

        // Check if lane matches
        if (eventLane !== hitLaneOrder) continue;

        // Calculate event width in pixels
        const eventWidthPx = (event.endTime - event.startTime) * viewport.pixelsPerMs;

        // Expand hit area for thin events
        let hitStartTime = event.startTime;
        let hitEndTime = event.endTime;
        if (eventWidthPx < MIN_HIT_WIDTH_PX) {
            const expandMs = (MIN_HIT_WIDTH_PX - eventWidthPx) / 2 / viewport.pixelsPerMs;
            hitStartTime -= expandMs;
            hitEndTime += expandMs;
        }

        // Check if time is within (possibly expanded) event bounds
        if (clickTime >= hitStartTime && clickTime <= hitEndTime) {
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
