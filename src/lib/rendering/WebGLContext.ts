/**
 * WebGL Context Manager
 *
 * Handles WebGL initialization and provides utility functions.
 * Uses WebGL 2 for instanced rendering support.
 */
export class WebGLContext {
    public gl: WebGL2RenderingContext;
    public canvas: HTMLCanvasElement;
    private dpr: number = 1;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;

        // Request WebGL 2 context
        const gl = canvas.getContext('webgl2', {
            alpha: false, // No transparency in canvas
            antialias: true, // Smooth edges
            premultipliedAlpha: false,
            preserveDrawingBuffer: false
        });

        if (!gl) {
            throw new Error('WebGL 2 not supported. Please use a modern browser.');
        }

        this.gl = gl;

        // Initial setup
        this.setupGL();

        // Initial resize to handle DPI correctly
        this.resize();
    }

    private setupGL() {
        const gl = this.gl;

        // Enable blending for transparent events
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // No depth testing needed (2D rendering)
        gl.disable(gl.DEPTH_TEST);
    }

    /**
     * COMPILE SHADER
     *
     * @param type - gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
     * @param source - GLSL source code
     * @returns Compiled shader
     */
    compileShader(type: number, source: string): WebGLShader {
        const gl = this.gl;
        const shader = gl.createShader(type)!;

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        // Check for errors
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Shader compile error: ${log}`);
        }

        return shader;
    }

    /**
     * CREATE SHADER PROGRAM
     *
     * Links vertex and fragment shaders into a program.
     */
    createProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
        const gl = this.gl;

        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

        const program = gl.createProgram()!;
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        // Check for errors
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(`Program link error: ${log}`);
        }

        // Clean up shaders (they're part of the program now)
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        return program;
    }

    /**
     * RESIZE canvas to match display size with devicePixelRatio support.
     *
     * IMPORTANT: This handles Retina/high-DPI displays properly.
     * The canvas internal resolution is scaled by devicePixelRatio
     * while CSS keeps it at the display size.
     * 
     * Returns true if size changed.
     */
    resize(): boolean {
        const canvas = this.canvas;

        // Get the device pixel ratio (2 on Retina, 3 on some phones, etc.)
        const dpr = window.devicePixelRatio || 1;
        this.dpr = dpr;

        // Get the CSS display size
        const displayWidth = canvas.clientWidth;
        const displayHeight = canvas.clientHeight;

        // Calculate the actual pixel size needed
        const pixelWidth = Math.round(displayWidth * dpr);
        const pixelHeight = Math.round(displayHeight * dpr);

        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            // Set the canvas buffer size to the actual pixel size
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;

            // Set the viewport to match
            this.gl.viewport(0, 0, pixelWidth, pixelHeight);

            return true;
        }

        return false;
    }

    /**
     * Get the current device pixel ratio
     */
    getDevicePixelRatio(): number {
        return this.dpr;
    }

    /**
     * CLEAR the canvas
     */
    clear(r: number, g: number, b: number, a: number = 1) {
        const gl = this.gl;
        gl.clearColor(r, g, b, a);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }
}
