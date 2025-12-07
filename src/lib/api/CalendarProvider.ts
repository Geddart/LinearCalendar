/**
 * CalendarProvider Interface
 * 
 * Abstracts calendar data sources (Mock, Google, Apple) with a unified API.
 * Design principles:
 * - Read-only by default (no accidental deletions/modifications)
 * - Explicit write operations require separate permissions
 * - Provider isolation (data from different sources stays separate)
 */

import type { CalendarEvent } from '$lib/types/Event';

/**
 * Authentication state for a calendar provider
 */
export interface AuthState {
    isAuthenticated: boolean;
    userId?: string;
    email?: string;
    expiresAt?: number;
    scopes: string[];
}

/**
 * Calendar metadata (e.g., "Work", "Personal", etc.)
 */
export interface CalendarInfo {
    id: string;
    name: string;
    color: string;
    isReadOnly: boolean;
    isPrimary: boolean;
    providerType: ProviderType;
}

/**
 * Supported calendar provider types
 */
export type ProviderType = 'mock' | 'google' | 'apple' | 'caldav';

/**
 * Options for fetching events
 */
export interface FetchEventsOptions {
    /** Start of time range (ms since epoch) */
    startTime: number;
    /** End of time range (ms since epoch) */
    endTime: number;
    /** Optional calendar IDs to filter by */
    calendarIds?: string[];
    /** Maximum number of events to return */
    limit?: number;
    /** Whether to include recurring event instances */
    expandRecurring?: boolean;
}

/**
 * Result of a fetch operation
 */
export interface FetchResult<T> {
    data: T;
    /** Sync token for incremental updates (provider-specific) */
    syncToken?: string;
    /** Whether more results are available */
    hasMore: boolean;
    /** Error message if failed */
    error?: string;
}

/**
 * Write operation for creating/updating events
 * Separated from read operations for security
 */
export interface WriteOperation {
    type: 'create' | 'update' | 'delete';
    event: Partial<CalendarEvent>;
    calendarId: string;
}

/**
 * CalendarProvider Interface
 * 
 * All calendar integrations must implement this interface.
 * The interface is designed to be read-heavy (most operations are reads).
 */
export interface CalendarProvider {
    /** Provider type identifier */
    readonly type: ProviderType;

    /** Human-readable provider name */
    readonly name: string;

    /** Whether this provider supports write operations */
    readonly supportsWrite: boolean;

    // =========================================
    // Authentication
    // =========================================

    /**
     * Get current authentication state
     */
    getAuthState(): AuthState;

    /**
     * Initiate authentication flow
     * @returns Promise that resolves when auth is complete
     */
    authenticate(): Promise<AuthState>;

    /**
     * Sign out and clear credentials
     */
    signOut(): Promise<void>;

    // =========================================
    // Read Operations (Primary)
    // =========================================

    /**
     * Get list of available calendars
     */
    getCalendars(): Promise<FetchResult<CalendarInfo[]>>;

    /**
     * Fetch events within a time range
     * This is the primary read operation used by the UI
     */
    fetchEvents(options: FetchEventsOptions): Promise<FetchResult<CalendarEvent[]>>;

    /**
     * Fetch a single event by ID
     */
    getEvent(eventId: string): Promise<CalendarEvent | null>;

    /**
     * Fetch incremental changes since last sync
     * @param syncToken Token from previous fetch
     */
    fetchChanges?(syncToken: string): Promise<FetchResult<CalendarEvent[]>>;

    // =========================================
    // Write Operations (Optional, Restricted)
    // =========================================

    /**
     * Execute a write operation (create/update/delete)
     * Only available if supportsWrite is true
     * @throws Error if provider doesn't support writes
     */
    executeWrite?(operation: WriteOperation): Promise<FetchResult<CalendarEvent>>;
}

/**
 * Read-only wrapper that strips write capabilities from any provider
 * Use this to ensure a provider can only read data
 */
export class ReadOnlyProvider implements CalendarProvider {
    private provider: CalendarProvider;

    readonly type: ProviderType;
    readonly name: string;
    readonly supportsWrite = false;

    constructor(provider: CalendarProvider) {
        this.provider = provider;
        this.type = provider.type;
        this.name = `${provider.name} (Read-Only)`;
    }

    getAuthState(): AuthState {
        return this.provider.getAuthState();
    }

    authenticate(): Promise<AuthState> {
        return this.provider.authenticate();
    }

    signOut(): Promise<void> {
        return this.provider.signOut();
    }

    getCalendars(): Promise<FetchResult<CalendarInfo[]>> {
        return this.provider.getCalendars();
    }

    fetchEvents(options: FetchEventsOptions): Promise<FetchResult<CalendarEvent[]>> {
        return this.provider.fetchEvents(options);
    }

    getEvent(eventId: string): Promise<CalendarEvent | null> {
        return this.provider.getEvent(eventId);
    }

    fetchChanges(syncToken: string): Promise<FetchResult<CalendarEvent[]>> | undefined {
        return this.provider.fetchChanges?.(syncToken);
    }

    // Write operations are explicitly not implemented
    executeWrite(): never {
        throw new Error('Write operations are disabled for read-only providers');
    }
}

/**
 * Provider registry for managing multiple calendar sources
 */
export class ProviderRegistry {
    private providers: Map<string, CalendarProvider> = new Map();

    /**
     * Register a calendar provider
     * @param id Unique identifier for this provider instance
     * @param provider The provider implementation
     * @param forceReadOnly If true, wrap in ReadOnlyProvider
     */
    register(id: string, provider: CalendarProvider, forceReadOnly = false): void {
        const wrappedProvider = forceReadOnly ? new ReadOnlyProvider(provider) : provider;
        this.providers.set(id, wrappedProvider);
    }

    /**
     * Get a provider by ID
     */
    get(id: string): CalendarProvider | undefined {
        return this.providers.get(id);
    }

    /**
     * Get all registered providers
     */
    getAll(): CalendarProvider[] {
        return Array.from(this.providers.values());
    }

    /**
     * Remove a provider
     */
    unregister(id: string): void {
        this.providers.delete(id);
    }

    /**
     * Fetch events from all providers
     */
    async fetchAllEvents(options: FetchEventsOptions): Promise<CalendarEvent[]> {
        const results = await Promise.all(
            this.getAll().map(p => p.fetchEvents(options).catch(err => {
                console.error(`Error fetching from ${p.name}:`, err);
                return { data: [], hasMore: false, error: err.message } as FetchResult<CalendarEvent[]>;
            }))
        );

        return results.flatMap(r => r.data);
    }
}

/**
 * Global provider registry singleton
 */
export const providerRegistry = new ProviderRegistry();
