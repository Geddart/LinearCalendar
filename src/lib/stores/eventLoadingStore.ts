/**
 * Event Loading Store - Tracks loading state for lazy-loaded calendar events
 * 
 * Provides reactive state for UI loading indicators.
 */

import { writable, derived } from 'svelte/store';

/**
 * Represents a time range being loaded
 */
export interface LoadingRegion {
    startTime: number;
    endTime: number;
}

/**
 * State for event loading
 */
export interface EventLoadingState {
    /** Whether any chunks are currently being fetched */
    isLoading: boolean;
    /** Time regions currently being loaded */
    loadingRegions: LoadingRegion[];
    /** Last error message, if any */
    error: string | null;
    /** Total chunks loaded (for debugging) */
    chunksLoaded: number;
}

const initialState: EventLoadingState = {
    isLoading: false,
    loadingRegions: [],
    error: null,
    chunksLoaded: 0,
};

function createEventLoadingStore() {
    const { subscribe, set, update } = writable<EventLoadingState>(initialState);

    return {
        subscribe,

        /**
         * Mark a region as loading
         */
        startLoading(region: LoadingRegion) {
            update(state => ({
                ...state,
                isLoading: true,
                loadingRegions: [...state.loadingRegions, region],
                error: null,
            }));
        },

        /**
         * Mark a region as done loading
         */
        finishLoading(region: LoadingRegion) {
            update(state => {
                const loadingRegions = state.loadingRegions.filter(
                    r => r.startTime !== region.startTime || r.endTime !== region.endTime
                );
                return {
                    ...state,
                    isLoading: loadingRegions.length > 0,
                    loadingRegions,
                    chunksLoaded: state.chunksLoaded + 1,
                };
            });
        },

        /**
         * Set an error state
         */
        setError(error: string) {
            update(state => ({
                ...state,
                error,
            }));
        },

        /**
         * Clear error state
         */
        clearError() {
            update(state => ({
                ...state,
                error: null,
            }));
        },

        /**
         * Reset to initial state
         */
        reset() {
            set(initialState);
        },
    };
}

export const eventLoadingStore = createEventLoadingStore();

/**
 * Derived store: just the loading boolean for simple consumption
 */
export const isLoadingEvents = derived(
    eventLoadingStore,
    $state => $state.isLoading
);
