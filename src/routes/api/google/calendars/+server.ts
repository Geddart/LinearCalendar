/**
 * Google Calendar API Proxy - Calendars
 * 
 * Proxies requests to Google Calendar API using tokens from cookies.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export const GET: RequestHandler = async ({ cookies }) => {
    const accessToken = cookies.get('google_access_token');

    if (!accessToken) {
        return json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const response = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Calendar API error:', error);
            return json({ error: 'Failed to fetch calendars' }, { status: response.status });
        }

        const data = await response.json();
        return json(data);
    } catch (err) {
        console.error('Calendar proxy error:', err);
        return json({ error: 'Internal error' }, { status: 500 });
    }
};
