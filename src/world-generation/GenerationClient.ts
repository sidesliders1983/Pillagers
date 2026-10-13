import type { GeneratedResult, GenerationProgress, GenerationTask } from './GenerationTask';

export interface GenerationRequestMessage { id: number; task: GenerationTask }
export type GenerationResponse = ({ id: number } & GenerationProgress) |
    { id: number; type: 'result'; result: GeneratedResult } |
    { id: number; type: 'error'; message: string };
export interface GenerationPort {
    postMessage(message: GenerationRequestMessage): void;
    terminate(): void;
    onmessage: ((event: MessageEvent<GenerationResponse>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
}
/** One owner, one worker. Termination interrupts even a long synchronous generator phase. */
export class GenerationClient {
    private revision = 0;
    private abort?: () => void;
    private disposed = false;
    constructor(private readonly createWorker: () => GenerationPort, private readonly timeoutMs = 240000) {}

    generate(task: GenerationTask, progress: (event: GenerationProgress) => void = () => {}): Promise<GeneratedResult> {
        this.cancel();
        if (this.disposed) return Promise.reject(new Error('Generation client is disposed.'));
        const id = ++this.revision;
        return new Promise((resolve, reject) => {
            let port: GenerationPort;
            try { port = this.createWorker(); }
            catch (error) { reject(error); return; }
            let settled = false;
            const finish = (error?: Error, result?: GeneratedResult) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                port.terminate();
                if (id === this.revision) this.abort = undefined;
                if (error) reject(error);
                else resolve(result!);
            };
            const timeout = setTimeout(() => finish(new Error('Island generation timed out. Please retry.')), this.timeoutMs);
            this.abort = () => finish(new DOMException('Island generation cancelled.', 'AbortError'));
            port.onmessage = ({ data }) => {
                if (settled || id !== this.revision || data.id !== id) return;
                if (data.type === 'result') finish(undefined, data.result);
                else if (data.type === 'error') finish(new Error(data.message));
                else progress(data);
            };
            port.onerror = event => {
                event.preventDefault();
                finish(new Error(event.message || 'The generation worker could not start. Please retry.'));
            };
            try { port.postMessage({ id, task }); }
            catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
        });
    }
    cancel() { this.abort?.(); this.abort = undefined; this.revision++; }
    dispose() { this.cancel(); this.disposed = true; }
}
