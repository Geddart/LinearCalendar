/**
 * EventStore - Efficient storage and querying of calendar events
 * 
 * Uses an interval tree for O(log n + k) range queries where k is results.
 * Supports:
 * - Fast range queries for visible events
 * - Importance-based filtering
 * - Deduplication by event ID
 */

import type { CalendarEvent } from '$lib/types/Event';

/**
 * Interval tree node for efficient range queries
 */
interface IntervalNode {
    /** Center point for this node */
    center: number;
    /** Events that overlap the center point */
    overlapping: CalendarEvent[];
    /** Left subtree (events entirely before center) */
    left: IntervalNode | null;
    /** Right subtree (events entirely after center) */
    right: IntervalNode | null;
}

/**
 * EventStore - Manages events with efficient range queries
 */
export class EventStore {
    private root: IntervalNode | null = null;
    private eventsById: Map<string, CalendarEvent> = new Map();
    private allEvents: CalendarEvent[] = [];

    /**
     * Add events to the store (deduplicates by ID)
     */
    addEvents(events: CalendarEvent[]): void {
        let needsRebuild = false;

        for (const event of events) {
            if (!this.eventsById.has(event.id)) {
                this.eventsById.set(event.id, event);
                this.allEvents.push(event);
                needsRebuild = true;
            }
        }

        if (needsRebuild) {
            this.buildTree();
        }
    }

    /**
     * Clear all events from the store
     */
    clear(): void {
        this.root = null;
        this.eventsById.clear();
        this.allEvents = [];
    }

    /**
     * Get total number of events
     */
    get size(): number {
        return this.allEvents.length;
    }

    /**
     * Query events that overlap a time range
     * O(log n + k) where k is the number of results
     */
    queryRange(startTime: number, endTime: number): CalendarEvent[] {
        if (!this.root) return [];

        const results: CalendarEvent[] = [];
        this.queryNode(this.root, startTime, endTime, results);
        return results;
    }

    /**
     * Query events that overlap a time range and meet importance threshold
     * O(log n + k) where k is the number of results
     */
    queryRangeWithImportance(
        startTime: number,
        endTime: number,
        minImportance: number
    ): CalendarEvent[] {
        if (!this.root) return [];

        const results: CalendarEvent[] = [];
        this.queryNodeWithImportance(this.root, startTime, endTime, minImportance, results);
        return results;
    }

    /**
     * Get an event by ID
     */
    getById(id: string): CalendarEvent | undefined {
        return this.eventsById.get(id);
    }

    /**
     * Build the interval tree from all events
     */
    private buildTree(): void {
        if (this.allEvents.length === 0) {
            this.root = null;
            return;
        }

        this.root = this.buildNode(this.allEvents);
    }

    /**
     * Recursively build a node of the interval tree
     */
    private buildNode(events: CalendarEvent[]): IntervalNode | null {
        if (events.length === 0) return null;

        // Find the median endpoint as the center
        const endpoints: number[] = [];
        for (const event of events) {
            endpoints.push(event.startTime, event.endTime);
        }
        endpoints.sort((a, b) => a - b);
        const center = endpoints[Math.floor(endpoints.length / 2)];

        // Partition events
        const overlapping: CalendarEvent[] = [];
        const left: CalendarEvent[] = [];
        const right: CalendarEvent[] = [];

        for (const event of events) {
            if (event.endTime < center) {
                left.push(event);
            } else if (event.startTime > center) {
                right.push(event);
            } else {
                overlapping.push(event);
            }
        }

        // Sort overlapping by start time for faster iteration
        overlapping.sort((a, b) => a.startTime - b.startTime);

        return {
            center,
            overlapping,
            left: this.buildNode(left),
            right: this.buildNode(right),
        };
    }

    /**
     * Query a node and its children for overlapping events
     */
    private queryNode(
        node: IntervalNode,
        startTime: number,
        endTime: number,
        results: CalendarEvent[]
    ): void {
        // Check overlapping events at this node
        for (const event of node.overlapping) {
            if (event.endTime > startTime && event.startTime < endTime) {
                results.push(event);
            }
        }

        // Recurse left if query range extends left of center
        if (node.left && startTime < node.center) {
            this.queryNode(node.left, startTime, endTime, results);
        }

        // Recurse right if query range extends right of center
        if (node.right && endTime > node.center) {
            this.queryNode(node.right, startTime, endTime, results);
        }
    }

    /**
     * Query a node with importance filtering
     */
    private queryNodeWithImportance(
        node: IntervalNode,
        startTime: number,
        endTime: number,
        minImportance: number,
        results: CalendarEvent[]
    ): void {
        // Check overlapping events at this node
        for (const event of node.overlapping) {
            if (
                event.endTime > startTime &&
                event.startTime < endTime &&
                event.importance.effective >= minImportance
            ) {
                results.push(event);
            }
        }

        // Recurse left if query range extends left of center
        if (node.left && startTime < node.center) {
            this.queryNodeWithImportance(node.left, startTime, endTime, minImportance, results);
        }

        // Recurse right if query range extends right of center
        if (node.right && endTime > node.center) {
            this.queryNodeWithImportance(node.right, startTime, endTime, minImportance, results);
        }
    }
}

/**
 * Create a singleton event store instance
 */
export const eventStore = new EventStore();
