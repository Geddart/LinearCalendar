/**
 * Logout Endpoint
 * 
 * Clears auth cookies and optionally revokes the token with Google.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const POST: RequestHandler = async ({ cookies }) => {
    const accessToken = cookies.get('google_access_token');

    // Clear all auth cookies
    cookies.delete('google_access_token', { path: '/' });
    cookies.delete('google_refresh_token', { path: '/' });

    // Optionally revoke the token with Google
    if (accessToken) {
        try {
            await fetch(`${GOOGLE_REVOKE_URL}?token=${accessToken}`, {
                method: 'POST',
            });
        } catch (err) {
            // Revocation failure is not critical
            console.warn('Token revocation failed:', err);
        }
    }

    return json({ success: true });
};
