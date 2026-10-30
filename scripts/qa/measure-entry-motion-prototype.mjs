// Exploratory browser measurement, not a unit-test or hardware certification.
// Requires an existing Playwright installation; no new dependency is installed.
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
import fs from 'node:fs/promises';
process.env.TEMP=process.env.TMP=process.env.TMPDIR=process.cwd()+'/scratch/entry-motion-318/tmp';
await fs.mkdir(process.env.TEMP, {recursive:true});
const dir='scratch/entry-motion-318/performance';await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:process.env.CHROME_PATH});
const results=[];
for(const variant of ['static','layered','rendered']){
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.addInitScript(()=>{
        window.probe={gpu:[],disjoint:0,timerSupported:false};
        const draw=WebGLRenderingContext.prototype.drawArrays;
        const owners=new WeakMap();
        WebGLRenderingContext.prototype.drawArrays=function(...args){
            let state=owners.get(this);
            if(!state){state={ext:this.getExtension('EXT_disjoint_timer_query'),pending:[],draws:0};owners.set(this,state);window.probe.timerSupported=!!state.ext;}
            const ext=state.ext;
            if(ext){
                if(this.getParameter(ext.GPU_DISJOINT_EXT)){window.probe.disjoint++;for(const q of state.pending)ext.deleteQueryEXT(q);state.pending=[];}
                state.pending=state.pending.filter(q=>{if(!ext.getQueryObjectEXT(q,ext.QUERY_RESULT_AVAILABLE_EXT))return true;window.probe.gpu.push(ext.getQueryObjectEXT(q,ext.QUERY_RESULT_EXT)/1e6);ext.deleteQueryEXT(q);return false;});
                if(state.draws++%30===0){const q=ext.createQueryEXT();ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,q);draw.apply(this,args);ext.endQueryEXT(ext.TIME_ELAPSED_EXT);state.pending.push(q);return;}
            }
            draw.apply(this,args);
        };
    });
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5194/fjord-play?motionPrototype=318&variant='+variant);
    await page.waitForTimeout(2500);
    const ready = await page.evaluate(() => {
        document.querySelector('[data-refresh]').click();
        return JSON.parse(document.documentElement.dataset.motionPrototype);
    });
    if (variant !== 'static' && (ready.canvases !== 1 || ready.frames < 1)) {
        await browser.close();
        throw new Error('No running renderer: ' + variant + ' ' + JSON.stringify(ready));
    }
    const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
    const startMetrics=(await cdp.send('Performance.getMetrics')).metrics;
    await page.evaluate(()=>{
        window.probe.gpu=[];window.probe.disjoint=0;
        window.probe.gaps=[];window.probe.longTasks=[];window.probe.started=performance.now();
        window.probe.observer=new PerformanceObserver(list=>window.probe.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));
        window.probe.observer.observe({type:'longtask'});
        let last=0;
        const step=t=>{if(last)window.probe.gaps.push(t-last);last=t;window.probe.frame=requestAnimationFrame(step);};
        window.probe.frame=requestAnimationFrame(step);
        document.querySelector('[data-refresh]').click();window.probe.first=JSON.parse(document.documentElement.dataset.motionPrototype);
    });
    await page.waitForTimeout(30000);
    const measured=await page.evaluate(()=>{
        cancelAnimationFrame(window.probe.frame);window.probe.observer.disconnect();document.querySelector('[data-refresh]').click();
        const {gpu,disjoint,timerSupported,gaps,longTasks,started,first}=window.probe;
        return {gpu,disjoint,timerSupported,gaps,longTasks,started,elapsed:performance.now()-started,first,last:JSON.parse(document.documentElement.dataset.motionPrototype)};
    });
    const endMetrics=(await cdp.send('Performance.getMetrics')).metrics;
    const delta=Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','JSHeapUsedSize','Nodes'].map(name=>[name,endMetrics.find(m=>m.name===name)?.value-startMetrics.find(m=>m.name===name)?.value]));
    const quantile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.floor(values.length*q)]??null;
    const result={variant,viewport:{width:1440,height:900},browser:browser.version(),elapsed:measured.elapsed,draws:measured.last.frames-measured.first.frames||0,cpuSubmissionP95Ms:measured.last.cpuP95??0,rafGapP50Ms:quantile(measured.gaps,.5),rafGapP95Ms:quantile(measured.gaps,.95),rafGapsOver50Ms:measured.gaps.filter(n=>n>50).length,gpuTimerSupported:measured.timerSupported,gpuP95Ms:quantile(measured.gpu,.95),gpuSamples:measured.gpu.length,disjoint:measured.disjoint,longTasks:measured.longTasks,delta,state:measured.last,errors};
    results.push(result);await fs.writeFile(dir+'/'+variant+'-raw.json',JSON.stringify(measured,null,2));await page.close();
    console.log(JSON.stringify(result));
}
await browser.close();await fs.writeFile(dir+'/summary.json',JSON.stringify(results,null,2));
