const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
    const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
    try {
        const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto((process.env.PROTOTYPE_URL||'http://127.0.0.1:4175')+'/character-lab');
        await page.waitForFunction(()=>document.querySelector('#lab-status')?.textContent.includes('one shared rig'));
        const slider=async(id,value)=>page.locator(id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
        const profile=async()=>JSON.parse(await page.locator('#lab-phenotype').textContent()).universalHuman;
        await slider('#lab-seed',0);await slider('#trait-intelligence',0);
        const heavy=await profile();assert.ok(heavy.weights.Overweight>.65);assert.equal(heavy.weights.Underweight,0);
        await page.waitForTimeout(600);await page.locator('#lab-preview').screenshot({path:'artifacts/human-overweight.png'});
        await page.getByRole('button',{name:'Pin comparison',exact:true}).click();
        await slider('#trait-intelligence',100);const balanced=await profile();
        assert.equal(balanced.weightDeviation,0);assert.equal(balanced.weights.Powerful,heavy.weights.Powerful);
        await page.waitForTimeout(600);await page.locator('#lab-preview').screenshot({path:'artifacts/human-weight-comparison.png'});
        await page.getByRole('button',{name:'Remove',exact:true}).click();
        await slider('#lab-seed',3);await slider('#trait-intelligence',0);
        const thin=await profile();assert.ok(thin.weights.Underweight>.65);assert.equal(thin.weights.Overweight,0);
        await page.waitForTimeout(600);await page.locator('#lab-preview').screenshot({path:'artifacts/human-underweight.png'});
        await slider('#trait-intelligence',100);await slider('#lab-masculinity',0);
        await page.waitForTimeout(500);await page.locator('#lab-preview').screenshot({path:'artifacts/human-feminine.png'});
        await slider('#lab-age',100);assert.equal((await profile()).weights.Age,1);
        await page.waitForTimeout(500);await page.locator('#lab-preview').screenshot({path:'artifacts/human-slouch.png'});
        assert.equal(await page.getByRole('button',{name:'Heavy',exact:true}).count(),0);
        assert.equal(await page.locator('#lab-height').getAttribute('max'),'160');
        assert.deepEqual(errors,[]);console.log('PASS: seeded overweight/underweight, intelligence balance, independent muscle axis and pinned comparison.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});


