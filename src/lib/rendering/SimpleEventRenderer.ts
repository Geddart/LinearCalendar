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
     * WIDTH: Exactly matches the event's time span in pixels
     * HEIGHT: Fixed at EVENT_HEIGHT when shown as bar, DOT_SIZE when zoomed out
     */
    render(events: RenderableEvent[], viewport: ViewportState) {
        const gl = this.ctx.gl;

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        gl.uniform2f(this.uniforms.viewportSize, viewport.width, viewport.height);

        // Event rendering constants
        const EVENT_HEIGHT = 24; // Fixed height for bar events
        const DOT_SIZE = 6;      // Minimum size when very zoomed out

        for (const event of events) {
            // === X POSITION (64-bit precision) ===
            const startPx = (event.startTime - viewport.centerTime) * viewport.pixelsPerMs;
            const endPx = (event.endTime - viewport.centerTime) * viewport.pixelsPerMs;
            const centerX = (startPx + endPx) / 2;

            // Width is EXACTLY the time span in pixels, with a minimum size
            const timeSpanWidth = endPx - startPx;
            const eventWidth = Math.max(timeSpanWidth, DOT_SIZE);

            // === Y POSITION (stable, from 0-1 lane position) ===
            const centerY = (event.y - 0.5) * viewport.height;

            // === HEIGHT ===
            // Height morphs smoothly between DOT_SIZE and EVENT_HEIGHT
            // based on morphFactor, but stays at EVENT_HEIGHT once reached
            const height = DOT_SIZE + (EVENT_HEIGHT - DOT_SIZE) * viewport.morphFactor;

            // Set uniforms (all in pixels, relative to screen center)
            gl.uniform2f(this.uniforms.pos, centerX, centerY);
            gl.uniform2f(this.uniforms.size, eventWidth, height);
            gl.uniform4f(this.uniforms.color, event.colorR, event.colorG, event.colorB, event.colorA);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        gl.bindVertexArray(null);
    }
}
