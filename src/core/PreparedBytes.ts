/** Native streaming inflation with an exact output bound from the committed asset catalog. */
export async function unpackPreparedBytes(compressed: ArrayBuffer, expectedBytes: number) {
    if (typeof DecompressionStream !== 'function')
        throw new Error('This browser cannot unpack prepared assets. Please update your browser.');
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const output = new Uint8Array(expectedBytes);
    let received = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done) break;
            if (received + next.value.byteLength > output.byteLength)
                throw new Error('Prepared asset exceeds its declared size.');
            output.set(next.value, received);
            received += next.value.byteLength;
        }
    } finally { await reader.cancel(); }
    if (received !== output.byteLength) throw new Error('Prepared asset is incomplete.');
    return output.buffer;
}
