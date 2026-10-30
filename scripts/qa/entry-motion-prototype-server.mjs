import { createServer } from 'vite';
const server = await createServer({ server: { host: '0.0.0.0', port: 5194, strictPort: true } });
await server.listen();
console.log('Visual prototype: http://127.0.0.1:5194/fjord-play?motionPrototype=318&variant=layered');
server.printUrls();
