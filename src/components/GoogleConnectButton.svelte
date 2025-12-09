<script lang="ts">
    import { authStore, clearAuthState } from "$lib/stores/authStore";

    // Props
    export let showSettingsIcon = true;

    // Event dispatchers
    import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher<{
        settingsClick: void;
    }>();

    // Reactive auth state using Svelte's $ syntax
    $: isConnected = $authStore.isConnected;
    $: email = $authStore.email;

    /**
     * Initiate Google OAuth flow
     */
    function handleConnect() {
        // Redirect to OAuth endpoint
        window.location.href = "/auth/google";
    }

    /**
     * Disconnect from Google
     */
    function handleDisconnect() {
        authStore.disconnect();
        clearAuthState();
        // Optionally call logout endpoint to revoke token
        fetch("/auth/logout", { method: "POST" }).catch(() => {});
    }

    /**
     * Open settings/calendar selector
     */
    function handleSettings() {
        dispatch("settingsClick");
    }
</script>

<div class="google-connect">
    {#if isConnected}
        <div class="connected-state">
            <span class="email" title={email}>{email}</span>
            <div class="actions">
                {#if showSettingsIcon}
                    <button
                        class="icon-btn settings"
                        on:click={handleSettings}
                        title="Calendar Settings"
                    >
                        ⚙️
                    </button>
                {/if}
                <button
                    class="icon-btn logout"
                    on:click={handleDisconnect}
                    title="Disconnect Google"
                >
                    ✕
                </button>
            </div>
        </div>
    {:else}
        <button class="connect-btn" on:click={handleConnect}>
            <svg class="google-icon" viewBox="0 0 24 24" width="16" height="16">
                <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
            </svg>
            Connect Google
        </button>
    {/if}
</div>

<style>
    .google-connect {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(0, 0, 0, 0.08);
    }

    .connect-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 12px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        color: #333;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .connect-btn:hover {
        background: #f8f8f8;
        border-color: #ccc;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .google-icon {
        flex-shrink: 0;
    }

    .connected-state {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .email {
        font-size: 12px;
        color: #666;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
    }

    .actions {
        display: flex;
        gap: 4px;
    }

    .icon-btn {
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        border-radius: 4px;
        font-size: 14px;
        line-height: 1;
        opacity: 0.6;
        transition:
            opacity 0.2s,
            background 0.2s;
    }

    .icon-btn:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.05);
    }

    .icon-btn.logout:hover {
        background: rgba(255, 0, 0, 0.1);
    }
</style>
