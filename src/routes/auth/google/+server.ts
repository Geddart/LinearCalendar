/**
 * Google OAuth Initiation Endpoint
 * 
 * Redirects user to Google's OAuth consent screen.
 */

import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// Read-only calendar scope (safe - can't modify user's data)
const SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
];

export const GET: RequestHandler = async () => {
    const clientId = env.GOOGLE_CLIENT_ID;
    const redirectUri = env.GOOGLE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
        throw redirect(302, '/?auth_error=missing_credentials');
    }

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
    });

    throw redirect(302, `${GOOGLE_AUTH_URL}?${params.toString()}`);
};
