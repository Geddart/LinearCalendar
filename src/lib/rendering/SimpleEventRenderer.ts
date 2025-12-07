/**
 * SimpleEventRenderer - Renders events without instancing
 *
 * PRECISION: All position calculations done on CPU with 64-bit doubles.
 * Y positions use a simple formula based on pre-computed lane index.
 */

import type { ViewportState, RenderableEvent } from '$lib/types/Event';
import type { WebGLContext } from './WebGLContext';

// Vertex shader - uses pixel coordinates passed from CPU
const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;    // Unit quad: -0.5 to 0.5

// All positions in PIXELS (computed on CPU)
uniform vec2 u_pos;           // Center position (x, y) in pixels
uniform vec2 u_size;          // Size (width, height) in pixels
uniform vec2 u_viewportSize;  // Canvas dimensions

void main() {
  // Scale the unit quad by size, then offset by position
  vec2 pixelPos = a_position * u_size + u_pos;
  
  // Convert pixels to clip space (-1 to 1)
  // Origin is center of screen, Y+ is up
  vec2 clipPos = (pixelPos / u_viewportSize) * 2.0;
  
  gl_Position = vec4(clipPos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec4 u_color;

out vec4 fragColor;

void main() {
  fragColor = u_color;
}
`;

export class SimpleEventRenderer {
    private ctx: WebGLContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;

    private uniforms: {
        pos: WebGLUniformLocation | null;
        size: WebGLUniformLocation | null;
        viewportSize: WebGLUniformLocation | null;
        color: WebGLUniformLocation | null;
    };

    constructor(ctx: WebGLContext) {
        this.ctx = ctx;
        this.program = ctx.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
        this.vao = this.setupBuffers();
        this.uniforms = this.cacheUniforms();
    }

    private setupBuffers(): WebGLVertexArrayObject {
        const gl = this.ctx.gl;

        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        // Unit quad centered at origin
        const vertices = new Float32Array([
            -0.5, -0.5,
            0.5, -0.5,
            0.5, 0.5,
            -0.5, -0.5,
            0.5, 0.5,
            -0.5, 0.5
        ]);

        const buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const positionLoc = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);
        return vao;
    }

    private cacheUniforms() {
        const gl = this.ctx.gl;
        return {
            pos: gl.getUniformLocation(this.program, 'u_pos'),
            size: gl.getUniformLocation(this.program, 'u_size'),
            viewportSize: gl.getUniformLocation(this.program, 'u_viewportSize'),
            color: gl.getUniformLocation(this.program, 'u_color')
        };
    }

    /**
     * Render all events.
     * ALL coordinate math done here on CPU with 64-bit precision.
     * 
     * RENDERING MODES:
     * - Bar mode: When event width >= 1px, render as full-height bars filling the lane
     * - Line mode: When event width < 1px, render as thin vertical lines
     *   This creates a "density" visualization when zoomed out
     * 
     * DPI SCALING: All dimensions are scaled by devicePixelRatio for crisp rendering
     * on Retina/high-DPI displays.
     */
    render(events: RenderableEvent[], viewport: ViewportState) {
        const gl = this.ctx.gl;
        const dpr = this.ctx.getDevicePixelRatio();

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        // Use actual canvas buffer dimensions (DPI-scaled)
        const canvasWidth = this.ctx.canvas.width;
        const canvasHeight = this.ctx.canvas.height;
        gl.uniform2f(this.uniforms.viewportSize, canvasWidth, canvasHeight);

        // Lane layout constants (must match Calendar.svelte)
        const NUM_LANES = 4;
        const LANE_AREA_TOP = 0.10;
        const LANE_AREA_BOTTOM = 0.98;
        const LANE_GAP = 0.01;
        const TOTAL_LANE_AREA = LANE_AREA_BOTTOM - LANE_AREA_TOP - (LANE_GAP * (NUM_LANES - 1));
        const LANE_HEIGHT_RATIO = TOTAL_LANE_AREA / NUM_LANES;

        // Event fills from separator to separator (lane height + gap to touch next line)
        const LANE_HEIGHT_PX = LANE_HEIGHT_RATIO * canvasHeight;
        const GAP_PX = LANE_GAP * canvasHeight;
        // For all lanes except the last one, events span lane + gap to reach the next separator
        // This makes events touch both the separator above and below
        const EVENT_HEIGHT = LANE_HEIGHT_PX + GAP_PX;  // Span from line to line
        const MIN_LINE_WIDTH = 1 * dpr;  // Minimum width for line mode
        for (const event of events) {
            // === X POSITION (64-bit precision, scaled by DPR) ===
            const startPx = (event.startTime - viewport.centerTime) * viewport.pixelsPerMs * dpr;
            const endPx = (event.endTime - viewport.centerTime) * viewport.pixelsPerMs * dpr;
            const centerX = (startPx + endPx) / 2;

            // Width is EXACTLY the time span in pixels
            const timeSpanWidth = endPx - startPx;

            // Determine if we're in line mode (event width < 1px)
            const isLineMode = timeSpanWidth < 1 * dpr;

            // === Y POSITION (stable, from 0-1 lane position, scaled by DPR) ===
            const centerY = (event.y - 0.5) * canvasHeight;

            let eventWidth: number;
            let height: number;

            if (isLineMode) {
                // LINE MODE: Thin vertical line representing the event
                // Width is fixed at minimum line width
                eventWidth = MIN_LINE_WIDTH;
            } else {
                // BAR MODE: Full bar representation filling the lane
                eventWidth = timeSpanWidth;
            }

            // Height is ALWAYS the full lane height - never changes with zoom
            height = EVENT_HEIGHT;
            gl.uniform2f(this.uniforms.pos, centerX, centerY);
            gl.uniform2f(this.uniforms.size, eventWidth, height);
            gl.uniform4f(this.uniforms.color, event.colorR, event.colorG, event.colorB, event.colorA);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        gl.bindVertexArray(null);
    }
}

