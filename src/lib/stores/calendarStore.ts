/**
 * Calendar Store - Manages selected calendars and visibility state
 */

import { writable, derived } from 'svelte/store';
import type { CalendarInfo } from '$lib/api/CalendarProvider';

export interface CalendarState {
    /** All available calendars from Google */
    available: CalendarInfo[];
    /** Calendar IDs selected for display */
    selected: Set<string>;
    /** Calendar IDs currently visible (eye toggle) */
    visible: Set<string>;
    /** Whether to show historical events */
    showHistorical: boolean;
}

const initialState: CalendarState = {
    available: [],
    selected: new Set(),
    visible: new Set(),
    showHistorical: true,
};

function createCalendarStore() {
    const { subscribe, set, update } = writable<CalendarState>(initialState);

    return {
        subscribe,

        /**
         * Set available calendars from Google
         */
        setAvailable(calendars: CalendarInfo[]) {
            update(state => ({
                ...state,
                available: calendars,
            }));
        },

        /**
         * Set selected calendars (from CalendarSelector)
         */
        setSelected(calendarIds: string[]) {
            const selected = new Set(calendarIds);
            update(state => ({
                ...state,
                selected,
                // Also add to visible by default
                visible: new Set([...state.visible, ...calendarIds]),
            }));
        },

        /**
         * Toggle visibility of a calendar (eye icon)
         */
        toggleVisibility(calendarId: string) {
            update(state => {
                const visible = new Set(state.visible);
                if (visible.has(calendarId)) {
                    visible.delete(calendarId);
                } else {
                    visible.add(calendarId);
                }
                return { ...state, visible };
            });
        },

        /**
         * Set visibility of a calendar
         */
        setVisibility(calendarId: string, isVisible: boolean) {
            update(state => {
                const visible = new Set(state.visible);
                if (isVisible) {
                    visible.add(calendarId);
                } else {
                    visible.delete(calendarId);
                }
                return { ...state, visible };
            });
        },

        /**
         * Toggle historical events
         */
        toggleHistorical() {
            update(state => ({
                ...state,
                showHistorical: !state.showHistorical,
            }));
        },

        /**
         * Set historical events visibility
         */
        setHistorical(show: boolean) {
            update(state => ({
                ...state,
                showHistorical: show,
            }));
        },

        /**
         * Check if a calendar is visible
         */
        isVisible(calendarId: string): boolean {
            let visible = false;
            const unsubscribe = subscribe(state => {
                visible = state.visible.has(calendarId);
            });
            unsubscribe();
            return visible;
        },

        /**
         * Reset to initial state
         */
        reset() {
            set(initialState);
        },

        /**
         * Load from localStorage
         */
        load() {
            if (typeof window === 'undefined') return;
            const stored = localStorage.getItem('calendar_state');
            if (stored) {
                try {
                    const data = JSON.parse(stored);
                    update(state => ({
                        ...state,
                        selected: new Set(data.selected || []),
                        visible: new Set(data.visible || []),
                        showHistorical: data.showHistorical || false,
                    }));
                } catch (e) {
                    console.error('Failed to load calendar state:', e);
                }
            }
        },

        /**
         * Save to localStorage
         */
        save() {
            if (typeof window === 'undefined') return;
            const unsubscribe = subscribe(state => {
                const data = {
                    selected: Array.from(state.selected),
                    visible: Array.from(state.visible),
                    showHistorical: state.showHistorical,
                };
                localStorage.setItem('calendar_state', JSON.stringify(data));
            });
            unsubscribe();
        },
    };
}

export const calendarStore = createCalendarStore();

/**
 * Derived store: calendars that are both selected AND visible
 */
export const activeCalendars = derived(
    calendarStore,
    $state => $state.available.filter(
        cal => $state.selected.has(cal.id) && $state.visible.has(cal.id)
    )
);
