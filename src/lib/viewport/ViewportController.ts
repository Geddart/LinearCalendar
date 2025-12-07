import type { ViewportState } from '$lib/types/Event';

/**
 * ZOOM CONSTANTS
 *
 * These define the zoom range. The ratio between MIN and MAX
 * determines how much you can zoom (about 10 billion times in this case,
 * from century view to minute view).
 */
const ZOOM = {
    /** Pixels per ms when fully zoomed OUT (millennium view - max zoom out) */
    MIN_PIXELS_PER_MS: 1e-13,

    /** Pixels per ms when fully zoomed IN (~2 minutes visible) */
    MAX_PIXELS_PER_MS: 0.01,

    /** 
     * Presets for quick navigation (keys 1-9)
     * Values calibrated to show specific time ranges
     */
    PRESETS: {
        DAY: 2.5e-5,        // 1: ~26 hours visible
        WEEK: 3.5e-6,       // 2: ~1 week visible
        MONTH: 1.2e-6,      // 3: ~1 month visible
        THREE_MONTH: 4e-7,  // 4: ~3 months visible
        YEAR: 1e-7,         // 5: ~1 year visible
        DECADE: 1e-8,       // 6: ~10 years visible
        LIFE: 3e-9,         // 7: ~80-100 years "lifetime" view
        CENTURY: 3e-10,     // 8: ~100 years visible
        MILLENNIUM: 3e-11   // 9: ~1000 years visible
    },

    /** Human-readable names for each preset */
    PRESET_NAMES: {
        DAY: 'Day View',
        WEEK: 'Week View',
        MONTH: 'Month View',
        THREE_MONTH: '3 Month View',
        YEAR: 'Year View',
        DECADE: 'Decade View',
        LIFE: 'Life View',
        CENTURY: 'Century View',
        MILLENNIUM: 'Millennium View'
    } as Record<string, string>
};

/**
 * ViewportController manages zoom/pan state and coordinate conversions.
 *
 * CRITICAL: This is the mathematical foundation. If this is wrong,
 * nothing will render correctly.
 */
export class ViewportController {
    private state: ViewportState;
    private canvas: HTMLCanvasElement | null = null;

    /** Callbacks for state changes (used by Svelte stores) */
    private listeners: ((state: ViewportState) => void)[] = [];

    constructor() {
        // Initialize to current time, zoomed to month view
        const now = Date.now();
        this.state = {
            centerTime: now,
            pixelsPerMs: ZOOM.PRESETS.MONTH,
            width: 0,
            height: 0,
            startTime: 0,
            endTime: 0,
            msPerPixel: 0,
            morphFactor: 0,
            lodLevel: 0
        };
    }

    /** Connect to canvas and set dimensions */
    setCanvas(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.resize(canvas.width, canvas.height);
    }

    /** Update canvas dimensions */
    resize(width: number, height: number) {
        this.state.width = width;
        this.state.height = height;
        this.updateDerived();
    }

    /** Subscribe to state changes */
    subscribe(callback: (state: ViewportState) => void) {
        this.listeners.push(callback);
        callback(this.state); // Immediate callback with current state
        return () => {
            this.listeners = this.listeners.filter((l) => l !== callback);
        };
    }

    private notifyListeners() {
        for (const listener of this.listeners) {
            listener(this.state);
        }
    }

    /**
     * COORDINATE CONVERSION: Screen X → Time
     *
     * screenX = 0 is left edge
     * Returns time in milliseconds since epoch
     */
    screenToTime(screenX: number): number {
        const offsetFromCenter = screenX - this.state.width / 2;
        return this.state.centerTime + offsetFromCenter / this.state.pixelsPerMs;
    }

    /**
     * COORDINATE CONVERSION: Time → Screen X
     *
     * time is milliseconds since epoch
     * Returns pixel position from left edge
     */
    timeToScreen(time: number): number {
        const offsetMs = time - this.state.centerTime;
        return this.state.width / 2 + offsetMs * this.state.pixelsPerMs;
    }

    /**
     * ZOOM at a specific screen position.
     *
     * The point under the cursor should stay fixed during zoom.
     * This is achieved by adjusting centerTime after changing pixelsPerMs.
     *
     * @param screenX - Pixel position to zoom around
     * @param zoomDelta - Positive = zoom in, negative = zoom out
     */
    zoomAt(screenX: number, zoomDelta: number) {
        // Get time at cursor BEFORE zoom
        const pivotTime = this.screenToTime(screenX);

        // Apply logarithmic zoom
        // WHY LOGARITHMIC: Linear zoom feels wrong because zoom levels
        // span many orders of magnitude. Log makes each scroll feel equal.
        const currentLog = Math.log(this.state.pixelsPerMs);
        const newLog = currentLog + zoomDelta * 0.1;
        let newPixelsPerMs = Math.exp(newLog);

        // Clamp to valid range
        newPixelsPerMs = Math.max(ZOOM.MIN_PIXELS_PER_MS, Math.min(ZOOM.MAX_PIXELS_PER_MS, newPixelsPerMs));

        this.state.pixelsPerMs = newPixelsPerMs;

        // Adjust center so pivot point stays at same screen position
        // MATH: If pivotTime should be at screenX after zoom:
        //   screenX = width/2 + (pivotTime - newCenter) * newPixelsPerMs
        //   Solve for newCenter:
        //   newCenter = pivotTime - (screenX - width/2) / newPixelsPerMs
        const newOffsetFromCenter = screenX - this.state.width / 2;
        this.state.centerTime = pivotTime - newOffsetFromCenter / this.state.pixelsPerMs;

        this.updateDerived();
    }

    /**
     * PAN by screen pixels.
     *
     * @param deltaX - Pixels to pan (positive = move right in time)
     */
    pan(deltaX: number) {
        // Convert pixel delta to time delta
        this.state.centerTime -= deltaX / this.state.pixelsPerMs;
        this.updateDerived();
    }

    /**
     * ANIMATE to a specific time range.
     *
     * @param startTime - Left edge time
     * @param endTime - Right edge time
     * @param duration - Animation duration in ms
     */
    animateTo(startTime: number, endTime: number, duration: number = 300) {
        const targetCenter = (startTime + endTime) / 2;
        const targetPixelsPerMs = this.state.width / (endTime - startTime);

        const startCenter = this.state.centerTime;
        const startPixelsPerMs = this.state.pixelsPerMs;
        const startTimestamp = performance.now();

        const animate = (timestamp: number) => {
            const elapsed = timestamp - startTimestamp;
            let t = Math.min(elapsed / duration, 1);

            // Ease out cubic - starts fast, ends slow
            t = 1 - Math.pow(1 - t, 3);

            // Interpolate center linearly
            this.state.centerTime = startCenter + (targetCenter - startCenter) * t;

            // Interpolate zoom LOGARITHMICALLY (for smooth feel)
            const logStart = Math.log(startPixelsPerMs);
            const logEnd = Math.log(targetPixelsPerMs);
            this.state.pixelsPerMs = Math.exp(logStart + (logEnd - logStart) * t);

            this.updateDerived();

            if (t < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    /** Go to today */
    goToToday() {
        this.state.centerTime = Date.now();
        this.updateDerived();
    }
    /**
     * Jump to the next time unit boundary based on current zoom level.
     * Jumps to the next visible "major" grid line based on pixelsPerMs.
     */
    jumpToNextTimeUnit() {
        const date = new Date(this.state.centerTime);
        const ppm = this.state.pixelsPerMs;

        // Thresholds based on what's visible as major grid lines
        // These match the visual appearance of the timeline
        const HOUR_THRESHOLD = 1e-5;    // Show hours as major when zoomed in this much
        const DAY_THRESHOLD = 1e-6;     // Show days as major
        const WEEK_THRESHOLD = 2e-7;    // Show weeks as major
        const MONTH_THRESHOLD = 5e-8;   // Show months as major
        const YEAR_THRESHOLD = 5e-9;    // Show years as major
        const DECADE_THRESHOLD = 5e-10; // Show decades as major
        const CENTURY_THRESHOLD = 5e-11; // Show centuries as major

        if (ppm >= HOUR_THRESHOLD) {
            // Hour level - jump to next hour
            date.setHours(date.getHours() + 1, 0, 0, 0);
        } else if (ppm >= DAY_THRESHOLD) {
            // Day level - jump to next day
            date.setDate(date.getDate() + 1);
            date.setHours(0, 0, 0, 0);
        } else if (ppm >= WEEK_THRESHOLD) {
            // Week level - jump to next week (Sunday)
            const daysUntilSunday = (7 - date.getDay()) % 7 || 7;
            date.setDate(date.getDate() + daysUntilSunday);
            date.setHours(0, 0, 0, 0);
        } else if (ppm >= MONTH_THRESHOLD) {
            // Month level - jump to next month
            date.setMonth(date.getMonth() + 1, 1);
            date.setHours(0, 0, 0, 0);
        } else if (ppm >= YEAR_THRESHOLD) {
            // Year level - jump to next year
            date.setFullYear(date.getFullYear() + 1, 0, 1);
            date.setHours(0, 0, 0, 0);
        } else if (ppm >= DECADE_THRESHOLD) {
            // Decade level - jump to next decade
            const nextDecade = Math.ceil((date.getFullYear() + 1) / 10) * 10;
            date.setFullYear(nextDecade, 0, 1);
            date.setHours(0, 0, 0, 0);
        } else if (ppm >= CENTURY_THRESHOLD) {
            // Century level - jump to next century
            const nextCentury = Math.ceil((date.getFullYear() + 1) / 100) * 100;
            date.setFullYear(nextCentury, 0, 1);
            date.setHours(0, 0, 0, 0);
        } else {
            // Millennium level - jump to next millennium
            const nextMillennium = Math.ceil((date.getFullYear() + 1) / 1000) * 1000;
            date.setFullYear(nextMillennium, 0, 1);
            date.setHours(0, 0, 0, 0);
        }

        this.state.centerTime = date.getTime();
        this.updateDerived();
    }

    /**
     * Jump to the previous time unit boundary based on current zoom level.
     * Jumps to the previous visible "major" grid line based on pixelsPerMs.
     */
    jumpToPreviousTimeUnit() {
        const date = new Date(this.state.centerTime);
        const ppm = this.state.pixelsPerMs;

        // Same thresholds as jumpToNextTimeUnit
        const HOUR_THRESHOLD = 1e-5;
        const DAY_THRESHOLD = 1e-6;
        const WEEK_THRESHOLD = 2e-7;
        const MONTH_THRESHOLD = 5e-8;
        const YEAR_THRESHOLD = 5e-9;
        const DECADE_THRESHOLD = 5e-10;
        const CENTURY_THRESHOLD = 5e-11;

        if (ppm >= HOUR_THRESHOLD) {
            // Hour level - jump to previous hour
            date.setHours(date.getHours() - 1, 0, 0, 0);
        } else if (ppm >= DAY_THRESHOLD) {
            // Day level - jump to previous day
            date.setDate(date.getDate() - 1);
            date.setHours(0, 0, 0, 0);
        } else if (ppm >= WEEK_THRESHOLD) {
            // Week level - jump to previous week (Sunday)
            const daysSinceSunday = date.getDay() || 7;
            date.setDate(date.getDate() - daysSinceSunday);
            date.setHours(0, 0, 0, 0);
        } else if (ppm >= MONTH_THRESHOLD) {
            // Month level - jump to previous month
            date.setMonth(date.getMonth() - 1, 1);
            date.setHours(0, 0, 0, 0);
        } else if (ppm >= YEAR_THRESHOLD) {
            // Year level - jump to previous year
            date.setFullYear(date.getFullYear() - 1, 0, 1);
            date.setHours(0, 0, 0, 0);
        } else if (ppm >= DECADE_THRESHOLD) {
            // Decade level - jump to previous decade
            const prevDecade = Math.floor((date.getFullYear() - 1) / 10) * 10;
            date.setFullYear(prevDecade, 0, 1);
            date.setHours(0, 0, 0, 0);
        } else if (ppm >= CENTURY_THRESHOLD) {
            // Century level - jump to previous century
            const prevCentury = Math.floor((date.getFullYear() - 1) / 100) * 100;
            date.setFullYear(prevCentury, 0, 1);
            date.setHours(0, 0, 0, 0);
        } else {
            // Millennium level - jump to previous millennium
            const prevMillennium = Math.floor((date.getFullYear() - 1) / 1000) * 1000;
            date.setFullYear(prevMillennium, 0, 1);
            date.setHours(0, 0, 0, 0);
        }

        this.state.centerTime = date.getTime()
        this.updateDerived();
    }

    /** Set zoom to a preset level, returns the human-readable name */
    setZoomPreset(preset: keyof typeof ZOOM.PRESETS): string {
        this.state.pixelsPerMs = ZOOM.PRESETS[preset];
        this.updateDerived();
        return ZOOM.PRESET_NAMES[preset] || preset;
    }

    /** Get the human-readable name for a preset */
    static getPresetName(preset: keyof typeof ZOOM.PRESETS): string {
        return ZOOM.PRESET_NAMES[preset] || preset;
    }

    /** Get current state (for rendering) */
    getState(): ViewportState {
        return { ...this.state };
    }

    /**
     * UPDATE DERIVED VALUES
     *
     * Called after any change to core state. Computes values
     * that depend on centerTime, pixelsPerMs, width, height.
     */
    private updateDerived() {
        const s = this.state;

        // Inverse zoom
        s.msPerPixel = 1 / s.pixelsPerMs;

        // Time bounds
        s.startTime = s.centerTime - (s.width / 2) * s.msPerPixel;
        s.endTime = s.centerTime + (s.width / 2) * s.msPerPixel;

        // Morph factor: 0 = show dots, 1 = show bars
        // Based on how many pixels a typical 1-hour event would be
        const typicalEventDuration = 60 * 60 * 1000; // 1 hour in ms
        const eventPixelWidth = typicalEventDuration * s.pixelsPerMs;
        const minBarWidth = 20; // Minimum pixels to show as bar
        s.morphFactor = Math.min(1, eventPixelWidth / minBarWidth);

        // LOD level: 0 = most detailed, 10 = least detailed
        s.lodLevel = this.calculateLODLevel();

        this.notifyListeners();
    }

    /**
     * CALCULATE LOD LEVEL from zoom.
     *
     * Returns 0-10 based on msPerPixel.
     * Higher level = only show more important events.
     */
    private calculateLODLevel(): number {
        const msPerPixel = this.state.msPerPixel;
        const MINUTE = 60000;
        const HOUR = 3600000;
        const DAY = 86400000;
        const WEEK = 604800000;
        const MONTH = 2592000000;
        const YEAR = 31536000000;

        if (msPerPixel < MINUTE) return 0; // < 1 min/px: hour detail
        if (msPerPixel < HOUR) return 1; // < 1 hour/px
        if (msPerPixel < DAY) return 2; // < 1 day/px
        if (msPerPixel < WEEK) return 3; // < 1 week/px
        if (msPerPixel < MONTH) return 4; // < 30 days/px
        if (msPerPixel < 3 * MONTH) return 5; // < 90 days/px
        if (msPerPixel < YEAR) return 6; // < 1 year/px
        if (msPerPixel < 5 * YEAR) return 7; // < 5 years/px
        if (msPerPixel < 10 * YEAR) return 8; // < 10 years/px
        if (msPerPixel < 25 * YEAR) return 9; // < 25 years/px
        return 10; // century view
    }
}

// Singleton instance for use throughout app
export const viewportController = new ViewportController();
