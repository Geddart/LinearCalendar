/**
 * Google OAuth Callback Endpoint
 * 
 * Receives authorization code from Google, exchanges for tokens,
 * and stores them securely.
 */

import { redirect, isRedirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export const GET: RequestHandler = async ({ url, cookies }) => {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
        console.error('OAuth error:', error);
        redirect(302, '/?auth_error=' + encodeURIComponent(error));
    }

    if (!code) {
        redirect(302, '/?auth_error=no_code');
    }

    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    const redirectUri = env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        console.error('Missing Google OAuth credentials in environment');
        redirect(302, '/?auth_error=missing_credentials');
    }

    try {
        // Exchange code for tokens
        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            console.error('Token exchange failed:', errorData);
            redirect(302, '/?auth_error=token_exchange_failed');
        }

        const tokens = await tokenResponse.json();

        // Get user info (email)
        const userResponse = await fetch(GOOGLE_USERINFO_URL, {
            headers: {
                Authorization: `Bearer ${tokens.access_token}`,
            },
        });

        if (!userResponse.ok) {
            redirect(302, '/?auth_error=userinfo_failed');
        }

        const userInfo = await userResponse.json();

        // Calculate expiry time
        const expiresAt = Date.now() + (tokens.expires_in * 1000);

        // Store tokens in HTTP-only cookie (secure)
        cookies.set('google_access_token', tokens.access_token, {
            path: '/',
            httpOnly: true,
            secure: !dev,
            sameSite: 'lax',
            maxAge: tokens.expires_in,
        });

        if (tokens.refresh_token) {
            cookies.set('google_refresh_token', tokens.refresh_token, {
                path: '/',
                httpOnly: true,
                secure: !dev,
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 30, // 30 days
            });
        }

        // Redirect back to app with success params (for client-side state update)
        const successParams = new URLSearchParams({
            auth_success: 'true',
            email: userInfo.email,
            expires_at: expiresAt.toString(),
        });

        redirect(302, '/?' + successParams.toString());
    } catch (err) {
        // Re-throw SvelteKit redirects
        if (isRedirect(err)) throw err;
        console.error('OAuth callback error:', err);
        redirect(302, '/?auth_error=unknown');
    }
};
