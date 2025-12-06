/**
 * CalendarEvent represents a single event from any calendar source.
 *
 * IMPORTANT: All times are in milliseconds since Unix epoch.
 * Use Date.getTime() to convert JavaScript Dates.
 */
export interface CalendarEvent {
    /** Unique identifier */
    id: string;

    /** Start time in milliseconds since epoch */
    startTime: number;

    /** End time in milliseconds since epoch */
    endTime: number;

    /** Display title */
    title: string;

    /** Optional description */
    description?: string;

    /** Hex color code (e.g., "#B8D4E3") */
    color: string;

    /** Importance scores for LOD system */
    importance: {
        /** 0-1, computed from event duration */
        duration: number;
        /** 0-1, inferred by AI from title */
        aiScore: number;
        /** 0-1, manually set by user */
        manual: number;
        /** 0-1, weighted combination (this is what we use for filtering) */
        effective: number;
    };

    /** True for major life events (always shown) */
    isLifeEvent: boolean;

    /** Category for coloring */
    category?: 'work' | 'personal' | 'health' | 'travel' | 'social' | 'other';

    /** Source calendar */
    source: 'mock' | 'google' | 'apple' | 'manual';
}

/**
 * Lightweight event data for GPU rendering.
 * This is what we send to the shader.
 */
export interface RenderableEvent {
    /** Index into events array */
    id: number;
    /** Start time (ms) */
    startTime: number;
    /** End time (ms) */
    endTime: number;
    /** Y position (0 = bottom, 1 = top) */
    y: number;
    /** RGB color components (0-1) */
    colorR: number;
    colorG: number;
    colorB: number;
    colorA: number;
    /** Importance (0-1) - affects size when zoomed out */
    importance: number;
    /** Bit flags: 1=selected, 2=hovered */
    flags: number;
}

/**
 * Viewport state - controls what's visible and zoom level.
 */
export interface ViewportState {
    /** Time at center of screen (ms since epoch) */
    centerTime: number;

    /** Zoom level: pixels per millisecond */
    pixelsPerMs: number;

    /** Canvas dimensions */
    width: number;
    height: number;

    // --- Derived values (computed from above) ---

    /** Time at left edge of screen */
    startTime: number;

    /** Time at right edge of screen */
    endTime: number;

    /** Inverse of pixelsPerMs */
    msPerPixel: number;

    /** 0=dots (zoomed out), 1=bars (zoomed in) */
    morphFactor: number;

    /** Discrete LOD level (0-10) for filtering events */
    lodLevel: number;
}
