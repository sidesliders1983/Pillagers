// THROWAWAY #318: one isolated quad; no Three.js, scene, game clock or model imports.
import fragmentSource from './motion.frag?raw';

export interface BackdropStats {
    frames: number; pixels: number; cpuP95: number; paused: boolean; phase: number; renderer: string;
}

export function createBackdrop(host: HTMLElement, variant: string, failed: (error: unknown) => void) {
    const layer = document.createElement('div');
    layer.className = 'entry-motion-layer';
    layer.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    layer.append(canvas);
    host.prepend(layer);
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false,
        stencil: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl || typeof createImageBitmap === 'undefined') { layer.remove(); throw new Error('Graphics unavailable'); }
    const abort = new AbortController();
    const textures: WebGLTexture[] = [], shaders: WebGLShader[] = [];
    const times: number[] = [];
    let disposed = false, ready = false, paused = document.hidden, frame = 0, last = 0, phase = 0, frames = 0;
    const program = gl.createProgram()!;
    const buffer = gl.createBuffer()!;
    function shader(type: number, source: string) {
        const value = gl!.createShader(type)!;
        shaders.push(value);
        gl!.shaderSource(value, source);
        gl!.compileShader(value);
        if (!gl!.getShaderParameter(value, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(value) ?? 'Shader unavailable');
        gl!.attachShader(program, value);
    }
    try {
        shader(gl.VERTEX_SHADER, 'attribute vec2 a_position; varying vec2 v_top; void main(){gl_Position=vec4(a_position,0.,1.);v_top=vec2(a_position.x*.5+.5,.5-a_position.y*.5);}');
        shader(gl.FRAGMENT_SHADER, fragmentSource);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Program unavailable');
    } catch (error) { dispose(); throw error; }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const view = gl.getUniformLocation(program, 'u_view'), time = gl.getUniformLocation(program, 'u_time');
    gl.uniform1f(gl.getUniformLocation(program, 'u_variant'), variant === 'rendered' ? 1 : 0);
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'Unavailable';
    function resize() {
        if (disposed || paused) return;
        const width = innerWidth, height = innerHeight;
        const scale = Math.min(1, 1280 / width, Math.sqrt(900000 / (width * height)));
        canvas.width = Math.max(1, Math.floor(width * scale));
        canvas.height = Math.max(1, Math.floor(height * scale));
        gl!.viewport(0, 0, canvas.width, canvas.height);
        gl!.uniform2f(view, width, height);
    }
    function draw(now: number) {
        if (disposed || paused || !ready) return;
        frame = requestAnimationFrame(draw);
        if (now - last < 1000 / 30 - .1) return;
        const started = performance.now();
        phase += last ? Math.min(.1, (now - last) / 1000) : 0;
        last = now;
        gl!.uniform1f(time, phase);
        gl!.drawArrays(gl!.TRIANGLES, 0, 6);
        frames++;
        times.push(performance.now() - started);
        if (times.length > 900) times.shift();
    }
    function setPaused(value: boolean) {
        paused = value;
        cancelAnimationFrame(frame);
        last = 0;
        if (!paused && ready && !disposed) { resize(); frame = requestAnimationFrame(draw); }
    }
    function lost(event: Event) { event.preventDefault(); if (!disposed) { dispose(); failed(new Error('Graphics context lost')); } }
    canvas.addEventListener('webglcontextlost', lost);
    function dispose() {
        if (disposed) return;
        disposed = true;
        abort.abort();
        cancelAnimationFrame(frame);
        canvas.removeEventListener('webglcontextlost', lost);
        for (const texture of textures) gl?.deleteTexture(texture);
        for (const value of shaders) gl?.deleteShader(value);
        gl?.deleteBuffer(buffer);
        gl?.deleteProgram(program);
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
        layer.remove();
    }
    async function bitmap(url: string, width: number) {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                image.onload = null;
                image.onerror = null;
                abort.signal.removeEventListener('abort', cancelled);
            };
            const cancelled = () => {
                cleanup();
                image.src = '';
                reject(new DOMException('Disposed', 'AbortError'));
            };
            image.onload = () => { cleanup(); resolve(); };
            image.onerror = () => { cleanup(); reject(new Error('Decorative image unavailable')); };
            abort.signal.addEventListener('abort', cancelled, { once: true });
            image.src = url;
        });
        const result = await createImageBitmap(image, { resizeWidth: Math.min(width, image.naturalWidth),
            resizeHeight: Math.round(image.naturalHeight * Math.min(1, width / image.naturalWidth)), resizeQuality: 'high' });
        if (disposed) { result.close(); throw new DOMException('Disposed', 'AbortError'); }
        return { result, width: image.naturalWidth, height: image.naturalHeight };
    }
    const loaded = (async () => {
        const photo = await bitmap('/branding/fjordside/start/fjordside-twilight-2560.webp', 1280);
        gl!.uniform2f(gl!.getUniformLocation(program, 'u_photoSize'), photo.width, photo.height);
        function texture(data: ImageBitmap, index: number, uniform: string) {
            const value = gl!.createTexture()!;
            textures.push(value);
            gl!.activeTexture(gl!.TEXTURE0 + index);
            gl!.bindTexture(gl!.TEXTURE_2D, value);
            gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
            gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
            gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
            gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
            gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, data);
            gl!.uniform1i(gl!.getUniformLocation(program, uniform), index);
            data.close();
        }
        texture(photo.result, 0, 'u_photo');
        const mask = await bitmap('/src/fjord-play/prototypes/entry-motion-318/land-mask.png', 1024);
        texture(mask.result, 1, 'u_land');
        if (disposed) return;
        ready = true;
        layer.dataset.ready = 'true';
        setPaused(document.hidden);
    })().catch(error => { if (!disposed) { dispose(); failed(error); } });
    return { dispose, resize, setPaused, loaded,
        stats(): BackdropStats {
            const sorted = [...times].sort((a, b) => a - b);
            return { frames, pixels: canvas.width * canvas.height, cpuP95: sorted[Math.floor(sorted.length * .95)] ?? 0,
                paused, phase, renderer };
        } };
}
