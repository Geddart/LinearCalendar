/**
 * GoogleCalendarProvider - Fetches calendar data from Google Calendar API
 * 
 * Implements the CalendarProvider interface.
 * Uses server-side proxy routes for token security.
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
import { authStore } from '$lib/stores/authStore';

/**
 * Google Calendar Provider
 * 
 * Note: All API calls go through server-side proxy routes
 * to keep access tokens secure (stored in HTTP-only cookies).
 */
export class GoogleCalendarProvider implements CalendarProvider {
    readonly type: ProviderType = 'google';
    readonly name = 'Google Calendar';
    readonly supportsWrite = false; // Read-only for safety

    // =========================================
    // Authentication
    // =========================================

    getAuthState(): AuthState {
        let state: AuthState = {
            isAuthenticated: false,
            scopes: ['calendar.readonly'],
        };

        authStore.subscribe(s => {
            state = {
                isAuthenticated: s.isConnected,
                email: s.email || undefined,
                expiresAt: s.expiresAt || undefined,
                scopes: ['calendar.readonly'],
            };
        })();

        return state;
    }

    async authenticate(): Promise<AuthState> {
        // Redirect to OAuth endpoint
        window.location.href = '/auth/google';

        // This won't actually return since we're redirecting
        return this.getAuthState();
    }

    async signOut(): Promise<void> {
        await fetch('/auth/logout', { method: 'POST' });
        authStore.disconnect();
    }

    // =========================================
    // Read Operations
    // =========================================

    async getCalendars(): Promise<FetchResult<CalendarInfo[]>> {
        try {
            const response = await fetch('/api/google/calendars');

            if (!response.ok) {
                return {
                    data: [],
                    hasMore: false,
                    error: `Failed to fetch calendars: ${response.status}`,
                };
            }

            const data = await response.json();

            // Map Google's calendar format to our CalendarInfo
            const calendars: CalendarInfo[] = data.items?.map((item: any) => ({
                id: item.id,
                name: item.summary,
                color: item.backgroundColor || '#4285f4',
                isReadOnly: item.accessRole === 'reader',
                isPrimary: item.primary || false,
                providerType: 'google' as const,
            })) || [];

            return {
                data: calendars,
                hasMore: false,
            };
        } catch (err) {
            return {
                data: [],
                hasMore: false,
                error: err instanceof Error ? err.message : 'Unknown error',
            };
        }
    }

    async fetchEvents(options: FetchEventsOptions): Promise<FetchResult<CalendarEvent[]>> {
        const { startTime, endTime, calendarIds } = options;

        try {
            // Get selected calendar IDs from auth store if not specified
            let calendarsToFetch = calendarIds;
            if (!calendarsToFetch || calendarsToFetch.length === 0) {
                authStore.subscribe(s => {
                    calendarsToFetch = s.selectedCalendarIds;
                })();
            }

            // Fetch events from all selected calendars
            const allEvents: CalendarEvent[] = [];

            for (const calId of calendarsToFetch || []) {
                let pageToken: string | undefined;

                do {
                    const params = new URLSearchParams({
                        calendarId: calId,
                        timeMin: new Date(startTime).toISOString(),
                        timeMax: new Date(endTime).toISOString(),
                        singleEvents: 'true',
                        maxResults: '2500',
                    });

                    if (pageToken) {
                        params.set('pageToken', pageToken);
                    }

                    const response = await fetch(`/api/google/events?${params}`);

                    if (!response.ok) {
                        pageToken = undefined;
                        break;
                    }

                    const data = await response.json();

                    // Map Google's event format to our CalendarEvent
                    const events = this.mapGoogleEvents(data.items || [], calId);
                    allEvents.push(...events);

                    // Continue if there are more pages
                    pageToken = data.nextPageToken;
                } while (pageToken);
            }

            return {
                data: allEvents,
                hasMore: false,
            };
        } catch (err) {
            return {
                data: [],
                hasMore: false,
                error: err instanceof Error ? err.message : 'Unknown error',
            };
        }
    }

    async getEvent(eventId: string): Promise<CalendarEvent | null> {
        // Would need calendar ID to fetch single event
        // For now, return null
        return null;
    }

    // =========================================
    // Helpers
    // =========================================

    private mapGoogleEvents(items: any[], calendarId: string): CalendarEvent[] {
        return items.map((item: any, index: number) => {
            // Parse start/end times (can be date or dateTime)
            const startTime = item.start?.dateTime
                ? new Date(item.start.dateTime).getTime()
                : new Date(item.start?.date || Date.now()).getTime();

            const endTime = item.end?.dateTime
                ? new Date(item.end.dateTime).getTime()
                : new Date(item.end?.date || Date.now()).getTime();

            // Calculate duration-based importance
            const durationMs = endTime - startTime;
            const durationHours = durationMs / (1000 * 60 * 60);
            const durationImportance = Math.min(durationHours / 8, 1); // Max at 8 hours

            return {
                id: `google-${item.id}`,
                title: item.summary || 'Untitled',
                description: item.description,
                startTime,
                endTime,
                color: item.colorId ? this.getEventColor(item.colorId) : '#4285f4',
                category: calendarId,
                importance: {
                    duration: durationImportance,
                    aiScore: 0.5,
                    manual: 0.5,
                    effective: durationImportance * 0.5 + 0.25,
                },
                isLifeEvent: durationHours >= 24, // All-day events
            };
        });
    }

    private getEventColor(colorId: string): string {
        // Google Calendar event color IDs
        const colors: Record<string, string> = {
            '1': '#a4bdfc', // Lavender
            '2': '#7ae7bf', // Sage
            '3': '#dbadff', // Grape
            '4': '#ff887c', // Flamingo
            '5': '#fbd75b', // Banana
            '6': '#ffb878', // Tangerine
            '7': '#46d6db', // Peacock
            '8': '#e1e1e1', // Graphite
            '9': '#5484ed', // Blueberry
            '10': '#51b749', // Basil
            '11': '#dc2127', // Tomato
        };
        return colors[colorId] || '#4285f4';
    }
}

/**
 * Singleton instance
 */
export const googleProvider = new GoogleCalendarProvider();
