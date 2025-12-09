/**
 * SeasonsWebGLRenderer - Renders seasons overlay using WebGL
 * 
 * Displays seasonal colors (spring, summer, autumn, winter) at year/month zoom levels.
 * Uses GPU instanced rendering for smooth gradients between seasons.
 * Hemisphere-aware: seasons are inverted for southern hemisphere.
 */

import type { ViewportState } from '$lib/types/Event';
import type { WebGLContext } from './WebGLContext';

// Reuse the same shaders as DayNightWebGLRenderer
const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;

in vec4 a_instancePosSize;
in vec4 a_colorLeft;
in vec4 a_colorRight;

uniform vec2 u_viewportSize;

out vec4 v_colorLeft;
out vec4 v_colorRight;
out float v_gradientPos;

void main() {
    vec2 pos = a_instancePosSize.xy;
    vec2 size = a_instancePosSize.zw;
    
    vec2 pixelPos = a_position * size + pos;
    vec2 clipPos = (pixelPos / u_viewportSize) * 2.0;
    
    gl_Position = vec4(clipPos, 0.0, 1.0);
    
    v_colorLeft = a_colorLeft;
    v_colorRight = a_colorRight;
    v_gradientPos = a_position.x + 0.5;
}
`;

// Fragment shader with global opacity uniform for uniform fade
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_colorLeft;
in vec4 v_colorRight;
in float v_gradientPos;

uniform float u_opacity;

out vec4 fragColor;

void main() {
    vec4 color = mix(v_colorLeft, v_colorRight, v_gradientPos);
    fragColor = vec4(color.rgb, color.a * u_opacity);
}
`;

const FLOATS_PER_INSTANCE = 12;

// Season colors (RGBA, values 0-1) - Higher saturation for contrast
const SPRING_COLOR = [0.75, 0.95, 0.75, 1.0];   // Vivid spring green
const SUMMER_COLOR = [1.0, 0.92, 0.70, 1.0];    // Rich golden yellow
const AUTUMN_COLOR = [1.0, 0.85, 0.65, 1.0];    // Deep amber orange
const WINTER_COLOR = [0.78, 0.85, 0.96, 1.0];   // Crisp cool blue

// Fade range for visibility (lower pixelsPerMs = more zoomed out)
const FADE_OUT_END = 1.30e-10;   // 0% opacity when very zoomed out
const FADE_OUT_START = 5.00e-10; // Start fading out when zooming out past this

// Fade out when zooming in past Month view
const FADE_IN_START = 3.00e-7;  // Start fading out (Month view)
const FADE_IN_END = 8.00e-7;    // Fully invisible (Week view)

const DAY_MS = 86_400_000;

// Meteorological seasons (full months)
// Spring: Mar-May, Summer: Jun-Aug, Autumn: Sep-Nov, Winter: Dec-Feb
interface SeasonBoundary {
    month: number;  // 0-indexed
    day: number;
    season: 'spring' | 'summer' | 'autumn' | 'winter';
}

// Northern hemisphere boundaries (southern hemisphere flips seasons)
const NORTHERN_BOUNDARIES: SeasonBoundary[] = [
    { month: 2, day: 1, season: 'spring' },   // March 1
    { month: 5, day: 1, season: 'summer' },   // June 1
    { month: 8, day: 1, season: 'autumn' },   // September 1
    { month: 11, day: 1, season: 'winter' },  // December 1
];

export class SeasonsWebGLRenderer {
    private ctx: WebGLContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private instanceBuffer: WebGLBuffer;
    private instanceData: Float32Array;
    private maxInstances: number;
    private currentInstanceCount: number = 0;

    private uniforms: {
        viewportSize: WebGLUniformLocation | null;
        opacity: WebGLUniformLocation | null;
    };

    // Overlay placement (same as day/night - they blend together across zoom levels)
    private readonly OVERLAY_TOP = 0.05;     // Right below timeline numbers
    private readonly OVERLAY_HEIGHT = 0.024; // Same height as day/night

    constructor(ctx: WebGLContext, maxInstances: number = 10000) {
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
        gl.vertexAttribDivisor(positionLoc, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

        const stride = FLOATS_PER_INSTANCE * 4;

        const posSizeLoc = gl.getAttribLocation(this.program, 'a_instancePosSize');
        gl.enableVertexAttribArray(posSizeLoc);
        gl.vertexAttribPointer(posSizeLoc, 4, gl.FLOAT, false, stride, 0);
        gl.vertexAttribDivisor(posSizeLoc, 1);

        const colorLeftLoc = gl.getAttribLocation(this.program, 'a_colorLeft');
        gl.enableVertexAttribArray(colorLeftLoc);
        gl.vertexAttribPointer(colorLeftLoc, 4, gl.FLOAT, false, stride, 4 * 4);
        gl.vertexAttribDivisor(colorLeftLoc, 1);

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
            viewportSize: gl.getUniformLocation(this.program, 'u_viewportSize'),
            opacity: gl.getUniformLocation(this.program, 'u_opacity')
        };
    }

    /**
     * Calculate opacity based on zoom level.
     * Visible between Month view and ~130 year view.
     * Fades out when zooming in past Month view OR zooming out past ~130 years.
     */
    private calculateOpacity(pixelsPerMs: number): number {
        // Fade out when zooming in too much (past Month view)
        if (pixelsPerMs >= FADE_IN_END) return 0;
        if (pixelsPerMs >= FADE_IN_START) {
            return 1 - (pixelsPerMs - FADE_IN_START) / (FADE_IN_END - FADE_IN_START);
        }

        // Fade out when zooming out too much (past ~130 years visible)
        if (pixelsPerMs <= FADE_OUT_END) return 0;
        if (pixelsPerMs <= FADE_OUT_START) {
            return (pixelsPerMs - FADE_OUT_END) / (FADE_OUT_START - FADE_OUT_END);
        }

        // Fully visible in between
        return 1;
    }

    private timeToX(time: number, viewport: ViewportState, dpr: number): number {
        return (time - viewport.centerTime) * viewport.pixelsPerMs * dpr;
    }

    /**
     * Get season color based on season name
     */
    private getSeasonColor(season: 'spring' | 'summer' | 'autumn' | 'winter'): number[] {
        switch (season) {
            case 'spring': return SPRING_COLOR;
            case 'summer': return SUMMER_COLOR;
            case 'autumn': return AUTUMN_COLOR;
            case 'winter': return WINTER_COLOR;
        }
    }

    /**
     * Get the season boundary date for a given year
     */
    private getSeasonDate(year: number, boundary: SeasonBoundary): Date {
        return new Date(year, boundary.month, boundary.day);
    }

    /**
     * Flip season for southern hemisphere
     */
    private flipSeason(season: 'spring' | 'summer' | 'autumn' | 'winter'): 'spring' | 'summer' | 'autumn' | 'winter' {
        switch (season) {
            case 'spring': return 'autumn';
            case 'summer': return 'winter';
            case 'autumn': return 'spring';
            case 'winter': return 'summer';
        }
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
        canvasHeight: number
    ): void {
        if (this.currentInstanceCount >= this.maxInstances) return;

        if (endTime < viewport.startTime || startTime > viewport.endTime) return;

        const clampedStart = Math.max(startTime, viewport.startTime);
        const clampedEnd = Math.min(endTime, viewport.endTime);

        const startX = this.timeToX(clampedStart, viewport, dpr);
        const endX = this.timeToX(clampedEnd, viewport, dpr);

        const width = endX - startX;
        if (width < 0.5) return;

        const centerX = (startX + endX) / 2;
        const height = this.OVERLAY_HEIGHT * canvasHeight;
        const centerY = (0.5 - this.OVERLAY_TOP - this.OVERLAY_HEIGHT / 2) * canvasHeight;

        const offset = this.currentInstanceCount * FLOATS_PER_INSTANCE;

        this.instanceData[offset + 0] = centerX;
        this.instanceData[offset + 1] = centerY;
        this.instanceData[offset + 2] = width;
        this.instanceData[offset + 3] = height;

        // Colors - opacity is applied via uniform, not per-segment
        this.instanceData[offset + 4] = leftColor[0];
        this.instanceData[offset + 5] = leftColor[1];
        this.instanceData[offset + 6] = leftColor[2];
        this.instanceData[offset + 7] = leftColor[3];

        this.instanceData[offset + 8] = rightColor[0];
        this.instanceData[offset + 9] = rightColor[1];
        this.instanceData[offset + 10] = rightColor[2];
        this.instanceData[offset + 11] = rightColor[3];

        this.currentInstanceCount++;
    }

    /**
     * Update the instance buffer with season segments
     * Uses gradient transitions (1 month blend) between seasons
     */
    private updateInstanceBuffer(
        viewport: ViewportState,
        latitude: number
    ): void {
        const dpr = this.ctx.getDevicePixelRatio();
        const canvasHeight = this.ctx.canvas.height;
        const isNorthern = latitude >= 0;

        this.currentInstanceCount = 0;

        // Transition duration: 30 days of blending at each season boundary
        const TRANSITION_MS = 30 * DAY_MS;
        const HALF_TRANSITION = TRANSITION_MS / 2;

        // Get the range of years we need to cover
        const startDate = new Date(viewport.startTime);
        const endDate = new Date(viewport.endTime);
        const startYear = startDate.getFullYear() - 1;
        const endYear = endDate.getFullYear() + 1;

        // Generate season segments for each year
        for (let year = startYear; year <= endYear; year++) {
            // Get all season boundaries for this year
            const boundaries = NORTHERN_BOUNDARIES.map(b => ({
                time: this.getSeasonDate(year, b).getTime(),
                season: isNorthern ? b.season : this.flipSeason(b.season)
            }));

            // Also get winter from previous year and spring from next year
            const prevWinterBoundary = NORTHERN_BOUNDARIES[3];
            const prevWinter = {
                time: this.getSeasonDate(year - 1, prevWinterBoundary).getTime(),
                season: isNorthern ? prevWinterBoundary.season : this.flipSeason(prevWinterBoundary.season)
            };

            // For each season, render: solid core + gradient to next
            const seasons = [
                { start: prevWinter.time, season: prevWinter.season, next: boundaries[0] },
                { start: boundaries[0].time, season: boundaries[0].season, next: boundaries[1] },
                { start: boundaries[1].time, season: boundaries[1].season, next: boundaries[2] },
                { start: boundaries[2].time, season: boundaries[2].season, next: boundaries[3] },
            ];

            for (const seg of seasons) {
                const currentColor = this.getSeasonColor(seg.season);
                const nextColor = this.getSeasonColor(seg.next.season);

                const solidEnd = seg.next.time - HALF_TRANSITION;
                const gradientEnd = seg.next.time + HALF_TRANSITION;

                // Solid portion of current season
                this.addSegment(
                    seg.start + HALF_TRANSITION, solidEnd,
                    currentColor, currentColor,
                    viewport, dpr, canvasHeight
                );

                // Gradient transition to next season (centered on boundary)
                this.addSegment(
                    solidEnd, gradientEnd,
                    currentColor, nextColor,
                    viewport, dpr, canvasHeight
                );
            }
        }
    }

    /**
     * Render the seasons overlay
     */
    render(viewport: ViewportState, latitude: number): void {
        const opacity = this.calculateOpacity(viewport.pixelsPerMs);

        if (opacity <= 0) return;

        const gl = this.ctx.gl;

        this.updateInstanceBuffer(viewport, latitude);

        if (this.currentInstanceCount === 0) return;

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0,
            this.instanceData.subarray(0, this.currentInstanceCount * FLOATS_PER_INSTANCE));

        // Set uniforms - opacity is applied uniformly to all segments
        gl.uniform2f(this.uniforms.viewportSize, this.ctx.canvas.width, this.ctx.canvas.height);
        gl.uniform1f(this.uniforms.opacity, opacity);

        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.currentInstanceCount);

        gl.bindVertexArray(null);
    }

    dispose(): void {
        const gl = this.ctx.gl;
        gl.deleteBuffer(this.instanceBuffer);
        gl.deleteVertexArray(this.vao);
        gl.deleteProgram(this.program);
    }
}
