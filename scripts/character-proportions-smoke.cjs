const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const dna={seed:1731203494,sex:"female",age:37,traits:{physicality:.42,agility:1,intelligence:.01,cunning:.85,temperament:.91},heritage:{scandinavian:.08662437355074398,angloSaxon:.18462755635531963,gaelic:.2341570529372296,finnic:.11036877115601645,sami:.21732351112642678,baltic:.16689873487426365},morphology:{masculinity:.19,height:1.3315829434245825}};
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
                await p.locator('#lab-preview').screenshot({path:`artifacts/proportions-${lod}-${clip}.png`});
            }
        }
        assert.deepEqual(errors,[]);console.log('PASS: seed 1731203494 imported and checked across three LODs and three clips.');
    }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
