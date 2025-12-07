/**
 * CalendarLane represents a horizontal lane for organizing events.
 * 
 * Lanes correspond to different calendars or event categories.
 * Designed to support future calendar imports with many lanes.
 */
export interface CalendarLane {
    /** Unique identifier (e.g., 'todo', 'health') */
    id: string;
    /** Display name shown in the lane label */
    name: string;
    /** Lane color (hex) - used for lane separator and density visualization */
    color: string;
    /** Lane order (0 = topmost) */
    order: number;
    /** Whether lane is currently collapsed (hidden) */
    collapsed?: boolean;
}

/**
 * Default calendar lanes.
 * These match the initial UI design and can be extended for calendar imports.
 */
export const DEFAULT_LANES: CalendarLane[] = [
    { id: 'todo', name: 'Todo', color: '#E3B8D4', order: 0 },
    { id: 'health', name: 'Health', color: '#D4E3B8', order: 1 },
    { id: 'people', name: 'People', color: '#D4B8E3', order: 2 },
    { id: 'work', name: 'Work', color: '#B8D4E3', order: 3 },
];

/**
 * CalendarEvent represents a single event from any calendar source.
 *
 * IMPORTANT: All times are in milliseconds since Unix epoch.
 * Use Date.getTime() to convert JavaScript Dates.
 * 
 * This interface supports Google Calendar, Apple Calendar, and manual events.
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

    /** Optional description/notes */
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

    /** Calendar lane ID this event belongs to */
    calendarLaneId?: string;

    // --- Location/Place Data ---

    /** Event location */
    location?: {
        /** Place name (e.g., "Coffee Shop") */
        name?: string;
        /** Full address */
        address?: string;
        /** GPS coordinates for map integration */
        coordinates?: {
            lat: number;
            lng: number;
        };
    };

    // --- Attendees ---

    /** List of event attendees */
    attendees?: {
        name: string;
        email?: string;
        status?: 'accepted' | 'declined' | 'tentative' | 'pending';
        isOrganizer?: boolean;
    }[];

    // --- Recurrence ---

    /** iCal RRULE format for recurring events */
    recurrenceRule?: string;
    /** Parent event ID for recurring event instances */
    recurringEventId?: string;

    // --- Reminders ---

    /** Event reminders */
    reminders?: {
        method: 'email' | 'popup' | 'sms';
        minutesBefore: number;
    }[];

    // --- Links/URLs ---

    /** Video conference URL (Zoom, Meet, etc.) */
    conferenceUrl?: string;
    /** Link to event in original calendar app */
    htmlLink?: string;

    // --- Metadata ---

    /** When event was created (ms since epoch) */
    createdAt?: number;
    /** When event was last updated (ms since epoch) */
    updatedAt?: number;
    /** Organizer email */
    organizer?: string;
    /** Whether this is an all-day event */
    allDay?: boolean;
    /** Event status */
    status?: 'confirmed' | 'tentative' | 'cancelled';
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
