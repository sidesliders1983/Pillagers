import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const roots = {A:path.resolve('../three-r187-spike-323-baseline'), B:path.resolve('.')};
const fixture = fs.readFileSync('docs/qa/three-r187-323/fixtures/settlement-expedition.json');
for (const [arm, root] of Object.entries(roots)) {
    const directory = path.join(root,'dist/qa/three-r187-323');
    fs.mkdirSync(directory,{recursive:true});
    fs.copyFileSync('docs/qa/three-r187-323/review/index.html',path.join(directory,'index.html'));
    fs.copyFileSync('src/ui/fjord-theme.css',path.join(directory,'fjord-theme.css'));
    fs.writeFileSync(path.join(directory,'settlement-expedition.json'),fixture);
    fs.writeFileSync(path.join(directory,'review-build.json'),JSON.stringify({arm,
        engineVersion:JSON.parse(fs.readFileSync(path.join(root,'node_modules/three/package.json'))).version,
        commit:JSON.parse(fs.readFileSync(path.join(root,'dist/build-info.json'),'utf8')).source.commit,
        checkoutCommit:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),
        fixtureSHA256:createHash('sha256').update(fixture).digest('hex')}));
}
console.log('Staged identical QA wrapper and fixture beside both compiled previews. Game bundles unchanged.');
