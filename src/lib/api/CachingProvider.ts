/**
 * CachingProvider - Read-only caching layer for calendar providers
 * 
 * Wraps any CalendarProvider and caches event data for faster subsequent queries.
 * The cache is read-only and never modifies the underlying provider data.
 */

import type { CalendarEvent } from '$lib/types/Event';
import type {
    CalendarProvider,
    ProviderType,
    AuthState,
    CalendarInfo,
    FetchEventsOptions,
    FetchResult,
} from './CalendarProvider';
import { eventStore, EventStore } from '$lib/events/EventStore';

/**
 * Cache entry with TTL information
 */
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
}

/**
 * Configuration for the caching provider
 */
export interface CachingProviderConfig {
    /** Time-to-live for cached events in milliseconds (default: 5 minutes) */
    eventTTL?: number;
    /** Time-to-live for cached calendar list in milliseconds (default: 30 minutes) */
    calendarsTTL?: number;
    /** Use shared EventStore for efficient queries (default: true) */
    useSharedEventStore?: boolean;
}

const DEFAULT_EVENT_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CALENDARS_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * CachingProvider wraps a CalendarProvider with a read-only caching layer
 */
export class CachingProvider implements CalendarProvider {
    private provider: CalendarProvider;
    private config: Required<CachingProviderConfig>;

    // Cache storage
    private calendarsCache: CacheEntry<CalendarInfo[]> | null = null;
    private eventCache: EventStore;
    private loadedRanges: { start: number; end: number }[] = [];

    readonly type: ProviderType;
    readonly name: string;
    readonly supportsWrite = false; // Caching layer is always read-only

    constructor(provider: CalendarProvider, config: CachingProviderConfig = {}) {
        this.provider = provider;
        this.config = {
            eventTTL: config.eventTTL ?? DEFAULT_EVENT_TTL,
            calendarsTTL: config.calendarsTTL ?? DEFAULT_CALENDARS_TTL,
            useSharedEventStore: config.useSharedEventStore ?? true,
        };

        this.type = provider.type;
        this.name = `${provider.name} (Cached)`;

        // Use shared EventStore or create private one
        this.eventCache = this.config.useSharedEventStore ? eventStore : new EventStore();
    }

    // =========================================
    // Authentication (passthrough)
    // =========================================

    getAuthState(): AuthState {
        return this.provider.getAuthState();
    }

    async authenticate(): Promise<AuthState> {
        return this.provider.authenticate();
    }

    async signOut(): Promise<void> {
        // Clear cache on sign out
        this.clearCache();
        return this.provider.signOut();
    }

    // =========================================
    // Read Operations (with caching)
    // =========================================

    async getCalendars(): Promise<FetchResult<CalendarInfo[]>> {
        const now = Date.now();

        // Check cache validity
        if (this.calendarsCache && this.calendarsCache.expiresAt > now) {
            return {
                data: this.calendarsCache.data,
                hasMore: false,
            };
        }

        // Fetch from provider
        const result = await this.provider.getCalendars();

        // Cache the result
        if (!result.error) {
            this.calendarsCache = {
                data: result.data,
                timestamp: now,
                expiresAt: now + this.config.calendarsTTL,
            };
        }

        return result;
    }

    async fetchEvents(options: FetchEventsOptions): Promise<FetchResult<CalendarEvent[]>> {
        const { startTime, endTime } = options;

        // Check if this range is fully covered by cached ranges
        const isCovered = this.isRangeCovered(startTime, endTime);

        if (isCovered) {
            // Query from cache using EventStore's O(log n) query
            const cachedEvents = this.eventCache.queryRange(startTime, endTime);

            // Apply additional filters if needed
            let filtered = cachedEvents;
            if (options.calendarIds && options.calendarIds.length > 0) {
                filtered = filtered.filter(e =>
                    e.category && options.calendarIds!.includes(e.category)
                );
            }

            return {
                data: filtered,
                hasMore: false,
            };
        }

        // Fetch from provider and cache
        const result = await this.provider.fetchEvents(options);

        if (!result.error && result.data.length > 0) {
            // Add to cache
            this.eventCache.addEvents(result.data);

            // Mark range as loaded
            this.addLoadedRange(startTime, endTime);
        }

        return result;
    }

    async getEvent(eventId: string): Promise<CalendarEvent | null> {
        // Check cache first
        const cached = this.eventCache.getById(eventId);
        if (cached) return cached;

        // Fallback to provider
        const event = await this.provider.getEvent(eventId);

        // Cache the event if found
        if (event) {
            this.eventCache.addEvents([event]);
        }

        return event;
    }

    async fetchChanges(syncToken: string): Promise<FetchResult<CalendarEvent[]>> {
        if (!this.provider.fetchChanges) {
            return { data: [], hasMore: false };
        }

        const result = await this.provider.fetchChanges(syncToken);

        // Update cache with changes
        if (!result.error && result.data.length > 0) {
            this.eventCache.addEvents(result.data);
        }

        return result;
    }

    // =========================================
    // Cache Management
    // =========================================

    /**
     * Clear all cached data
     */
    clearCache(): void {
        this.calendarsCache = null;
        this.loadedRanges = [];

        // Only clear event cache if we have our own (not shared)
        if (!this.config.useSharedEventStore) {
            this.eventCache.clear();
        }
    }

    /**
     * Prefetch events for a time range (useful for preloading)
     */
    async prefetch(startTime: number, endTime: number): Promise<void> {
        await this.fetchEvents({ startTime, endTime });
    }

    /**
     * Check if a time range is fully covered by cached data
     */
    private isRangeCovered(start: number, end: number): boolean {
        for (const range of this.loadedRanges) {
            if (range.start <= start && range.end >= end) {
                return true;
            }
        }
        return false;
    }

    /**
     * Add a loaded range, merging with adjacent ranges
     */
    private addLoadedRange(start: number, end: number): void {
        // Simple implementation: just add the range
        // A more sophisticated version would merge overlapping ranges
        this.loadedRanges.push({ start, end });

        // Limit stored ranges to prevent memory growth
        if (this.loadedRanges.length > 100) {
            this.loadedRanges = this.loadedRanges.slice(-50);
        }
    }
}

/**
 * Create a cached version of any provider
 */
export function withCaching(
    provider: CalendarProvider,
    config?: CachingProviderConfig
): CachingProvider {
    return new CachingProvider(provider, config);
}
