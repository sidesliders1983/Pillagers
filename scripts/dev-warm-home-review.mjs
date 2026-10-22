import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Opt-in test server: ordinary game links exercise the candidate on this origin.
// A production build still requires explicit homes=warm-v1 until visual acceptance.
const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    define: { 'import.meta.env.VITE_WARM_HOME_PREVIEW': JSON.stringify('true') },
    server: { host: '0.0.0.0', port: 5229, strictPort: true },
});
await server.listen();
server.printUrls();
