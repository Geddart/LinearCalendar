<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { authStore, saveAuthState } from "$lib/stores/authStore";
    import { calendarStore } from "$lib/stores/calendarStore";
    import type { CalendarInfo } from "$lib/api/CalendarProvider";
    import { getHistoricalEventsCount } from "$lib/api/HistoricalEvents";

    // Props
    export let calendars: CalendarInfo[] = [];
    export let visible = false;

    const dispatch = createEventDispatcher<{
        close: void;
        save: { selected: string[]; showHistorical: boolean };
    }>();

    // Track selected calendars and visibility
    let selectedIds: Set<string> = new Set();
    let visibleIds: Set<string> = new Set();
    let showHistorical = false;

    // Initialize from stores when opened
    $: if (visible) {
        selectedIds = new Set($calendarStore.selected);
        visibleIds = new Set($calendarStore.visible);
        showHistorical = $calendarStore.showHistorical;
    }

    function toggleSelected(id: string) {
        if (selectedIds.has(id)) {
            selectedIds.delete(id);
            visibleIds.delete(id);
        } else {
            selectedIds.add(id);
            visibleIds.add(id); // Auto-show when selected
        }
        selectedIds = selectedIds;
        visibleIds = visibleIds;
    }

    function toggleVisibility(id: string, e: Event) {
        e.stopPropagation();
        if (visibleIds.has(id)) {
            visibleIds.delete(id);
        } else {
            visibleIds.add(id);
        }
        visibleIds = visibleIds;
    }

    function handleSave() {
        const selected = Array.from(selectedIds);
        const visibleArray = Array.from(visibleIds);

        // Update both stores
        authStore.setSelectedCalendars(selected);
        calendarStore.setSelected(selected);

        // Set visibility for each
        for (const id of selected) {
            calendarStore.setVisibility(id, visibleIds.has(id));
        }

        calendarStore.setHistorical(showHistorical);
        calendarStore.save();

        // Save auth state
        authStore.subscribe((state) => {
            saveAuthState(state);
        })();

        dispatch("save", { selected, showHistorical });
        dispatch("close");
    }

    function handleCancel() {
        dispatch("close");
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            dispatch("close");
        }
    }

    const historicalCount = getHistoricalEventsCount();
</script>

{#if visible}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-backdrop" on:click={handleBackdropClick}>
        <div class="modal">
            <div class="modal-header">
                <h3>Calendar Settings</h3>
                <button class="close-btn" on:click={handleCancel}>✕</button>
            </div>

            <div class="modal-body">
                <!-- Historical Events Toggle -->
                <div class="section">
                    <div class="section-header">Special Calendars</div>
                    <label class="calendar-label historical">
                        <input type="checkbox" bind:checked={showHistorical} />
                        <span
                            class="color-dot"
                            style="background: linear-gradient(135deg, #4285f4, #ea4335)"
                        ></span>
                        <span class="calendar-name">Historical Events</span>
                        <span class="event-count">{historicalCount} events</span
                        >
                    </label>
                </div>

                <!-- Google Calendars -->
                <div class="section">
                    <div class="section-header">Google Calendars</div>
                    {#if calendars.length === 0}
                        <p class="no-calendars">No calendars found</p>
                    {:else}
                        <ul class="calendar-list">
                            {#each calendars as calendar}
                                <li class="calendar-item">
                                    <label class="calendar-label">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(
                                                calendar.id,
                                            )}
                                            on:change={() =>
                                                toggleSelected(calendar.id)}
                                        />
                                        <span
                                            class="color-dot"
                                            style="background-color: {calendar.color}"
                                        ></span>
                                        <span class="calendar-name"
                                            >{calendar.name}</span
                                        >
                                        {#if calendar.isPrimary}
                                            <span class="primary-badge"
                                                >Primary</span
                                            >
                                        {/if}
                                        <!-- Eye visibility toggle -->
                                        {#if selectedIds.has(calendar.id)}
                                            <button
                                                class="eye-btn"
                                                class:visible={visibleIds.has(
                                                    calendar.id,
                                                )}
                                                on:click={(e) =>
                                                    toggleVisibility(
                                                        calendar.id,
                                                        e,
                                                    )}
                                                title={visibleIds.has(
                                                    calendar.id,
                                                )
                                                    ? "Hide"
                                                    : "Show"}
                                            >
                                                {visibleIds.has(calendar.id)
                                                    ? "👁️"
                                                    : "👁️‍🗨️"}
                                            </button>
                                        {/if}
                                    </label>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </div>
            </div>

            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={handleCancel}
                    >Cancel</button
                >
                <button class="btn btn-primary" on:click={handleSave}
                    >Save</button
                >
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        backdrop-filter: blur(2px);
    }

    .modal {
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        width: 90%;
        max-width: 400px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #eee;
    }

    .modal-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        opacity: 0.5;
        transition: opacity 0.2s;
    }

    .close-btn:hover {
        opacity: 1;
    }

    .modal-body {
        padding: 16px 20px;
        overflow-y: auto;
        flex: 1;
    }

    .no-calendars {
        color: #888;
        text-align: center;
        padding: 20px;
    }

    .calendar-list {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    .calendar-item {
        margin: 0;
        padding: 0;
    }

    .calendar-label {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 4px;
        cursor: pointer;
        border-radius: 6px;
        transition: background 0.15s;
    }

    .calendar-label:hover {
        background: #f5f5f5;
    }

    .calendar-label input {
        margin: 0;
        width: 16px;
        height: 16px;
        cursor: pointer;
    }

    .color-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .calendar-name {
        flex: 1;
        font-size: 14px;
    }

    .primary-badge {
        font-size: 10px;
        color: #666;
        background: #f0f0f0;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .modal-footer {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        padding: 12px 20px;
        border-top: 1px solid #eee;
    }

    .btn {
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }

    .btn-secondary {
        background: #f5f5f5;
        border: 1px solid #ddd;
        color: #333;
    }

    .btn-secondary:hover {
        background: #eee;
    }

    .btn-primary {
        background: #4285f4;
        border: none;
        color: white;
    }

    .btn-primary:hover {
        background: #3367d6;
    }

    .section {
        margin-bottom: 16px;
    }

    .section-header {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        color: #888;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
        padding: 0 4px;
    }

    .calendar-label.historical {
        background: linear-gradient(
            135deg,
            rgba(66, 133, 244, 0.08),
            rgba(234, 67, 53, 0.08)
        );
        border-radius: 8px;
        margin: 0;
    }

    .event-count {
        font-size: 11px;
        color: #888;
    }

    .eye-btn {
        background: none;
        border: none;
        padding: 4px 6px;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        opacity: 0.7;
        transition:
            opacity 0.2s,
            transform 0.2s;
        border-radius: 4px;
    }

    .eye-btn:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.05);
    }

    .eye-btn:not(.visible) {
        opacity: 0.35;
    }
</style>
