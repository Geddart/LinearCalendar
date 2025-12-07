<script lang="ts">
    /**
     * Toast - Notification toast for view changes
     *
     * Shows temporary message that fades out after 1.5 seconds.
     * Uses key-based remounting for animation restart on rapid triggers.
     */

    export let message: string = "";
    export let visible: boolean = false;
</script>

{#if visible}
    <div class="toast" class:visible>
        {message}
    </div>
{/if}

<style>
    .toast {
        position: absolute;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.85);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        pointer-events: none;
        z-index: 100;
        opacity: 0;
        backdrop-filter: blur(8px);
    }

    .toast.visible {
        opacity: 1;
        animation: toast-fade 1.5s ease forwards;
    }

    @keyframes toast-fade {
        0% {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        70% {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        100% {
            opacity: 0;
            transform: translateX(-50%) translateY(-10px);
        }
    }
</style>
