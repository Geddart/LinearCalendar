<script lang="ts">
    import type { CalendarEvent } from "$lib/types/Event";
    import {
        selectedEvent,
        clearSelection,
    } from "$lib/events/EventInteraction";

    // Format time for display
    function formatTime(ms: number): string {
        return new Date(ms).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
    }

    function formatDate(ms: number): string {
        return new Date(ms).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
        });
    }

    function formatDuration(startMs: number, endMs: number): string {
        const durationMs = endMs - startMs;
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor(
            (durationMs % (1000 * 60 * 60)) / (1000 * 60),
        );

        if (hours === 0) return `${minutes}m`;
        if (minutes === 0) return `${hours}h`;
        return `${hours}h ${minutes}m`;
    }

    function handleClose() {
        clearSelection();
    }

    function handleBackdropClick(e: MouseEvent) {
        if ((e.target as HTMLElement).classList.contains("panel-backdrop")) {
            handleClose();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            handleClose();
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $selectedEvent}
    <div
        class="panel-backdrop"
        on:click={handleBackdropClick}
        role="dialog"
        aria-modal="true"
    >
        <div class="event-detail-panel">
            <button
                class="close-button"
                on:click={handleClose}
                aria-label="Close"
            >
                ✕
            </button>

            <div class="panel-content">
                <!-- Title -->
                <h2 class="event-title">{$selectedEvent.title}</h2>

                <!-- Time -->
                <div class="event-time">
                    <span class="time-icon">🕐</span>
                    <div class="time-details">
                        <div class="time-date">
                            {formatDate($selectedEvent.startTime)}
                        </div>
                        <div class="time-range">
                            {formatTime($selectedEvent.startTime)} – {formatTime(
                                $selectedEvent.endTime,
                            )}
                            <span class="duration"
                                >({formatDuration(
                                    $selectedEvent.startTime,
                                    $selectedEvent.endTime,
                                )})</span
                            >
                        </div>
                    </div>
                </div>

                <!-- Location -->
                {#if $selectedEvent.location?.name || $selectedEvent.location?.address}
                    <div class="event-location">
                        <span class="location-icon">📍</span>
                        <div class="location-details">
                            {#if $selectedEvent.location.name}
                                <div class="location-name">
                                    {$selectedEvent.location.name}
                                </div>
                            {/if}
                            {#if $selectedEvent.location.address}
                                <div class="location-address">
                                    {$selectedEvent.location.address}
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}

                <!-- Conference Link -->
                {#if $selectedEvent.conferenceUrl}
                    <div class="event-conference">
                        <span class="conference-icon">📹</span>
                        <a
                            href={$selectedEvent.conferenceUrl}
                            target="_blank"
                            rel="noopener"
                            class="conference-link"
                        >
                            Join Video Call
                        </a>
                    </div>
                {/if}

                <!-- Attendees -->
                {#if $selectedEvent.attendees && $selectedEvent.attendees.length > 0}
                    <div class="event-attendees">
                        <span class="attendees-icon">👥</span>
                        <div class="attendees-list">
                            {#each $selectedEvent.attendees as attendee}
                                <div
                                    class="attendee"
                                    class:organizer={attendee.isOrganizer}
                                >
                                    <span class="attendee-name"
                                        >{attendee.name}</span
                                    >
                                    {#if attendee.status}
                                        <span
                                            class="attendee-status status-{attendee.status}"
                                        >
                                            {attendee.status === "accepted"
                                                ? "✓"
                                                : attendee.status === "declined"
                                                  ? "✗"
                                                  : attendee.status ===
                                                      "tentative"
                                                    ? "?"
                                                    : "•"}
                                        </span>
                                    {/if}
                                    {#if attendee.isOrganizer}
                                        <span class="organizer-badge"
                                            >Organizer</span
                                        >
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- Description -->
                {#if $selectedEvent.description}
                    <div class="event-description">
                        <p>{$selectedEvent.description}</p>
                    </div>
                {/if}

                <!-- Source badge -->
                <div class="event-source">
                    <span class="source-badge source-{$selectedEvent.source}">
                        {$selectedEvent.source}
                    </span>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .panel-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.3);
        display: flex;
        justify-content: flex-end;
        z-index: 1000;
        animation: fadeIn 0.15s ease-out;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    .event-detail-panel {
        width: 380px;
        max-width: 90vw;
        height: 100%;
        background: white;
        box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
        overflow-y: auto;
        animation: slideIn 0.2s ease-out;
        position: relative;
    }

    @keyframes slideIn {
        from {
            transform: translateX(100%);
        }
        to {
            transform: translateX(0);
        }
    }

    .close-button {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 32px;
        height: 32px;
        border: none;
        background: #f0f0f0;
        border-radius: 50%;
        cursor: pointer;
        font-size: 14px;
        color: #666;
        display: flex;
        align-items: center;
        justify-content: center;
        transition:
            background 0.15s,
            color 0.15s;
    }

    .close-button:hover {
        background: #e0e0e0;
        color: #333;
    }

    .panel-content {
        padding: 24px;
    }

    .event-title {
        font-size: 24px;
        font-weight: 600;
        margin: 0 0 20px 0;
        padding-right: 40px;
        color: #1a1a1a;
        font-family:
            "Inter",
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
    }

    .event-time,
    .event-location,
    .event-conference,
    .event-attendees {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        align-items: flex-start;
    }

    .time-icon,
    .location-icon,
    .conference-icon,
    .attendees-icon {
        font-size: 18px;
        width: 24px;
        text-align: center;
        flex-shrink: 0;
        padding-top: 2px;
    }

    .time-date {
        font-weight: 500;
        color: #333;
    }

    .time-range {
        color: #666;
        font-size: 14px;
    }

    .duration {
        color: #999;
    }

    .location-name {
        font-weight: 500;
        color: #333;
    }

    .location-address {
        color: #666;
        font-size: 14px;
    }

    .conference-link {
        color: #1a73e8;
        text-decoration: none;
        font-weight: 500;
    }

    .conference-link:hover {
        text-decoration: underline;
    }

    .attendees-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .attendee {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
    }

    .attendee-name {
        color: #333;
    }

    .attendee-status {
        font-size: 12px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .status-accepted {
        background: #e6f4ea;
        color: #1e8e3e;
    }

    .status-declined {
        background: #fce8e6;
        color: #d93025;
    }

    .status-tentative {
        background: #fef7e0;
        color: #f9ab00;
    }

    .organizer-badge {
        font-size: 11px;
        background: #e8f0fe;
        color: #1a73e8;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .event-description {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid #eee;
    }

    .event-description p {
        margin: 0;
        color: #444;
        line-height: 1.6;
        white-space: pre-wrap;
    }

    .event-source {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid #eee;
    }

    .source-badge {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: 500;
    }

    .source-mock {
        background: #f0f0f0;
        color: #666;
    }
    .source-google {
        background: #e8f0fe;
        color: #1a73e8;
    }
    .source-apple {
        background: #f5f5f7;
        color: #1d1d1f;
    }
    .source-manual {
        background: #e6f4ea;
        color: #1e8e3e;
    }
</style>
