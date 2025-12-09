/**
 * EventLoader - Manages lazy loading of calendar events based on viewport
 * 
 * Key features:
 * - Chunk-based loading (6-month chunks)
 * - Debounced requests to avoid excessive API calls
 * - Non-blocking: yields to render thread during batch processing
 * - Deduplication of loaded/in-flight chunks
 */

import type { CalendarEvent } from '$lib/types/Event';
import type { CalendarInfo } from './CalendarProvider';
import { googleProvider } from './GoogleCalendarProvider';
import { eventStore } from '$lib/events/EventStore';
import { eventLoadingStore, type LoadingRegion } from '$lib/stores/eventLoadingStore';

/** Size of each chunk in milliseconds (6 months) */
const CHUNK_SIZE_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months

/** Debounce delay before fetching after viewport changes */
const DEBOUNCE_MS = 150;

/** Number of events to process before yielding to render thread */
const BATCH_SIZE = 100;

/** How far ahead/behind current viewport to prefetch */
const PREFETCH_BUFFER = 0.5; // 50% of visible range on each side

/**
 * Represents a chunk of time that can be loaded
 */
interface Chunk {
    id: string;
    startTime: number;
    endTime: number;
}

/**
 * EventLoader singleton - manages lazy loading of events
 */
class EventLoader {
    /** Set of chunk IDs that have been loaded */
    private loadedChunks = new Set<string>();

    /** Set of chunk IDs currently being loaded */
    private loadingChunks = new Set<string>();

    /** Debounce timer for viewport updates */
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;

    /** Calendar IDs to fetch from */
    private calendarIds: string[] = [];

    /** Color map for calendars */
    private calendarColorMap = new Map<string, string>();

    /** Last requested viewport range */
    private lastViewport: { startTime: number; endTime: number } | null = null;

    /**
     * Set the calendars to fetch events from
     */
    setCalendars(calendars: CalendarInfo[]) {
        this.calendarIds = calendars.map(c => c.id);
        this.calendarColorMap.clear();
        for (const cal of calendars) {
            this.calendarColorMap.set(cal.id, cal.color);
        }
    }

    /**
     * Update the visible viewport range
     * Triggers loading of any unloaded chunks in the range
     */
    updateViewport(startTime: number, endTime: number) {
        // Store last viewport for debounced fetch
        this.lastViewport = { startTime, endTime };

        // Debounce to avoid excessive API calls during fast scrolling
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.fetchVisibleChunks();
        }, DEBOUNCE_MS);
    }

    /**
     * Fetch chunks for the current viewport
     */
    private async fetchVisibleChunks() {
        if (!this.lastViewport || this.calendarIds.length === 0) {
            return;
        }

        const { startTime, endTime } = this.lastViewport;
        const visibleRange = endTime - startTime;

        // Add prefetch buffer
        const bufferedStart = startTime - visibleRange * PREFETCH_BUFFER;
        const bufferedEnd = endTime + visibleRange * PREFETCH_BUFFER;

        // Find chunks that need to be loaded
        const chunks = this.getChunksForRange(bufferedStart, bufferedEnd);
        const chunksToLoad = chunks.filter(
            chunk => !this.loadedChunks.has(chunk.id) && !this.loadingChunks.has(chunk.id)
        );

        if (chunksToLoad.length === 0) {
            return;
        }

        // Load each chunk
        for (const chunk of chunksToLoad) {
            // Don't await - let them load in parallel without blocking
            this.loadChunk(chunk);
        }
    }

    /**
     * Load a single chunk of events
     */
    private async loadChunk(chunk: Chunk) {
        if (this.loadingChunks.has(chunk.id)) {
            return; // Already loading
        }

        this.loadingChunks.add(chunk.id);
        const region: LoadingRegion = {
            startTime: chunk.startTime,
            endTime: chunk.endTime,
        };
        eventLoadingStore.startLoading(region);

        try {
            const result = await googleProvider.fetchEvents({
                startTime: chunk.startTime,
                endTime: chunk.endTime,
                calendarIds: this.calendarIds,
            });

            if (result.error) {
                console.error(`Failed to load chunk ${chunk.id}:`, result.error);
                eventLoadingStore.setError(result.error);
            } else if (result.data.length > 0) {
                // Apply calendar colors to events
                const coloredEvents = result.data.map(event => ({
                    ...event,
                    color: this.calendarColorMap.get(event.category || '') || event.color || '#4285f4',
                }));

                // Add events in batches to avoid blocking render thread
                await this.addEventsBatched(coloredEvents);
            }

            this.loadedChunks.add(chunk.id);
        } catch (err) {
            console.error(`Error loading chunk ${chunk.id}:`, err);
            eventLoadingStore.setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            this.loadingChunks.delete(chunk.id);
            eventLoadingStore.finishLoading(region);
        }
    }

    /**
     * Add events to store in batches, yielding to render thread between batches
     */
    private async addEventsBatched(events: CalendarEvent[]): Promise<void> {
        for (let i = 0; i < events.length; i += BATCH_SIZE) {
            const batch = events.slice(i, i + BATCH_SIZE);
            eventStore.addEvents(batch);

            // Yield to render thread if more batches remaining
            if (i + BATCH_SIZE < events.length) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    }

    /**
     * Get chunk boundaries for a time range
     */
    private getChunksForRange(startTime: number, endTime: number): Chunk[] {
        const chunks: Chunk[] = [];

        // Align to chunk boundaries
        const firstChunkStart = Math.floor(startTime / CHUNK_SIZE_MS) * CHUNK_SIZE_MS;
        const lastChunkStart = Math.floor(endTime / CHUNK_SIZE_MS) * CHUNK_SIZE_MS;

        for (let chunkStart = firstChunkStart; chunkStart <= lastChunkStart; chunkStart += CHUNK_SIZE_MS) {
            const chunkEnd = chunkStart + CHUNK_SIZE_MS;
            chunks.push({
                id: `chunk-${chunkStart}`,
                startTime: chunkStart,
                endTime: chunkEnd,
            });
        }

        return chunks;
    }

    /**
     * Check if a time range has been fully loaded
     */
    isLoaded(startTime: number, endTime: number): boolean {
        const chunks = this.getChunksForRange(startTime, endTime);
        return chunks.every(chunk => this.loadedChunks.has(chunk.id));
    }

    /**
     * Clear all loaded chunks (e.g., when calendars change)
     */
    clearCache() {
        this.loadedChunks.clear();
        this.loadingChunks.clear();
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        eventLoadingStore.reset();
    }

    /**
     * Get stats for debugging
     */
    getStats(): { loadedChunks: number; loadingChunks: number } {
        return {
            loadedChunks: this.loadedChunks.size,
            loadingChunks: this.loadingChunks.size,
        };
    }
}

/** Singleton instance */
export const eventLoader = new EventLoader();
