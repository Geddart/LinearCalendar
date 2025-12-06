import { viewportController } from './ViewportController';

/**
 * InputHandler manages mouse, touch, and keyboard input.
 *
 * TRACKPAD GESTURES (macOS):
 * - Two-finger horizontal swipe = pan (deltaX)
 * - Two-finger vertical swipe = pan (deltaY without ctrl)
 * - Pinch = zoom (deltaY with ctrlKey)
 * 
 * MOUSE:
 * - Scroll wheel = zoom
 * - Click + drag = pan
 * 
 * TOUCH (mobile):
 * - Single finger drag = pan with inertia
 * - Pinch = zoom with inertia
 */
export class InputHandler {
    private canvas: HTMLCanvasElement;

    // Drag state
    private isDragging = false;
    private lastX = 0;

    // Momentum scrolling (pan)
    private velocityX = 0;
    private lastMoveTime = 0;
    private momentumId = 0;

    // Zoom momentum
    private zoomVelocity = 0;
    private zoomMomentumId = 0;
    private lastZoomCenter = 0;

    // Pinch zoom (touch)
    private pinchDistance = 0;
    private lastPinchTime = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.setupEventListeners();
    }

    private setupEventListeners() {
        // Wheel/trackpad - handles zoom AND pan depending on gesture
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

        // Mouse drag = pan
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        window.addEventListener('mousemove', this.handleMouseMove.bind(this));
        window.addEventListener('mouseup', this.handleMouseUp.bind(this));

        // Touch = pinch zoom + pan
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), {
            passive: false
        });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // Keyboard
        window.addEventListener('keydown', this.handleKeyDown.bind(this));

        // Set initial cursor
        this.canvas.style.cursor = 'grab';
    }

    /**
     * WHEEL EVENT HANDLER
     * 
     * On macOS trackpad:
     * - Pinch gesture: ctrlKey=true, deltaY = zoom amount
     * - Two-finger swipe horizontal: deltaX = pan amount
     * - Two-finger swipe vertical: deltaY = scroll (we treat as pan)
     * 
     * On mouse with scroll wheel:
     * - Regular scroll: deltaY only, ctrlKey=false - we treat as ZOOM for mice
     */
    private handleWheel(e: WheelEvent) {
        e.preventDefault();

        const rect = this.canvas.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;

        // Normalize deltas
        let deltaX = e.deltaX;
        let deltaY = e.deltaY;
        if (e.deltaMode === 1) {
            deltaX *= 40;
            deltaY *= 40;
        }
        if (e.deltaMode === 2) {
            deltaX *= 800;
            deltaY *= 800;
        }

        // Check if this is a pinch gesture (macOS sends ctrlKey=true for pinch)
        const isPinchZoom = e.ctrlKey || e.metaKey;

        if (isPinchZoom) {
            // ZOOM - pinch gesture on trackpad
            // Faster zoom: multiply by larger factor
            const zoomFactor = 1.005 ** -deltaY;
            viewportController.zoomAt(cursorX, Math.log(zoomFactor) * 5);
        } else {
            // PAN - two-finger swipe
            // Horizontal swipe = horizontal pan (deltaX)
            // Vertical swipe = we also pan horizontally (timeline is horizontal)
            const panAmount = deltaX + deltaY;
            viewportController.pan(-panAmount);
        }
    }

    /**
     * MOUSE DOWN = START DRAG
     */
    private handleMouseDown(e: MouseEvent) {
        this.isDragging = true;
        this.lastX = e.clientX;
        this.lastMoveTime = performance.now();
        this.velocityX = 0;

        cancelAnimationFrame(this.momentumId);
        this.canvas.style.cursor = 'grabbing';
    }

    /**
     * MOUSE MOVE = PAN (if dragging)
     */
    private handleMouseMove(e: MouseEvent) {
        if (!this.isDragging) return;

        const deltaX = e.clientX - this.lastX;
        const now = performance.now();
        const deltaTime = now - this.lastMoveTime;

        if (deltaTime > 0) {
            this.velocityX = (deltaX / deltaTime) * 16;
        }

        viewportController.pan(deltaX);

        this.lastX = e.clientX;
        this.lastMoveTime = now;
    }

    /**
     * MOUSE UP = STOP DRAG + START MOMENTUM
     */
    private handleMouseUp() {
        if (!this.isDragging) return;

        this.isDragging = false;
        this.canvas.style.cursor = 'grab';

        if (Math.abs(this.velocityX) > 0.5) {
            this.startMomentum();
        }
    }

    /**
     * MOMENTUM SCROLLING (pan)
     */
    private startMomentum() {
        const friction = 0.95;

        const tick = () => {
            this.velocityX *= friction;

            if (Math.abs(this.velocityX) < 0.1) {
                return;
            }

            viewportController.pan(this.velocityX);
            this.momentumId = requestAnimationFrame(tick);
        };

        this.momentumId = requestAnimationFrame(tick);
    }

    /**
     * ZOOM MOMENTUM
     */
    private startZoomMomentum() {
        const friction = 0.92;

        const tick = () => {
            this.zoomVelocity *= friction;

            if (Math.abs(this.zoomVelocity) < 0.001) {
                return;
            }

            viewportController.zoomAt(this.lastZoomCenter, this.zoomVelocity);
            this.zoomMomentumId = requestAnimationFrame(tick);
        };

        this.zoomMomentumId = requestAnimationFrame(tick);
    }

    /**
     * TOUCH START = Begin drag or pinch
     */
    private handleTouchStart(e: TouchEvent) {
        e.preventDefault();

        // Cancel any ongoing momentum
        cancelAnimationFrame(this.momentumId);
        cancelAnimationFrame(this.zoomMomentumId);

        if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastX = e.touches[0].clientX;
            this.lastMoveTime = performance.now();
            this.velocityX = 0;
        } else if (e.touches.length === 2) {
            this.isDragging = false;
            this.pinchDistance = this.getTouchDistance(e.touches);
            this.lastPinchTime = performance.now();
            this.zoomVelocity = 0;

            const rect = this.canvas.getBoundingClientRect();
            this.lastZoomCenter = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        }
    }

    /**
     * TOUCH MOVE = Pan or pinch zoom with velocity tracking
     */
    private handleTouchMove(e: TouchEvent) {
        e.preventDefault();

        if (e.touches.length === 1 && this.isDragging) {
            const deltaX = e.touches[0].clientX - this.lastX;
            const now = performance.now();
            const deltaTime = now - this.lastMoveTime;

            // Track velocity for inertia
            if (deltaTime > 0) {
                this.velocityX = (deltaX / deltaTime) * 16;
            }

            viewportController.pan(deltaX);
            this.lastX = e.touches[0].clientX;
            this.lastMoveTime = now;
        } else if (e.touches.length === 2) {
            const newDistance = this.getTouchDistance(e.touches);
            const scale = newDistance / this.pinchDistance;
            const now = performance.now();
            const deltaTime = now - this.lastPinchTime;

            const rect = this.canvas.getBoundingClientRect();
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
            this.lastZoomCenter = midX;

            // 40% faster zoom: multiply by 1.4, then additional boost with * 7
            const zoomAmount = Math.log(scale) * 7;

            // Track zoom velocity for inertia
            if (deltaTime > 0) {
                this.zoomVelocity = zoomAmount * 0.5;
            }

            viewportController.zoomAt(midX, zoomAmount);
            this.pinchDistance = newDistance;
            this.lastPinchTime = now;
        }
    }

    /**
     * TOUCH END = Start inertia
     */
    private handleTouchEnd(e: TouchEvent) {
        if (e.touches.length === 0) {
            // All fingers lifted
            if (this.isDragging && Math.abs(this.velocityX) > 0.5) {
                this.startMomentum();
            }
            if (Math.abs(this.zoomVelocity) > 0.01) {
                this.startZoomMomentum();
            }
            this.isDragging = false;
        } else if (e.touches.length === 1) {
            // Transitioned from pinch to single finger
            this.isDragging = true;
            this.lastX = e.touches[0].clientX;
            this.lastMoveTime = performance.now();
            this.velocityX = 0;
        }
    }

    /**
     * KEYBOARD NAVIGATION
     */
    private handleKeyDown(e: KeyboardEvent) {
        if (e.target instanceof HTMLInputElement) return;

        switch (e.key) {
            case 'ArrowLeft':
                viewportController.pan(100);
                break;
            case 'ArrowRight':
                viewportController.pan(-100);
                break;
            case '+':
            case '=':
                viewportController.zoomAt(this.canvas.width / 2, 2); // Faster keyboard zoom
                break;
            case '-':
                viewportController.zoomAt(this.canvas.width / 2, -2); // Faster keyboard zoom
                break;
            case 'Home':
            case 't':
                viewportController.goToToday();
                break;
            case '1':
                viewportController.setZoomPreset('YEAR');
                break;
            case '2':
                viewportController.setZoomPreset('MONTH');
                break;
            case '3':
                viewportController.setZoomPreset('WEEK');
                break;
            case '4':
                viewportController.setZoomPreset('DAY');
                break;
        }
    }

    private getTouchDistance(touches: TouchList): number {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    destroy() {
        window.removeEventListener('mousemove', this.handleMouseMove.bind(this));
        window.removeEventListener('mouseup', this.handleMouseUp.bind(this));
        window.removeEventListener('keydown', this.handleKeyDown.bind(this));
        cancelAnimationFrame(this.momentumId);
        cancelAnimationFrame(this.zoomMomentumId);
    }
}
