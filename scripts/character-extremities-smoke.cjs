const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const dna={seed:473419265,sex:'male',age:69,
    traits:{physicality:.85,agility:.71,intelligence:.64,cunning:.62,temperament:.51},
    heritage:{scandinavian:.02634916372441003,angloSaxon:.3013317994437168,gaelic:.07890730678594979,finnic:.253154260335531,sami:.11157312731636208,baltic:.22868434239403038}};
(async()=>{
    const b=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
    try{
        const p=await b.newPage({viewport:{width:1440,height:1080}}),errors=[];
        p.on('pageerror',e=>errors.push(e.message));
        await p.goto((process.env.PROTOTYPE_URL||'http://127.0.0.1:4175')+'/character-lab');
        await p.waitForFunction(()=>document.querySelector('#lab-status')?.textContent.includes('one shared rig'));
        await p.locator('.lab-json > summary').click();
        await p.locator('#lab-json').fill(JSON.stringify(dna));
        await p.getByRole('button',{name:'Apply JSON',exact:true}).click();
        assert.equal(JSON.parse(await p.locator('#lab-json').inputValue()).seed,dna.seed);
        for(const lod of ['LOD0','LOD1','LOD2']){
            await p.getByRole('button',{name:lod,exact:true}).click();
            await p.waitForFunction(lod=>document.querySelector('#lab-status')?.textContent.includes(lod+' ·'),lod);
            for(const clip of ['Idle','Walk','Run']){
                await p.getByRole('button',{name:clip,exact:true}).click();await p.waitForTimeout(500);
                await p.locator('#lab-preview').screenshot({path:`artifacts/rigid-extremities-${lod}-${clip}.png`});
            }
        }
        assert.deepEqual(errors,[]);console.log('PASS: seed 473419265 imported and checked across three LODs and three clips.');
    }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
