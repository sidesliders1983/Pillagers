const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {readFileSync}=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
    const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
    try{
        const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto((process.env.PROTOTYPE_URL||'http://127.0.0.1:4175')+'/character-lab');await page.waitForFunction(()=>document.querySelector('#lab-status')?.textContent.includes('one shared rig'));
        await page.locator('.lab-json > summary').click();
        await page.locator('#fit-hair').fill('120');await page.locator('#fit-hair').dispatchEvent('input');
        await page.locator('#fit-clothing').fill('110');await page.locator('#fit-clothing').dispatchEvent('input');
        for(const age of [6,35,90]){
            await page.locator('#lab-age').fill(String(age));await page.locator('#lab-age').dispatchEvent('input');await page.waitForTimeout(300);
            const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export character GLB',exact:true}).click();
            const file=await download;await file.saveAs(`artifacts/character-age-${age}.glb`);
            const bytes=readFileSync(`artifacts/character-age-${age}.glb`),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length));
            assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
            assert.deepEqual(json.nodes.find(n=>n.extras?.universalHumanProfile)?.extras.universalHumanProfile.appearanceFit,{hair:1.2,beard:1,clothing:1.1});
            assert.ok(json.skins.length>0);assert.ok(json.nodes.some(n=>n.name==='Head'));assert.ok(json.nodes.some(n=>n.name==='HairCap'));assert.ok(json.nodes.some(n=>n.name==='ClothingWaistWrap'));
            assert.deepEqual(json.animations.map(a=>a.name).sort(),['Idle','Run','Walk']);
            const body=json.meshes.find(m=>m.extras?.targetNames?.includes('Child'));assert.ok(body);
            assert.equal(body.weights[body.extras.targetNames.indexOf('Child')],age===6?1:0);
        }
        assert.deepEqual(errors,[]);console.log('PASS: child/adult/elder GLBs exported with shared rig, morph weights, appearance, garment and three clips.');
    }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
