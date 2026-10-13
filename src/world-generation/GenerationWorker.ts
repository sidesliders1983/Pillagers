import { runGenerationTask } from './GenerationTask';
import type { GenerationRequestMessage, GenerationResponse } from './GenerationClient';

const worker = self as unknown as {
    onmessage: (event: MessageEvent<GenerationRequestMessage>) => void;
    postMessage(message: GenerationResponse, transfer?: Transferable[]): void;
};
worker.onmessage = ({ data: { id, task } }) => {
    try {
        const result = runGenerationTask(task, event => {
            const transfer = event.type === 'preview' ?
                [event.preview.heights.buffer, event.preview.ground.buffer] as ArrayBuffer[] : [];
            worker.postMessage({ id, ...event }, transfer);
        });
        // The final immutable proposal crosses the boundary once. Canonical number arrays and
        // save format stay unchanged; only the disposable previews use transferable buffers.
        const start = performance.now();
        const jsonBytes = task.profile ? new TextEncoder().encode(JSON.stringify(result)).byteLength : null;
        worker.postMessage({ id, type: 'transport', jsonBytes, serializationMs: performance.now() - start,
            sentAt: performance.timeOrigin + performance.now() });
        worker.postMessage({ id, type: 'result', result });
    } catch (error) {
        worker.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
};
