/**
 * InstancedEventRenderer - Renders thousands of events using WebGL 2 Instancing
 *
 * CONCEPT:
 * Instead of issuing 1 draw call per event (slow), we issue 1 draw call for ALL events.
 * We upload a "Data Buffer" containing all event properties (x, y, w, h, color)
 * and the GPU draws the same unit quad N times, using the data buffer to
 * transform each instance.
 */

import type { ViewportState, RenderableEvent } from '$lib/types/Event';
import type { WebGLContext } from './WebGLContext';

// Vertex shader handles the positioning and sizing
// Now accepts INSTANCE attributes (prefixed with i_)
const VERTEX_SHADER = `#version 300 es
precision highp float;

// Geometry attributes (Static, 1 per vertex)
in vec2 a_position;    // Unit quad: -0.5 to 0.5

// Instance attributes (Dynamic, 1 per event)
in vec2 i_pos;         // Center position (x, y) in pixels
in vec2 i_size;        // Size (width, height) in pixels
in vec4 i_color;       // Color (r, g, b, a)

// Uniforms (Global)
uniform vec2 u_viewportSize;  // Canvas dimensions

// Output to fragment shader
out vec4 v_color;

void main() {
  // Scale the unit quad by instance size, then offset by instance position
  vec2 pixelPos = a_position * i_size + i_pos;
  
  // Convert pixels to clip space (-1 to 1)
  // Origin is center of screen, Y+ is up
  // (pixelPos / u_viewportSize) * 2.0 gives -1 to 1 range
  vec2 clipPos = (pixelPos / u_viewportSize) * 2.0; 
  
  gl_Position = vec4(clipPos, 0.0, 1.0);
  
  // Pass color to fragment shader
  v_color = i_color;
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

export class InstancedEventRenderer {
    private ctx: WebGLContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private instanceBuffer: WebGLBuffer;

    // Capacity tracking to avoid re-allocating buffers unnecessarily
    private currentCapacity = 0;
    private dataArray: Float32Array = new Float32Array(0);

    private uniforms: {
        viewportSize: WebGLUniformLocation | null;
    };

    constructor(ctx: WebGLContext) {
        this.ctx = ctx;
        this.program = ctx.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);

        // Create buffers
        const gl = this.ctx.gl;
        this.instanceBuffer = gl.createBuffer()!;

        // Setup VAO and attributes
        this.vao = this.setupVAO();

        // Cache uniforms
        this.uniforms = {
            viewportSize: gl.getUniformLocation(this.program, 'u_viewportSize')
        };
    }

    private setupVAO(): WebGLVertexArrayObject {
        const gl = this.ctx.gl;
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        // --- 1. GEOMETRY BUFFER (Static Unit Quad) ---
        // -0.5 to 0.5
        const vertices = new Float32Array([
            -0.5, -0.5,
            0.5, -0.5,
            0.5, 0.5,
            -0.5, -0.5,
            0.5, 0.5,
            -0.5, 0.5
        ]);

        const geoBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, geoBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const posLoc = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        // --- 2. INSTANCE BUFFER (Dynamic Data) ---
        // Strides: X, Y, W, H, R, G, B, A (8 floats per instance)
        // 8 * 4 bytes = 32 bytes per instance
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);

        const stride = 8 * 4; // 8 floats * 4 bytes

        // Attribute locations
        const iPosLoc = gl.getAttribLocation(this.program, 'i_pos');
        const iSizeLoc = gl.getAttribLocation(this.program, 'i_size');
        const iColorLoc = gl.getAttribLocation(this.program, 'i_color');

        // i_pos (2 floats)
        gl.enableVertexAttribArray(iPosLoc);
        gl.vertexAttribPointer(iPosLoc, 2, gl.FLOAT, false, stride, 0);
        gl.vertexAttribDivisor(iPosLoc, 1); // Advance 1 per instance

        // i_size (2 floats)
        gl.enableVertexAttribArray(iSizeLoc);
        gl.vertexAttribPointer(iSizeLoc, 2, gl.FLOAT, false, stride, 2 * 4);
        gl.vertexAttribDivisor(iSizeLoc, 1); // Advance 1 per instance

        // i_color (4 floats)
        gl.enableVertexAttribArray(iColorLoc);
        gl.vertexAttribPointer(iColorLoc, 4, gl.FLOAT, false, stride, 4 * 4);
        gl.vertexAttribDivisor(iColorLoc, 1); // Advance 1 per instance

        gl.bindVertexArray(null);
        return vao;
    }

    /**
     * Render all events using a single instanced draw call.
     */
    render(events: RenderableEvent[], viewport: ViewportState) {
        if (events.length === 0) return;

        const gl = this.ctx.gl;
        const dpr = this.ctx.getDevicePixelRatio();

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        // Update Viewport Uniform
        const canvasWidth = this.ctx.canvas.width;
        const canvasHeight = this.ctx.canvas.height;
        gl.uniform2f(this.uniforms.viewportSize, canvasWidth, canvasHeight);

        // Resize data array if needed (grow only)
        const floatsPerInstance = 8;
        const requiredSize = events.length * floatsPerInstance;

        if (this.dataArray.length < requiredSize) {
            this.dataArray = new Float32Array(requiredSize);
        }

        // Fill Data Array
        // X, Y, W, H, R, G, B, A
        const EVENT_HEIGHT = 24 * dpr;
        const DOT_SIZE = 6 * dpr;

        let index = 0;
        for (const event of events) {
            // === POSITIONING LOGIC (Same as detailed renderer) ===
            const startPx = (event.startTime - viewport.centerTime) * viewport.pixelsPerMs * dpr;
            const endPx = (event.endTime - viewport.centerTime) * viewport.pixelsPerMs * dpr;
            const centerX = (startPx + endPx) / 2;

            const timeSpanWidth = endPx - startPx;
            const eventWidth = Math.max(timeSpanWidth, DOT_SIZE);

            const centerY = (event.y - 0.5) * canvasHeight;

            const height = DOT_SIZE + (EVENT_HEIGHT - DOT_SIZE) * viewport.morphFactor;

            // Fill buffer
            this.dataArray[index++] = centerX;
            this.dataArray[index++] = centerY;
            this.dataArray[index++] = eventWidth;
            this.dataArray[index++] = height;
            this.dataArray[index++] = event.colorR;
            this.dataArray[index++] = event.colorG;
            this.dataArray[index++] = event.colorB;
            this.dataArray[index++] = event.colorA;
        }

        // Upload Data to GPU
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        // Optimization: Use bufferSubData if size hasn't changed, but bufferData is fine for now
        // since we are likely streaming new dynamic data every frame anyway (due to pan/zoom).
        // To avoid re-allocation, we only upload the part we used.
        gl.bufferData(gl.ARRAY_BUFFER, this.dataArray, gl.DYNAMIC_DRAW);

        // Draw Instanced!
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, events.length);

        gl.bindVertexArray(null);
    }

    destroy() {
        const gl = this.ctx.gl;
        gl.deleteBuffer(this.instanceBuffer);
        gl.deleteVertexArray(this.vao);
        gl.deleteProgram(this.program);
    }
}
