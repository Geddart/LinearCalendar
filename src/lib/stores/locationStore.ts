/**
 * Location Store - Manages user location for day/night calculations
 * 
 * Persists to localStorage and supports manual entry or auto-detect via Geolocation API.
 */

import { writable } from 'svelte/store';

export interface LocationState {
    /** Latitude in degrees (-90 to 90) */
    latitude: number;
    /** Longitude in degrees (-180 to 180) */
    longitude: number;
    /** Human-readable location name */
    locationName: string;
    /** How the location was set */
    source: 'manual' | 'auto' | 'default';
}

// Default to Amsterdam (close to timezone offset for CET)
const DEFAULT_LOCATION: LocationState = {
    latitude: 52.3676,
    longitude: 4.9041,
    locationName: 'Amsterdam, Netherlands',
    source: 'default',
};

const STORAGE_KEY = 'location_state';

function createLocationStore() {
    const { subscribe, set, update } = writable<LocationState>(DEFAULT_LOCATION);

    return {
        subscribe,

        /**
         * Set location manually
         */
        setManual(latitude: number, longitude: number, locationName: string = '') {
            const state: LocationState = {
                latitude,
                longitude,
                locationName: locationName || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
                source: 'manual',
            };
            set(state);
            this.save();
        },

        /**
         * Auto-detect location using browser Geolocation API
         * Returns a promise that resolves when location is set or rejects on error
         */
        async autoDetect(): Promise<LocationState> {
            return new Promise((resolve, reject) => {
                if (!navigator.geolocation) {
                    reject(new Error('Geolocation not supported'));
                    return;
                }

                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const state: LocationState = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            locationName: 'Current Location',
                            source: 'auto',
                        };
                        set(state);
                        this.save();
                        resolve(state);
                    },
                    (error) => {
                        reject(error);
                    },
                    {
                        enableHighAccuracy: false,
                        timeout: 10000,
                        maximumAge: 60000,
                    }
                );
            });
        },

        /**
         * Reset to default location
         */
        reset() {
            set(DEFAULT_LOCATION);
            if (typeof window !== 'undefined') {
                localStorage.removeItem(STORAGE_KEY);
            }
        },

        /**
         * Load from localStorage
         */
        load() {
            if (typeof window === 'undefined') return;
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                try {
                    const data = JSON.parse(stored);
                    set({
                        latitude: data.latitude ?? DEFAULT_LOCATION.latitude,
                        longitude: data.longitude ?? DEFAULT_LOCATION.longitude,
                        locationName: data.locationName ?? DEFAULT_LOCATION.locationName,
                        source: data.source ?? 'default',
                    });
                } catch (e) {
                    console.error('Failed to load location state:', e);
                }
            }
        },

        /**
         * Save to localStorage
         */
        save() {
            if (typeof window === 'undefined') return;
            const unsubscribe = subscribe((state) => {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            });
            unsubscribe();
        },
    };
}

export const locationStore = createLocationStore();
