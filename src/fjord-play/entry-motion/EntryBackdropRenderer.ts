import fragmentSource from './entry-motion.frag?raw';
import { entryMotionPreset } from './EntryMotionPreset';

export interface EntryBackdrop {
    ready: Promise<void>;
    mount(): void;
    resize(): void;
    setPaused(paused: boolean): void;
    dispose(): void;
}

/** One decorative quad. No game renderer, model, audio, clock or simulation imports. */
export function createEntryBackdrop(onFailure: () => void): EntryBackdrop {
    const layer = document.createElement('div');
    layer.className = 'entry-motion-layer';
    layer.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    layer.append(canvas);
    document.body.prepend(layer);
    let gl: WebGLRenderingContext | null;
    try {
        gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false,
            stencil: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    } catch { gl = null; }
    if (!gl || typeof createImageBitmap !== 'function') {
        layer.remove();
        throw new Error('Decorative rendering unavailable.');
    }
    const context = gl;
    const abort = new AbortController();
    const shaders: WebGLShader[] = [];
    const textures: WebGLTexture[] = [];
    const program = context.createProgram()!;
    const buffer = context.createBuffer()!;
    let disposed = false, loaded = false, paused = document.hidden;
    let request = 0, lastFrame = 0, phase = 0;

    function compile(type: number, source: string) {
        const shader = context.createShader(type)!;
        shaders.push(shader);
        context.shaderSource(shader, source);
        context.compileShader(shader);
        if (!context.getShaderParameter(shader, context.COMPILE_STATUS))
            throw new Error('Decorative shader unavailable.');
        context.attachShader(program, shader);
    }
    try {
        compile(context.VERTEX_SHADER, 'attribute vec2 a_position; varying vec2 v_top; void main(){gl_Position=vec4(a_position,0.,1.);v_top=vec2(a_position.x*.5+.5,.5-a_position.y*.5);}');
        compile(context.FRAGMENT_SHADER, fragmentSource);
        context.linkProgram(program);
        if (!context.getProgramParameter(program, context.LINK_STATUS))
            throw new Error('Decorative program unavailable.');
    } catch (error) { dispose(); throw error; }
    context.useProgram(program);
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(context.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), context.STATIC_DRAW);
    const position = context.getAttribLocation(program, 'a_position');
    context.enableVertexAttribArray(position);
    context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);
    const view = context.getUniformLocation(program, 'u_view');
    const time = context.getUniformLocation(program, 'u_time');
    // Only the approved rendered treatment ships; there is no runtime variant/tuning surface.
    context.uniform1f(context.getUniformLocation(program, 'u_variant'), 1);
    for (const [key, value] of Object.entries(entryMotionPreset))
        context.uniform1f(context.getUniformLocation(program, 'u_' + key), value);

    function resize() {
        if (disposed) return;
        const { width, height } = layer.getBoundingClientRect();
        const scale = Math.min(1, 1280 / width, Math.sqrt(900_000 / (width * height)));
        canvas.width = Math.max(1, Math.floor(width * scale));
        canvas.height = Math.max(1, Math.floor(height * scale));
        context.viewport(0, 0, canvas.width, canvas.height);
        context.uniform2f(view, width, height);
    }
    function draw(now: number) {
        if (disposed || paused || !loaded) return;
        request = requestAnimationFrame(draw);
        if (now - lastFrame < 1000 / 30 - .1) return;
        phase += lastFrame ? Math.min(.1, (now - lastFrame) / 1000) : 0;
        lastFrame = now;
        context.uniform1f(time, phase);
        context.drawArrays(context.TRIANGLES, 0, 6);
    }
    function setPaused(value: boolean) {
        if (disposed) return;
        paused = value;
        cancelAnimationFrame(request);
        lastFrame = 0;
        if (loaded && !paused) {
            resize();
            request = requestAnimationFrame(draw);
        }
    }
    function lost(event: Event) {
        event.preventDefault();
        if (disposed) return;
        dispose();
        onFailure();
    }
    canvas.addEventListener('webglcontextlost', lost);
    function dispose() {
        if (disposed) return;
        disposed = true;
        abort.abort();
        cancelAnimationFrame(request);
        canvas.removeEventListener('webglcontextlost', lost);
        for (const texture of textures) context.deleteTexture(texture);
        for (const shader of shaders) context.deleteShader(shader);
        context.deleteBuffer(buffer);
        context.deleteProgram(program);
        context.getExtension('WEBGL_lose_context')?.loseContext();
        layer.remove();
    }
    async function bitmap(url: string, width: number) {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                image.onload = image.onerror = null;
                abort.signal.removeEventListener('abort', cancelled);
            };
            const cancelled = () => {
                cleanup();
                image.src = '';
                reject(new DOMException('Disposed', 'AbortError'));
            };
            image.onload = () => { cleanup(); resolve(); };
            image.onerror = () => { cleanup(); reject(new Error('Decorative asset unavailable.')); };
            abort.signal.addEventListener('abort', cancelled, { once: true });
            image.src = url;
        });
        const natural = { width: image.naturalWidth, height: image.naturalHeight };
        const pixels = await createImageBitmap(image, { resizeWidth: Math.min(width, natural.width),
            resizeHeight: Math.round(natural.height * Math.min(1, width / natural.width)), resizeQuality: 'high' });
        if (disposed) { pixels.close(); throw new DOMException('Disposed', 'AbortError'); }
        return { pixels, ...natural };
    }
    function upload(pixels: ImageBitmap, unit: number, uniform: string) {
        try {
            const texture = context.createTexture()!;
            textures.push(texture);
            context.activeTexture(context.TEXTURE0 + unit);
            context.bindTexture(context.TEXTURE_2D, texture);
            context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
            context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
            context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
            context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
            context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, pixels);
            context.uniform1i(context.getUniformLocation(program, uniform), unit);
        } finally { pixels.close(); }
    }
    const ready = (async () => {
        const photo = await bitmap('/branding/fjordside/start/fjordside-twilight-2560.webp', 1280);
        context.uniform2f(context.getUniformLocation(program, 'u_photoSize'), photo.width, photo.height);
        upload(photo.pixels, 0, 'u_photo');
        const mask = await bitmap('/branding/fjordside/start/motion-mask.png', 1024);
        upload(mask.pixels, 1, 'u_land');
        if (disposed) return;
        loaded = true;
        layer.dataset.ready = 'true';
        setPaused(paused || document.hidden);
    })().catch(error => { dispose(); throw error; });
    return { ready, resize, setPaused, dispose,
        mount() { if (!disposed && !layer.isConnected) document.body.prepend(layer); } };
}
