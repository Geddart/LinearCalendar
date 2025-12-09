<!--
  LocationSettings - Modal for configuring user location
  
  Allows manual lat/lng entry or auto-detection via Geolocation API.
-->
<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import {
        locationStore,
        type LocationState,
    } from "$lib/stores/locationStore";

    export let visible = false;

    const dispatch = createEventDispatcher();

    let latitude = 0;
    let longitude = 0;
    let locationName = "";
    let isDetecting = false;
    let error = "";

    // Subscribe to location store
    $: if (visible) {
        latitude = $locationStore.latitude;
        longitude = $locationStore.longitude;
        locationName = $locationStore.locationName;
    }

    function close() {
        dispatch("close");
    }

    function handleSave() {
        // Validate coordinates
        if (latitude < -90 || latitude > 90) {
            error = "Latitude must be between -90 and 90";
            return;
        }
        if (longitude < -180 || longitude > 180) {
            error = "Longitude must be between -180 and 180";
            return;
        }

        error = "";
        locationStore.setManual(latitude, longitude, locationName);
        dispatch("save");
        close();
    }

    async function handleAutoDetect() {
        isDetecting = true;
        error = "";

        try {
            await locationStore.autoDetect();
            latitude = $locationStore.latitude;
            longitude = $locationStore.longitude;
            locationName = $locationStore.locationName;
        } catch (e) {
            if (e instanceof GeolocationPositionError) {
                switch (e.code) {
                    case e.PERMISSION_DENIED:
                        error = "Location permission denied";
                        break;
                    case e.POSITION_UNAVAILABLE:
                        error = "Location unavailable";
                        break;
                    case e.TIMEOUT:
                        error = "Location request timed out";
                        break;
                }
            } else {
                error = "Failed to detect location";
            }
        }

        isDetecting = false;
    }

    function handleReset() {
        locationStore.reset();
        latitude = $locationStore.latitude;
        longitude = $locationStore.longitude;
        locationName = $locationStore.locationName;
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            close();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            close();
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if visible}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-backdrop" on:click={handleBackdropClick}>
        <div class="modal">
            <div class="modal-header">
                <h2>📍 Location Settings</h2>
                <button class="close-button" on:click={close}>×</button>
            </div>

            <div class="modal-body">
                <p class="description">
                    Set your location to show accurate sunrise/sunset times in
                    the day/night visualization.
                </p>

                <div class="current-location">
                    <span class="label">Current:</span>
                    <span class="value">{$locationStore.locationName}</span>
                    <span class="source">({$locationStore.source})</span>
                </div>

                <div class="form-group">
                    <label for="location-name">Location Name</label>
                    <input
                        id="location-name"
                        type="text"
                        bind:value={locationName}
                        placeholder="e.g., Amsterdam, Netherlands"
                    />
                </div>

                <div class="coordinates-row">
                    <div class="form-group">
                        <label for="latitude">Latitude</label>
                        <input
                            id="latitude"
                            type="number"
                            step="0.0001"
                            min="-90"
                            max="90"
                            bind:value={latitude}
                            placeholder="52.3676"
                        />
                    </div>

                    <div class="form-group">
                        <label for="longitude">Longitude</label>
                        <input
                            id="longitude"
                            type="number"
                            step="0.0001"
                            min="-180"
                            max="180"
                            bind:value={longitude}
                            placeholder="4.9041"
                        />
                    </div>
                </div>

                {#if error}
                    <div class="error">{error}</div>
                {/if}

                <div class="auto-detect">
                    <button
                        class="detect-button"
                        on:click={handleAutoDetect}
                        disabled={isDetecting}
                    >
                        {#if isDetecting}
                            Detecting...
                        {:else}
                            🎯 Use My Location
                        {/if}
                    </button>
                </div>
            </div>

            <div class="modal-footer">
                <button class="reset-button" on:click={handleReset}>
                    Reset to Default
                </button>
                <div class="footer-actions">
                    <button class="cancel-button" on:click={close}
                        >Cancel</button
                    >
                    <button class="save-button" on:click={handleSave}
                        >Save</button
                    >
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        backdrop-filter: blur(2px);
    }

    .modal {
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        width: 90%;
        max-width: 420px;
        max-height: 90vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #eee;
    }

    .modal-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #333;
    }

    .close-button {
        background: none;
        border: none;
        font-size: 24px;
        color: #666;
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }

    .close-button:hover {
        color: #333;
    }

    .modal-body {
        padding: 20px;
        overflow-y: auto;
    }

    .description {
        color: #666;
        font-size: 14px;
        margin: 0 0 16px 0;
    }

    .current-location {
        background: #f5f5f5;
        padding: 10px 12px;
        border-radius: 6px;
        margin-bottom: 16px;
        font-size: 13px;
    }

    .current-location .label {
        color: #666;
    }

    .current-location .value {
        color: #333;
        font-weight: 500;
        margin-left: 4px;
    }

    .current-location .source {
        color: #999;
        font-size: 12px;
        margin-left: 4px;
    }

    .form-group {
        margin-bottom: 14px;
    }

    .form-group label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: #555;
        margin-bottom: 4px;
    }

    .form-group input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        box-sizing: border-box;
    }

    .form-group input:focus {
        outline: none;
        border-color: #4285f4;
        box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
    }

    .coordinates-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }

    .error {
        color: #e53935;
        font-size: 13px;
        margin-bottom: 12px;
        padding: 8px;
        background: rgba(229, 57, 53, 0.1);
        border-radius: 4px;
    }

    .auto-detect {
        margin-top: 8px;
    }

    .detect-button {
        width: 100%;
        padding: 10px 16px;
        background: #4285f4;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
    }

    .detect-button:hover:not(:disabled) {
        background: #3367d6;
    }

    .detect-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .modal-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-top: 1px solid #eee;
        background: #fafafa;
    }

    .reset-button {
        background: none;
        border: none;
        color: #999;
        font-size: 13px;
        cursor: pointer;
        padding: 0;
    }

    .reset-button:hover {
        color: #666;
    }

    .footer-actions {
        display: flex;
        gap: 8px;
    }

    .cancel-button {
        padding: 8px 16px;
        background: #f0f0f0;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
    }

    .cancel-button:hover {
        background: #e0e0e0;
    }

    .save-button {
        padding: 8px 20px;
        background: #34a853;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
    }

    .save-button:hover {
        background: #2d9248;
    }
</style>
