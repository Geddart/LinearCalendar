/**
 * InstancedEventRenderer - High-performance GPU instanced rendering
 * 
 * Uses WebGL instancing to render thousands of events in a SINGLE draw call.
 * Instead of one draw call per event, all events are packed into instance buffers
 * and rendered together.
 * 
 * Performance comparison:
 * - SimpleEventRenderer: 10,000 events = 10,000 draw calls
 * - InstancedEventRenderer: 10,000 events = 1 draw call
 */

import type { ViewportState, RenderableEvent } from '$lib/types/Event';
import type { WebGLContext } from './WebGLContext';

// Instanced vertex shader - per-instance attributes for position, size, color
const VERTEX_SHADER = `#version 300 es
precision highp float;

// Per-vertex data (unit quad)
in vec2 a_position;

// Per-instance data
in vec4 a_instancePosSize;  // xy = center position, zw = size
in vec4 a_instanceColor;     // rgba color

uniform vec2 u_viewportSize;

out vec4 v_color;

void main() {
    vec2 pos = a_instancePosSize.xy;
    vec2 size = a_instancePosSize.zw;
    
    // Scale unit quad by instance size, then offset by instance position
    vec2 pixelPos = a_position * size + pos;
    
    // Convert pixels to clip space (-1 to 1)
    vec2 clipPos = (pixelPos / u_viewportSize) * 2.0;
    
    gl_Position = vec4(clipPos, 0.0, 1.0);
    v_color = a_instanceColor;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
    fragColor = v_color;
}
`;

// Number of floats per instance: centerX, centerY, width, height, r, g, b, a
const FLOATS_PER_INSTANCE = 8;

export class InstancedEventRenderer {
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

    constructor(ctx: WebGLContext, maxInstances: number = 50000) {
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
        // NOT instanced - shared by all instances
        gl.vertexAttribDivisor(positionLoc, 0);

        // === Instance buffer (per-instance position, size, color) ===
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        // Allocate buffer space (will be updated each frame)
        gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

        // Position + Size (vec4: centerX, centerY, width, height)
        const posSizeLoc = gl.getAttribLocation(this.program, 'a_instancePosSize');
        gl.enableVertexAttribArray(posSizeLoc);
        gl.vertexAttribPointer(posSizeLoc, 4, gl.FLOAT, false, FLOATS_PER_INSTANCE * 4, 0);
        gl.vertexAttribDivisor(posSizeLoc, 1); // One per instance

        // Color (vec4: r, g, b, a)
        const colorLoc = gl.getAttribLocation(this.program, 'a_instanceColor');
        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, FLOATS_PER_INSTANCE * 4, 4 * 4);
        gl.vertexAttribDivisor(colorLoc, 1); // One per instance

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
     * Update the instance buffer with event data.
     * This packs all events into a single Float32Array for GPU upload.
     * @param laneCount - Fixed number of lanes for consistent height calculation
     */
    private updateInstanceBuffer(events: RenderableEvent[], viewport: ViewportState, laneCount: number): void {
        const dpr = this.ctx.getDevicePixelRatio();
        const canvasWidth = this.ctx.canvas.width;
        const canvasHeight = this.ctx.canvas.height;

        // Lane layout constants (must match Calendar.svelte)
        const LANE_AREA_TOP = 0.12;
        const LANE_AREA_BOTTOM = 0.95;
        const LANE_GAP = 0.015;

        // Use fixed lane count for stable heights
        const numLanes = Math.max(1, laneCount);
        const totalLaneArea = LANE_AREA_BOTTOM - LANE_AREA_TOP - (LANE_GAP * (numLanes - 1));
        const laneHeightRatio = totalLaneArea / numLanes;

        // Event height fills from separator to separator (laneHeight + LANE_GAP)
        // This matches the Y center calculation in Calendar.svelte
        const LANE_HEIGHT_PX = (laneHeightRatio + LANE_GAP) * canvasHeight;
        const MIN_LINE_WIDTH = 1 * dpr;

        let instanceIndex = 0;
        for (const event of events) {
            if (instanceIndex >= this.maxInstances) break;

            // Calculate X position and width
            const startPx = (event.startTime - viewport.centerTime) * viewport.pixelsPerMs * dpr;
            const endPx = (event.endTime - viewport.centerTime) * viewport.pixelsPerMs * dpr;
            const centerX = (startPx + endPx) / 2;
            const timeSpanWidth = endPx - startPx;

            // Line mode when width < 1px
            const eventWidth = timeSpanWidth < 1 * dpr ? MIN_LINE_WIDTH : timeSpanWidth;

            // Y position
            const centerY = (event.y - 0.5) * canvasHeight;

            // Pack into buffer: centerX, centerY, width, height, r, g, b, a
            const offset = instanceIndex * FLOATS_PER_INSTANCE;
            this.instanceData[offset + 0] = centerX;
            this.instanceData[offset + 1] = centerY;
            this.instanceData[offset + 2] = eventWidth;
            this.instanceData[offset + 3] = LANE_HEIGHT_PX;
            this.instanceData[offset + 4] = event.colorR;
            this.instanceData[offset + 5] = event.colorG;
            this.instanceData[offset + 6] = event.colorB;
            this.instanceData[offset + 7] = event.colorA;

            instanceIndex++;
        }

        this.currentInstanceCount = instanceIndex;
    }

    /**
     * Render all events with a SINGLE draw call using GPU instancing.
     * @param laneCount - Fixed number of lanes for consistent height calculation
     */
    render(events: RenderableEvent[], viewport: ViewportState, laneCount: number = 8): void {
        if (events.length === 0) return;

        const gl = this.ctx.gl;

        // Update instance buffer with current event data
        this.updateInstanceBuffer(events, viewport, laneCount);

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        // Upload instance data to GPU
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0,
            this.instanceData.subarray(0, this.currentInstanceCount * FLOATS_PER_INSTANCE));

        // Set viewport size uniform
        gl.uniform2f(this.uniforms.viewportSize, this.ctx.canvas.width, this.ctx.canvas.height);

        // SINGLE draw call for ALL events!
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.currentInstanceCount);

        gl.bindVertexArray(null);
    }

    /**
     * Get the number of events rendered in the last frame.
     */
    getInstanceCount(): number {
        return this.currentInstanceCount;
    }

    /**
     * Dispose of GPU resources.
     */
    dispose(): void {
        const gl = this.ctx.gl;
        gl.deleteBuffer(this.instanceBuffer);
        gl.deleteVertexArray(this.vao);
        gl.deleteProgram(this.program);
    }
}
