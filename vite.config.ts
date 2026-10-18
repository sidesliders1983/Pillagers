import { defineConfig } from 'vite';
import { readFileSync, existsSync, cpSync, mkdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';

// Scenery is committed in public/. Only the locked Three.js decoder needs a build copy.
export default defineConfig({
    optimizeDeps: {
        entries: [
            'index.html', 'src/core/Game.ts', 'src/environment-lab/EnvironmentLab.ts',
            'src/play/PlayUI.ts', 'src/gameplay-lab/GameplayLab.ts', 'src/character-lab/CharacterLab.ts',
            'src/character-lab/MeshyCharacterLab.ts', 'src/asset-lab/AssetLab.ts'
        ],
        include: [
            'three', 'three/addons/loaders/GLTFLoader.js', 'three/addons/controls/OrbitControls.js'
        ]
    },
    server: { watch: { ignored: ['**/tools/**', '**/scratch/**', '**/artifacts/**'] } },
    plugins: [{
        name: 'three-draco-decoder',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = (req.url ?? '').split('?')[0];
                if (!url.startsWith('/draco/')) return next();
                const root = resolve('node_modules/three/examples/jsm/libs/draco/gltf');
                const path = resolve(root, decodeURIComponent(url.slice('/draco/'.length)));
                if (!path.startsWith(root + sep) || !existsSync(path)) return next();
                res.setHeader('Content-Type', path.endsWith('.wasm')
                    ? 'application/wasm' : 'application/javascript');
                res.end(readFileSync(path));
            });
        },
        writeBundle(options) {
            const output = options.dir ?? 'dist';
            mkdirSync(output, { recursive: true });
            cpSync('node_modules/three/examples/jsm/libs/draco/gltf', resolve(output, 'draco'), {
                recursive: true
            });
        }
    }]
});
