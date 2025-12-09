/**
 * Google Calendar API Proxy - Events
 * 
 * Proxies requests to Google Calendar API using tokens from cookies.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export const GET: RequestHandler = async ({ url, cookies }) => {
    const accessToken = cookies.get('google_access_token');

    if (!accessToken) {
        return json({ error: 'Not authenticated' }, { status: 401 });
    }

    const calendarId = url.searchParams.get('calendarId');
    const timeMin = url.searchParams.get('timeMin');
    const timeMax = url.searchParams.get('timeMax');
    const singleEvents = url.searchParams.get('singleEvents') || 'true';
    const maxResults = url.searchParams.get('maxResults') || '2500';
    const pageToken = url.searchParams.get('pageToken');

    if (!calendarId) {
        return json({ error: 'calendarId required' }, { status: 400 });
    }

    try {
        const params = new URLSearchParams({
            singleEvents,
            maxResults,
            orderBy: 'startTime',
        });

        if (timeMin) params.set('timeMin', timeMin);
        if (timeMax) params.set('timeMax', timeMax);
        if (pageToken) params.set('pageToken', pageToken);

        const apiUrl = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;

        const response = await fetch(apiUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Events API error:', error);
            return json({ error: 'Failed to fetch events' }, { status: response.status });
        }

        const data = await response.json();
        return json(data);
    } catch (err) {
        console.error('Events proxy error:', err);
        return json({ error: 'Internal error' }, { status: 500 });
    }
};
