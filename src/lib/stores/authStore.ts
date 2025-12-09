/**
 * Auth Store - Manages Google Calendar authentication state
 * 
 * Uses Svelte 5 runes for reactivity.
 */

import { writable } from 'svelte/store';

export interface GoogleAuthState {
    isConnected: boolean;
    email: string | null;
    accessToken: string | null;
    expiresAt: number | null;
    selectedCalendarIds: string[];
}

const initialState: GoogleAuthState = {
    isConnected: false,
    email: null,
    accessToken: null,
    expiresAt: null,
    selectedCalendarIds: [],
};

/**
 * Create the auth store
 */
function createAuthStore() {
    const { subscribe, set, update } = writable<GoogleAuthState>(initialState);

    return {
        subscribe,

        /**
         * Set connected state after successful OAuth
         */
        connect(email: string, accessToken: string, expiresAt: number) {
            update(state => ({
                ...state,
                isConnected: true,
                email,
                accessToken,
                expiresAt,
            }));
        },

        /**
         * Disconnect and clear state
         */
        disconnect() {
            set(initialState);
        },

        /**
         * Update selected calendars
         */
        setSelectedCalendars(calendarIds: string[]) {
            update(state => ({
                ...state,
                selectedCalendarIds: calendarIds,
            }));
        },

        /**
         * Toggle a calendar selection
         */
        toggleCalendar(calendarId: string) {
            update(state => {
                const ids = state.selectedCalendarIds;
                const isSelected = ids.includes(calendarId);
                return {
                    ...state,
                    selectedCalendarIds: isSelected
                        ? ids.filter(id => id !== calendarId)
                        : [...ids, calendarId],
                };
            });
        },

        /**
         * Check if token is expired
         */
        isTokenExpired(): boolean {
            let expired = true;
            const unsubscribe = subscribe(state => {
                expired = state.expiresAt ? Date.now() > state.expiresAt : true;
            });
            unsubscribe();
            return expired;
        },
    };
}

export const authStore = createAuthStore();

/**
 * Load auth state from localStorage on startup
 */
export function loadAuthState(): void {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem('google_auth');
    if (stored) {
        try {
            const state = JSON.parse(stored) as GoogleAuthState;
            // Only restore if not expired
            if (state.expiresAt && Date.now() < state.expiresAt) {
                authStore.connect(
                    state.email || '',
                    state.accessToken || '',
                    state.expiresAt
                );
                authStore.setSelectedCalendars(state.selectedCalendarIds);
            }
        } catch (e) {
            console.error('Failed to parse stored auth state:', e);
        }
    }
}

/**
 * Save auth state to localStorage
 */
export function saveAuthState(state: GoogleAuthState): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('google_auth', JSON.stringify(state));
}

/**
 * Clear auth state from localStorage
 */
export function clearAuthState(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('google_auth');
}
