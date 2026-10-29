/** Export-only inspection of the existing context. Never called from a frame or poll. */
export function performanceRendererInfo(gl?: WebGL2RenderingContext) {
    if (!gl) return { status: 'unavailable' as const };
    try {
        if (gl.isContextLost()) return { status: 'context-lost' as const };
        const canvas = gl.canvas;
        const rect = 'getBoundingClientRect' in canvas ? canvas.getBoundingClientRect() : null;
        const attributes = gl.getContextAttributes();
        return {
            status: 'available' as const,
            api: parameterString(gl, gl.VERSION),
            vendor: parameterString(gl, gl.VENDOR),
            renderer: parameterString(gl, gl.RENDERER),
            identity: rendererIdentity(gl),
            drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
            canvasSize: [canvas.width, canvas.height],
            cssSize: rect ? [rect.width, rect.height] : null,
            attributes: attributes ? {
                antialias: attributes.antialias,
                alpha: attributes.alpha,
                depth: attributes.depth,
                stencil: attributes.stencil,
                powerPreference: attributes.powerPreference,
                failIfMajorPerformanceCaveat: attributes.failIfMajorPerformanceCaveat,
            } : null,
        };
    } catch {
        // Lost/disposed contexts and browser privacy restrictions must not break export.
        return { status: 'unavailable' as const };
    }
}

function parameterString(gl: WebGL2RenderingContext, parameter: number): string | null {
    try {
        const value: unknown = gl.getParameter(parameter);
        return typeof value === 'string' ? value.slice(0, 256) : null;
    } catch { return null; }
}

function rendererIdentity(gl: WebGL2RenderingContext) {
    try {
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        if (!extension) return { status: 'unsupported-or-hidden' as const, vendor: null, renderer: null };
        const vendor = parameterString(gl, extension.UNMASKED_VENDOR_WEBGL);
        const renderer = parameterString(gl, extension.UNMASKED_RENDERER_WEBGL);
        return { status: vendor && renderer ? 'available' as const : 'unavailable' as const, vendor, renderer };
    } catch {
        return { status: 'unavailable' as const, vendor: null, renderer: null };
    }
}
