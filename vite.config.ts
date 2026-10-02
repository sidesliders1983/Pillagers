import { defineConfig } from 'vite';
import { readFileSync, existsSync, cpSync, mkdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
// Serve the original local kit without relocating or tracking third-party files.
export default defineConfig({
    optimizeDeps: { entries: ['index.html'], include: ['three', 'three/addons/loaders/GLTFLoader.js', 'three/addons/controls/OrbitControls.js'] },
    server: { watch: { ignored: ['**/tools/**', '**/scratch/**', '**/artifacts/**'] } },
    plugins: [{ name: 'local-world-assets',
            configureServer(server) {
                server.middlewares.use((req, res, next) => {
                    const url = (req.url ?? '').split('?')[0];
                    const root = url.startsWith('/assets/') ? resolve('Assets') : url.startsWith('/draco/') ? resolve('node_modules/three/examples/jsm/libs/draco/gltf') : null;
                    if (!root)
                        return next();
                    const path = resolve(root, decodeURIComponent(url.replace(/^\/(assets|draco)\//, '')));
                    if (!path.startsWith(root + sep) || !existsSync(path))
                        return next();
                    res.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'application/javascript' : 'model/gltf-binary');
                    res.end(readFileSync(path));
                });
            },
            closeBundle() {
                mkdirSync('dist', { recursive: true });
                if(existsSync('Assets'))cpSync('Assets', 'dist/assets', { recursive: true });
                else console.warn('Local scenery kit absent: Character Lab builds normally; supply licensed Assets/ to run the World.');
                cpSync('node_modules/three/examples/jsm/libs/draco/gltf', 'dist/draco', { recursive: true });
            }
        }] });
