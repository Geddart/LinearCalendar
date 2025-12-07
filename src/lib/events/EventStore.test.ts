/**
 * EventStore Unit Tests
 * 
 * Tests the interval tree implementation for event range queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventStore } from './EventStore';
import type { CalendarEvent } from '$lib/types/Event';

// Helper to create a test event
function createEvent(id: string, startTime: number, endTime: number, importance: number = 0.5): CalendarEvent {
    return {
        id,
        startTime,
        endTime,
        title: `Event ${id}`,
        color: '#ff0000',
        importance: {
            duration: 1,
            aiScore: importance,
            manual: importance,
            effective: importance,
        },
        isLifeEvent: false,
    };
}

describe('EventStore', () => {
    let store: EventStore;

    beforeEach(() => {
        store = new EventStore();
    });

    describe('addEvents', () => {
        it('should add events to the store', () => {
            store.addEvents([
                createEvent('1', 0, 100),
                createEvent('2', 50, 150),
            ]);

            expect(store.size).toBe(2);
        });

        it('should deduplicate events by ID', () => {
            store.addEvents([
                createEvent('1', 0, 100),
                createEvent('1', 0, 100), // Duplicate
            ]);

            expect(store.size).toBe(1);
        });

        it('should handle empty array', () => {
            store.addEvents([]);
            expect(store.size).toBe(0);
        });
    });

    describe('queryRange', () => {
        beforeEach(() => {
            // Add events spanning different ranges
            store.addEvents([
                createEvent('a', 0, 100),      // 0-100
                createEvent('b', 50, 150),     // 50-150
                createEvent('c', 200, 300),    // 200-300
                createEvent('d', 250, 350),    // 250-350
                createEvent('e', 500, 600),    // 500-600
            ]);
        });

        it('should find events overlapping the query range', () => {
            const results = store.queryRange(75, 125);
            const ids = results.map(e => e.id).sort();

            expect(ids).toContain('a');
            expect(ids).toContain('b');
            expect(ids).not.toContain('c');
        });

        it('should find events when query fully contains them', () => {
            const results = store.queryRange(0, 1000);
            expect(results.length).toBe(5);
        });

        it('should find events when query is inside event', () => {
            const results = store.queryRange(25, 75);
            expect(results.some(e => e.id === 'a')).toBe(true);
        });

        it('should return empty for non-overlapping range', () => {
            const results = store.queryRange(400, 450);
            expect(results.length).toBe(0);
        });

        it('should handle edge case at event boundaries', () => {
            // Query starts exactly where event ends - should not overlap
            const results = store.queryRange(100, 150);
            // Event 'a' ends at 100, so it should NOT be included (endTime > startTime)
            expect(results.some(e => e.id === 'a')).toBe(false);
            expect(results.some(e => e.id === 'b')).toBe(true);
        });
    });

    describe('queryRangeWithImportance', () => {
        beforeEach(() => {
            store.addEvents([
                createEvent('low', 0, 100, 0.2),
                createEvent('med', 0, 100, 0.5),
                createEvent('high', 0, 100, 0.9),
            ]);
        });

        it('should filter by importance threshold', () => {
            const results = store.queryRangeWithImportance(0, 100, 0.5);
            const ids = results.map(e => e.id).sort();

            expect(ids).toContain('med');
            expect(ids).toContain('high');
            expect(ids).not.toContain('low');
        });

        it('should return all events when threshold is 0', () => {
            const results = store.queryRangeWithImportance(0, 100, 0);
            expect(results.length).toBe(3);
        });

        it('should return no events when threshold is too high', () => {
            const results = store.queryRangeWithImportance(0, 100, 1.0);
            expect(results.length).toBe(0);
        });
    });

    describe('getById', () => {
        it('should return event by ID', () => {
            store.addEvents([createEvent('test', 0, 100)]);

            const event = store.getById('test');
            expect(event).toBeDefined();
            expect(event?.id).toBe('test');
        });

        it('should return undefined for unknown ID', () => {
            expect(store.getById('unknown')).toBeUndefined();
        });
    });

    describe('clear', () => {
        it('should remove all events', () => {
            store.addEvents([createEvent('1', 0, 100)]);
            store.clear();

            expect(store.size).toBe(0);
            expect(store.queryRange(0, 100).length).toBe(0);
        });
    });

    describe('performance', () => {
        it('should handle many events efficiently', () => {
            const manyEvents: CalendarEvent[] = [];
            for (let i = 0; i < 1000; i++) {
                manyEvents.push(createEvent(`event-${i}`, i * 100, i * 100 + 50));
            }

            const addStart = performance.now();
            store.addEvents(manyEvents);
            const addTime = performance.now() - addStart;

            expect(store.size).toBe(1000);
            expect(addTime).toBeLessThan(100); // Should complete in under 100ms

            // Query should be fast
            const queryStart = performance.now();
            const results = store.queryRange(5000, 6000);
            const queryTime = performance.now() - queryStart;

            expect(results.length).toBeGreaterThan(0);
            expect(queryTime).toBeLessThan(10); // Should complete in under 10ms
        });
    });
});
