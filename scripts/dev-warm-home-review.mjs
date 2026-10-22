import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Keep a separate review origin; explicit URL comparisons use the production defaults.
const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { host: '0.0.0.0', port: 5229, strictPort: true },
});
await server.listen();
server.printUrls();
