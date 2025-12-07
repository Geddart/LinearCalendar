<script lang="ts">
    /**
     * DebugOverlay - Stats for Nerds display
     *
     * Shows FPS, object counts, zoom level, and other debug info.
     * Can be conditionally hidden in production builds.
     */

    export let fps: number = 0;
    export let objectsDrawn: number = 0;
    export let gridLinesCount: number = 0;
    export let drawCalls: number = 0;
    export let lodLevel: number = 0;
    export let pixelsPerMs: number = 0;
    export let visibleRange: string = "";
    export let centerTime: string = "";
    export let memoryUsage: string = "";
    export let isMobile: boolean = false;
</script>

<div class="debug-overlay" class:mobile={isMobile}>
    <div class="debug-title">Stats for Nerds</div>
    <div class="debug-section">
        <div><span class="label">FPS:</span> {fps}</div>
        <div><span class="label">Objects:</span> {objectsDrawn}</div>
        <div><span class="label">Grid Lines:</span> {gridLinesCount}</div>
        <div><span class="label">Draw Calls:</span> {drawCalls}</div>
    </div>
    <div class="debug-divider"></div>
    <div class="debug-section">
        <div><span class="label">LOD:</span> {lodLevel}</div>
        <div>
            <span class="label">Zoom:</span>
            {pixelsPerMs.toExponential(2)}
        </div>
        <div><span class="label">Visible:</span> {visibleRange}</div>
    </div>
    <div class="debug-divider"></div>
    <div class="debug-section">
        <div><span class="label">Center:</span> {centerTime}</div>
        {#if memoryUsage}
            <div><span class="label">Memory:</span> {memoryUsage}</div>
        {/if}
    </div>
</div>

<style>
    .debug-overlay {
        position: absolute;
        top: 40px;
        right: 10px;
        background: rgba(0, 0, 0, 0.85);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: "SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace;
        font-size: 11px;
        pointer-events: none;
        z-index: 20;
        min-width: 180px;
        backdrop-filter: blur(4px);
    }

    .debug-overlay.mobile {
        font-size: 9px;
        padding: 8px 10px;
        min-width: 140px;
        top: auto;
        bottom: 130px;
        right: 16px;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(8px);
    }

    .debug-title {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #888;
        margin-bottom: 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .mobile .debug-title {
        font-size: 8px;
    }

    .debug-section {
        margin: 4px 0;
    }

    .debug-section div {
        margin: 3px 0;
        display: flex;
        justify-content: space-between;
    }

    .label {
        color: #aaa;
        margin-right: 12px;
    }

    .debug-divider {
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
        margin: 8px 0;
    }
</style>
