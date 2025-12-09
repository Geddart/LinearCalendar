/**
 * Day/Night Renderer - Calculates day/night overlay segments for the timeline
 * 
 * Generates soft gradient segments showing daylight and nighttime periods.
 * Only visible when zoomed to day level or closer (pixelsPerMs > 3.00e-7).
 */

import { getSunTimes, getStartOfDay, type SunTimes } from '$lib/utils/SunCalculator';
import type { ViewportState } from '$lib/types/Event';

/** 
 * Threshold at which day/night overlay becomes visible.
 * Visible when pixelsPerMs > this value (day view and more zoomed in).
 */
export const DAY_NIGHT_THRESHOLD = 3.00e-7;

/** Fade range for smooth appearance (higher = more zoomed in) */
const FADE_START = 2.00e-7;  // Start fading in
const FADE_END = 4.00e-7;    // Fully visible

export type SegmentType = 'day' | 'night' | 'dawn' | 'dusk';

export interface DayNightSegment {
    /** Start X position in pixels */
    startX: number;
    /** End X position in pixels */
    endX: number;
    /** Type of segment */
    type: SegmentType;
    /** Base opacity (0-1) */
    opacity: number;
}

export interface DayNightOverlay {
    /** All segments for the visible viewport */
    segments: DayNightSegment[];
    /** Overall opacity based on zoom level */
    opacity: number;
}

const DAY_MS = 86_400_000;

/**
 * Calculate the fade-in opacity based on zoom level.
 * Returns 0 when zoomed out, 1 when zoomed in past threshold.
 */
function calculateZoomOpacity(pixelsPerMs: number): number {
    // More zoomed in = higher pixelsPerMs = more visible
    if (pixelsPerMs <= FADE_START) return 0;
    if (pixelsPerMs >= FADE_END) return 1;
    return (pixelsPerMs - FADE_START) / (FADE_END - FADE_START);
}

/**
 * Convert time to screen X position
 */
function timeToScreenX(time: number, viewport: ViewportState): number {
    return (time - viewport.startTime) * viewport.pixelsPerMs;
}

/**
 * Calculate day/night overlay for the visible viewport
 */
export function calculateDayNightOverlay(
    viewport: ViewportState,
    latitude: number,
    longitude: number
): DayNightOverlay {
    const opacity = calculateZoomOpacity(viewport.pixelsPerMs);

    // Return empty if not visible
    if (opacity <= 0) {
        return { segments: [], opacity: 0 };
    }

    const segments: DayNightSegment[] = [];

    // Find first day that could be visible (start 1 day before viewport start)
    const firstDayStart = getStartOfDay(viewport.startTime - DAY_MS);
    const lastDayEnd = getStartOfDay(viewport.endTime + DAY_MS);

    // Iterate through each day in the visible range
    for (let dayStart = firstDayStart; dayStart <= lastDayEnd; dayStart += DAY_MS) {
        const sunTimes = getSunTimes(new Date(dayStart), latitude, longitude);
        addDaySegments(segments, sunTimes, dayStart, viewport, opacity);
    }

    return { segments, opacity };
}

/**
 * Add segments for a single day
 */
function addDaySegments(
    segments: DayNightSegment[],
    sunTimes: SunTimes,
    dayStart: number,
    viewport: ViewportState,
    baseOpacity: number
): void {
    const dayEnd = dayStart + DAY_MS;

    // Night before dawn
    addSegment(segments, dayStart, sunTimes.dawn, 'night', viewport, baseOpacity * 0.6);

    // Dawn (twilight)
    addSegment(segments, sunTimes.dawn, sunTimes.sunrise, 'dawn', viewport, baseOpacity * 0.8);

    // Day (sunrise to sunset)
    addSegment(segments, sunTimes.sunrise, sunTimes.sunset, 'day', viewport, baseOpacity);

    // Dusk (twilight)
    addSegment(segments, sunTimes.sunset, sunTimes.dusk, 'dusk', viewport, baseOpacity * 0.8);

    // Night after dusk
    addSegment(segments, sunTimes.dusk, dayEnd, 'night', viewport, baseOpacity * 0.6);
}

/**
 * Add a segment if it's within the visible viewport
 */
function addSegment(
    segments: DayNightSegment[],
    startTime: number,
    endTime: number,
    type: SegmentType,
    viewport: ViewportState,
    opacity: number
): void {
    // Skip if entirely outside viewport
    if (endTime < viewport.startTime || startTime > viewport.endTime) return;

    // Clamp to viewport bounds
    const clampedStart = Math.max(startTime, viewport.startTime);
    const clampedEnd = Math.min(endTime, viewport.endTime);

    const startX = timeToScreenX(clampedStart, viewport);
    const endX = timeToScreenX(clampedEnd, viewport);

    // Skip tiny segments
    if (endX - startX < 1) return;

    segments.push({ startX, endX, type, opacity });
}

/**
 * Get CSS background color for a segment type
 */
export function getSegmentColor(type: SegmentType): string {
    switch (type) {
        case 'day':
            return 'rgba(255, 255, 255, 1)';     // Solid white (day)
        case 'dawn':
            // Gradient from night (blue) to day (white) - left to right
            return 'linear-gradient(to right, rgba(180, 190, 210, 1), rgba(255, 255, 255, 1))';
        case 'dusk':
            // Gradient from day (white) to night (blue) - left to right
            return 'linear-gradient(to right, rgba(255, 255, 255, 1), rgba(180, 190, 210, 1))';
        case 'night':
            return 'rgba(180, 190, 210, 1)';     // Subtle blue/grey (night)
    }
}

