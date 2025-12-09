/**
 * DayNightWebGLRenderer - Renders day/night overlay using WebGL
 * 
 * Uses GPU instanced rendering for smooth, artifact-free gradients.
 * Renders a horizontal band showing daylight (white) and nighttime (blue) periods.
 */

import type { ViewportState } from '$lib/types/Event';
import type { WebGLContext } from './WebGLContext';
import { getSunTimes, getStartOfDay } from '$lib/utils/SunCalculator';

// Vertex shader - handles positioning of quad segments
const VERTEX_SHADER = `#version 300 es
precision highp float;

// Per-vertex data (unit quad)
in vec2 a_position;

// Per-instance data
in vec4 a_instancePosSize;  // x, y, width, height
in vec4 a_colorLeft;        // left edge color (rgba)
in vec4 a_colorRight;       // right edge color (rgba)

uniform vec2 u_viewportSize;

out vec4 v_colorLeft;
out vec4 v_colorRight;
out float v_gradientPos;    // 0 at left edge, 1 at right edge

void main() {
    vec2 pos = a_instancePosSize.xy;
    vec2 size = a_instancePosSize.zw;
    
    // Scale unit quad by instance size, then offset by instance position
    // a_position.x goes from -0.5 to 0.5
    vec2 pixelPos = a_position * size + pos;
    
    // Convert pixels to clip space (-1 to 1)
    vec2 clipPos = (pixelPos / u_viewportSize) * 2.0;
    
    gl_Position = vec4(clipPos, 0.0, 1.0);
    
    // Pass colors to fragment shader
    v_colorLeft = a_colorLeft;
    v_colorRight = a_colorRight;
    
    // Calculate horizontal gradient position (0 at left, 1 at right)
    v_gradientPos = a_position.x + 0.5;
}
`;

// Fragment shader - smooth linear gradient between left and right colors
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_colorLeft;
in vec4 v_colorRight;
in float v_gradientPos;

out vec4 fragColor;

void main() {
    // Smooth linear interpolation between left and right colors
    fragColor = mix(v_colorLeft, v_colorRight, v_gradientPos);
}
`;

// Per instance: x, y, width, height, leftR, leftG, leftB, leftA, rightR, rightG, rightB, rightA
const FLOATS_PER_INSTANCE = 12;

// Colors (RGBA, values 0-1) - Higher saturation for contrast
const DAY_COLOR = [1.0, 0.95, 0.80, 1.0];     // Warm golden yellow
const NIGHT_COLOR = [0.75, 0.80, 0.92, 1.0];  // More saturated cool blue

// Fade range for visibility based on zoom (higher pixelsPerMs = more zoomed in)
const FADE_START = 2.00e-7;  // Start fading in
const FADE_END = 4.00e-7;    // Fully visible

const DAY_MS = 86_400_000;

/** Threshold above which the overlay becomes visible */
export const DAY_NIGHT_THRESHOLD = 3.00e-7;

export class DayNightWebGLRenderer {
    private ctx: WebGLContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private instanceBuffer: WebGLBuffer;
    private instanceData: Float32Array;
    private maxInstances: number;
    private currentInstanceCount: number = 0;

    private uniforms: {
        viewportSize: WebGLUniformLocation | null;
    };

    // Overlay placement (same as seasons - they blend together)
    private readonly OVERLAY_TOP = 0.05;     // Right below timeline numbers
    private readonly OVERLAY_HEIGHT = 0.024; // Height of the overlay band

    constructor(ctx: WebGLContext, maxInstances: number = 500) {
        this.ctx = ctx;
        this.maxInstances = maxInstances;
        this.instanceData = new Float32Array(maxInstances * FLOATS_PER_INSTANCE);

        this.program = ctx.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
        this.instanceBuffer = ctx.gl.createBuffer()!;
        this.vao = this.setupBuffers();
        this.uniforms = this.cacheUniforms();
    }

    private setupBuffers(): WebGLVertexArrayObject {
        const gl = this.ctx.gl;

        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        // === Vertex buffer (unit quad, shared by all instances) ===
        const vertices = new Float32Array([
            -0.5, -0.5,
            0.5, -0.5,
            0.5, 0.5,
            -0.5, -0.5,
            0.5, 0.5,
            -0.5, 0.5
        ]);

        const vertexBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const positionLoc = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(positionLoc, 0); // Shared

        // === Instance buffer ===
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

        const stride = FLOATS_PER_INSTANCE * 4;

        // Position + Size (vec4: x, y, width, height)
        const posSizeLoc = gl.getAttribLocation(this.program, 'a_instancePosSize');
        gl.enableVertexAttribArray(posSizeLoc);
        gl.vertexAttribPointer(posSizeLoc, 4, gl.FLOAT, false, stride, 0);
        gl.vertexAttribDivisor(posSizeLoc, 1);

        // Left color (vec4: r, g, b, a)
        const colorLeftLoc = gl.getAttribLocation(this.program, 'a_colorLeft');
        gl.enableVertexAttribArray(colorLeftLoc);
        gl.vertexAttribPointer(colorLeftLoc, 4, gl.FLOAT, false, stride, 4 * 4);
        gl.vertexAttribDivisor(colorLeftLoc, 1);

        // Right color (vec4: r, g, b, a)
        const colorRightLoc = gl.getAttribLocation(this.program, 'a_colorRight');
        gl.enableVertexAttribArray(colorRightLoc);
        gl.vertexAttribPointer(colorRightLoc, 4, gl.FLOAT, false, stride, 8 * 4);
        gl.vertexAttribDivisor(colorRightLoc, 1);

        gl.bindVertexArray(null);
        return vao;
    }

    private cacheUniforms() {
        const gl = this.ctx.gl;
        return {
            viewportSize: gl.getUniformLocation(this.program, 'u_viewportSize')
        };
    }

    /**
     * Calculate zoom-based opacity
     */
    private calculateOpacity(pixelsPerMs: number): number {
        if (pixelsPerMs <= FADE_START) return 0;
        if (pixelsPerMs >= FADE_END) return 1;
        return (pixelsPerMs - FADE_START) / (FADE_END - FADE_START);
    }

    /**
     * Convert time to X pixel position
     */
    private timeToX(time: number, viewport: ViewportState, dpr: number): number {
        return (time - viewport.centerTime) * viewport.pixelsPerMs * dpr;
    }

    /**
     * Add a segment to the instance buffer
     */
    private addSegment(
        startTime: number,
        endTime: number,
        leftColor: number[],
        rightColor: number[],
        viewport: ViewportState,
        dpr: number,
        canvasHeight: number,
        opacity: number
    ): void {
        if (this.currentInstanceCount >= this.maxInstances) return;

        // Skip if entirely outside viewport
        if (endTime < viewport.startTime || startTime > viewport.endTime) return;

        // Clamp to viewport bounds
        const clampedStart = Math.max(startTime, viewport.startTime);
        const clampedEnd = Math.min(endTime, viewport.endTime);

        const startX = this.timeToX(clampedStart, viewport, dpr);
        const endX = this.timeToX(clampedEnd, viewport, dpr);

        const width = endX - startX;
        if (width < 0.5) return; // Skip tiny segments

        const centerX = (startX + endX) / 2;
        const height = this.OVERLAY_HEIGHT * canvasHeight;
        // Y position: convert from top-based ratio to center-based coordinate
        // In WebGL, Y=0 is center, positive is up
        const centerY = (0.5 - this.OVERLAY_TOP - this.OVERLAY_HEIGHT / 2) * canvasHeight;

        const offset = this.currentInstanceCount * FLOATS_PER_INSTANCE;

        // Position and size
        this.instanceData[offset + 0] = centerX;
        this.instanceData[offset + 1] = centerY;
        this.instanceData[offset + 2] = width;
        this.instanceData[offset + 3] = height;

        // Left color with opacity
        this.instanceData[offset + 4] = leftColor[0];
        this.instanceData[offset + 5] = leftColor[1];
        this.instanceData[offset + 6] = leftColor[2];
        this.instanceData[offset + 7] = leftColor[3] * opacity;

        // Right color with opacity
        this.instanceData[offset + 8] = rightColor[0];
        this.instanceData[offset + 9] = rightColor[1];
        this.instanceData[offset + 10] = rightColor[2];
        this.instanceData[offset + 11] = rightColor[3] * opacity;

        this.currentInstanceCount++;
    }

    /**
     * Update the instance buffer with day/night segments
     */
    private updateInstanceBuffer(
        viewport: ViewportState,
        latitude: number,
        longitude: number,
        opacity: number
    ): void {
        const dpr = this.ctx.getDevicePixelRatio();
        const canvasHeight = this.ctx.canvas.height;

        this.currentInstanceCount = 0;

        // Find first day that could be visible
        const firstDayStart = getStartOfDay(viewport.startTime - DAY_MS);
        const lastDayEnd = getStartOfDay(viewport.endTime + DAY_MS);

        // Iterate through each day
        for (let dayStart = firstDayStart; dayStart <= lastDayEnd; dayStart += DAY_MS) {
            const sunTimes = getSunTimes(new Date(dayStart), latitude, longitude);
            const dayEnd = dayStart + DAY_MS;

            // Night (before dawn) - solid night color
            this.addSegment(
                dayStart, sunTimes.dawn,
                NIGHT_COLOR, NIGHT_COLOR,
                viewport, dpr, canvasHeight, opacity
            );

            // Dawn (gradient: night -> day)
            this.addSegment(
                sunTimes.dawn, sunTimes.sunrise,
                NIGHT_COLOR, DAY_COLOR,
                viewport, dpr, canvasHeight, opacity
            );

            // Day (solid white)
            this.addSegment(
                sunTimes.sunrise, sunTimes.sunset,
                DAY_COLOR, DAY_COLOR,
                viewport, dpr, canvasHeight, opacity
            );

            // Dusk (gradient: day -> night)
            this.addSegment(
                sunTimes.sunset, sunTimes.dusk,
                DAY_COLOR, NIGHT_COLOR,
                viewport, dpr, canvasHeight, opacity
            );

            // Night (after dusk) - solid night color
            this.addSegment(
                sunTimes.dusk, dayEnd,
                NIGHT_COLOR, NIGHT_COLOR,
                viewport, dpr, canvasHeight, opacity
            );
        }
    }

    /**
     * Render the day/night overlay
     */
    render(viewport: ViewportState, latitude: number, longitude: number): void {
        const opacity = this.calculateOpacity(viewport.pixelsPerMs);

        // Skip if not visible
        if (opacity <= 0) return;

        const gl = this.ctx.gl;

        // Update instance buffer
        this.updateInstanceBuffer(viewport, latitude, longitude, opacity);

        if (this.currentInstanceCount === 0) return;

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        // Upload instance data to GPU
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0,
            this.instanceData.subarray(0, this.currentInstanceCount * FLOATS_PER_INSTANCE));

        // Set viewport size uniform
        gl.uniform2f(this.uniforms.viewportSize, this.ctx.canvas.width, this.ctx.canvas.height);

        // Draw all segments in a single call
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.currentInstanceCount);

        gl.bindVertexArray(null);
    }

    /**
     * Dispose of GPU resources
     */
    dispose(): void {
        const gl = this.ctx.gl;
        gl.deleteBuffer(this.instanceBuffer);
        gl.deleteVertexArray(this.vao);
        gl.deleteProgram(this.program);
    }
}
