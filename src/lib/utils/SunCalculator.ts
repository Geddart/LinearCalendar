/**
 * Sun Calculator - Calculates sunrise/sunset times using suncalc
 * 
 * Provides cached sun time calculations for any date and location.
 * Designed to be extensible for future season calculations.
 */

import SunCalc from 'suncalc';

export interface SunTimes {
    /** Civil dawn (start of twilight) */
    dawn: number;
    /** Sunrise time */
    sunrise: number;
    /** Solar noon (sun at highest point) */
    solarNoon: number;
    /** Sunset time */
    sunset: number;
    /** Civil dusk (end of twilight) */
    dusk: number;
}

// Cache for sun times (key: "YYYY-MM-DD:lat:lng")
const cache = new Map<string, SunTimes>();
const MAX_CACHE_SIZE = 365; // Cache up to a year of dates

/**
 * Generate cache key for a date and location
 */
function getCacheKey(date: Date, lat: number, lng: number): string {
    const dateStr = date.toISOString().split('T')[0];
    return `${dateStr}:${lat.toFixed(2)}:${lng.toFixed(2)}`;
}

/**
 * Get sun times for a specific date and location
 * Results are cached per day to avoid recalculation
 */
export function getSunTimes(date: Date, lat: number, lng: number): SunTimes {
    const key = getCacheKey(date, lat, lng);

    // Return cached if available
    const cached = cache.get(key);
    if (cached) return cached;

    // Calculate using suncalc
    const times = SunCalc.getTimes(date, lat, lng);

    const result: SunTimes = {
        dawn: times.dawn?.getTime() ?? times.sunrise?.getTime() ?? date.getTime(),
        sunrise: times.sunrise?.getTime() ?? date.getTime(),
        solarNoon: times.solarNoon?.getTime() ?? date.getTime(),
        sunset: times.sunset?.getTime() ?? date.getTime(),
        dusk: times.dusk?.getTime() ?? times.sunset?.getTime() ?? date.getTime(),
    };

    // Manage cache size
    if (cache.size >= MAX_CACHE_SIZE) {
        // Remove oldest entry (first key)
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
    }

    cache.set(key, result);
    return result;
}

/**
 * Get sun times for a timestamp (convenience function)
 */
export function getSunTimesForTimestamp(timestamp: number, lat: number, lng: number): SunTimes {
    return getSunTimes(new Date(timestamp), lat, lng);
}

/**
 * Get the start of day (midnight) for a given timestamp
 */
export function getStartOfDay(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

/**
 * Clear the sun times cache (useful for testing)
 */
export function clearSunCache(): void {
    cache.clear();
}
