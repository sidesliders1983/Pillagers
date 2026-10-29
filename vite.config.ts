import { defineConfig } from 'vite';
import { readFileSync, existsSync, cpSync, mkdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

function sourceBuild() {
    try {
        // Sites builds an exported main snapshot without its own .git directory.
        if (existsSync('.sites-main.json')) {
            const source = JSON.parse(readFileSync('.sites-main.json', 'utf8'));
            if (source.branch === 'main' && /^[a-f0-9]{40}$/.test(source.commit))
                return source.commit + '-sites-main';
        }
        const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
        return head + (dirty ? '-dirty' : '');
    } catch { return 'unidentified-source'; }
}

// Scenery is committed in public/. Only the locked Three.js decoder needs a build copy.
export default defineConfig({
    define: {
        'globalThis.__FJORD_BUILD__': JSON.stringify(sourceBuild()),
        'globalThis.__FJORD_FEEDBACK_URL__': JSON.stringify(process.env.FJORD_FEEDBACK_URL ?? ''),
    },
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
    server: {
        watch: {
            // A worktree can live under scratch; ignore only this project's generated folders.
            ignored: ['tools', 'scratch', 'artifacts'].map(directory =>
                resolve(directory).split(sep).join('/') + '/**'),
        },
    },
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
