/**
 * MockCalendarProvider - Development/demo calendar provider
 * 
 * Generates fake calendar data for testing and demonstration.
 * Implements the CalendarProvider interface.
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
import {
    generateMockEvents,
    generateLifeEvents,
    generateTodayEvents,
} from './MockDataProvider';

/**
 * Mock calendar provider for development and demos
 */
export class MockCalendarProvider implements CalendarProvider {
    readonly type: ProviderType = 'mock';
    readonly name = 'Demo Calendar';
    readonly supportsWrite = false; // Read-only for safety

    private events: CalendarEvent[] = [];
    private calendars: CalendarInfo[] = [];
    private isLoaded = false;

    constructor() {
        // Define mock calendars
        this.calendars = [
            { id: 'todo', name: 'Todo', color: '#f44336', isReadOnly: true, isPrimary: false, providerType: 'mock' },
            { id: 'health', name: 'Health', color: '#8bc34a', isReadOnly: true, isPrimary: false, providerType: 'mock' },
            { id: 'people', name: 'People', color: '#9c27b0', isReadOnly: true, isPrimary: false, providerType: 'mock' },
            { id: 'work', name: 'Work', color: '#2196f3', isReadOnly: true, isPrimary: true, providerType: 'mock' },
        ];
    }

    /**
     * Load mock events (lazy initialization)
     */
    private loadEvents(): void {
        if (this.isLoaded) return;

        this.events = [
            ...generateLifeEvents(),
            ...generateMockEvents(100),
            ...generateTodayEvents(),
        ];

        this.isLoaded = true;
    }

    // =========================================
    // Authentication (no-op for mock)
    // =========================================

    getAuthState(): AuthState {
        return {
            isAuthenticated: true,
            userId: 'mock-user',
            email: 'demo@example.com',
            scopes: ['read'],
        };
    }

    async authenticate(): Promise<AuthState> {
        // Mock auth always succeeds
        return this.getAuthState();
    }

    async signOut(): Promise<void> {
        // No-op for mock
    }

    // =========================================
    // Read Operations
    // =========================================

    async getCalendars(): Promise<FetchResult<CalendarInfo[]>> {
        return {
            data: this.calendars,
            hasMore: false,
        };
    }

    async fetchEvents(options: FetchEventsOptions): Promise<FetchResult<CalendarEvent[]>> {
        this.loadEvents();

        const { startTime, endTime, calendarIds, limit } = options;

        // Filter by time range
        let filtered = this.events.filter(
            e => e.endTime > startTime && e.startTime < endTime
        );

        // Filter by calendar IDs if specified
        if (calendarIds && calendarIds.length > 0) {
            filtered = filtered.filter(e =>
                e.category && calendarIds.includes(e.category)
            );
        }

        // Apply limit if specified
        if (limit && filtered.length > limit) {
            filtered = filtered.slice(0, limit);
        }

        return {
            data: filtered,
            hasMore: limit ? filtered.length >= limit : false,
        };
    }

    async getEvent(eventId: string): Promise<CalendarEvent | null> {
        this.loadEvents();
        return this.events.find(e => e.id === eventId) || null;
    }

    async fetchChanges(): Promise<FetchResult<CalendarEvent[]>> {
        // Mock provider doesn't support incremental sync
        return {
            data: [],
            hasMore: false,
        };
    }
}

/**
 * Create and export a singleton mock provider
 */
export const mockProvider = new MockCalendarProvider();
