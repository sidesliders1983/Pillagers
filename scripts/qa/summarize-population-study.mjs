import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root = resolve(process.argv[2] ?? 'docs/qa/population-continuity');
const folders = readdirSync(root, {withFileTypes:true}).filter(d => d.isDirectory()).map(d => join(root,d.name));
const runs = [];
for (const directory of folders) {
    let manifest;
    try { manifest = JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8')); } catch { continue; }
    for (const entry of manifest.observations) {
        const bytes = readFileSync(join(directory,entry.file));
        if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Checksum mismatch: '+entry.file);
        runs.push({...JSON.parse(gunzipSync(bytes)), source: directory.split(/[\\/]/).at(-1), elapsedMs:entry.elapsedMs});
    }
}
const sum = (rows, field) => rows.reduce((n,r) => n+(r[field]??0),0);
const median = values => { const sorted=values.toSorted((a,b)=>a-b),n=sorted.length; return n ? (sorted[Math.floor(n/2)]+sorted[Math.ceil(n/2)-1])/2 : null; };
const count = (rows, key) => rows.reduce((out,row)=>{out[row[key]]=(out[row[key]]??0)+1;return out;},{});
const combine = (rows,key) => rows.reduce((out,row)=>{for(const [k,v] of Object.entries(row[key]??{}))out[k]=(out[k]??0)+v;return out;},{});
const cohorts=[];
for (const key of [...new Set(runs.map(r=>r.source+'/'+r.candidate+'/'+r.policy))]) {
    const cohort=runs.filter(r=>r.source+'/'+r.candidate+'/'+r.policy===key);
    const valid=cohort.filter(r=>['complete','extinct'].includes(r.status));
    const complete=cohort.filter(r=>r.status==='complete');
    const years=valid.flatMap(r=>r.annual.slice(1));
    const fertility=valid.flatMap(r=>r.decisions.filter(d=>d.kind==='fertility'&&d.alive&&d.age>=18&&d.age<=40));
    const founders=valid.flatMap(r=>r.founders);
    const descendants=valid.flatMap(r=>r.descendants);
    const mothers=valid.flatMap(r=>r.mothers);
    const births=mothers.flatMap(m=>m.birthAges);
    const aliveChildren=descendants.filter(p=>p.deathWinter===null&&p.observedThroughAge<16);
    const completeFinal=complete.map(r=>r.annual.at(-1));
    const survival=Object.fromEntries([50,60,70,80].map(age=>[age,{
        reached:founders.filter(p=>p.observedThroughAge>=age).length,
        known:founders.filter(p=>p.deathAge!==null||p.observedThroughAge>=age).length,
        censoredBefore:founders.filter(p=>p.censored&&p.observedThroughAge<age).length }]));
    cohorts.push({key,seeds:cohort.map(r=>r.seed),statuses:count(cohort,'status'),
        runtimeSeconds:Math.round(sum(cohort,'elapsedMs')/1000), observedYears:years.length,
        populationAt80Median:median(valid.map(r=>r.status==='extinct'?0:r.annual.at(-1).population)),
        populationAt80Range:valid.map(r=>r.status==='extinct'?0:r.annual.at(-1).population).sort((a,b)=>a-b),
        completeFinalMedians:Object.fromEntries(['food','materials','cattle','houses','farmyards','adultDescendants','children']
            .map(field=>[field,median(completeFinal.map(r=>r[field]))])),
        extinctionYears:valid.filter(r=>r.status==='extinct').map(r=>({seed:r.seed,year:r.annual.at(-1).elapsedWinter})),
        births:sum(years,'births'), deaths:sum(years,'deaths'), generations:count(descendants,'generation'),
        childOutcomes:{born:descendants.length,reachedAdulthood:descendants.filter(p=>p.reachedAdulthood).length,
            diedBefore16:descendants.filter(p=>p.deathWinter!==null&&!p.reachedAdulthood).length,
            stillUnder16:aliveChildren.length},
        birthsPerFemaleHistogram:count(mothers,'count'),
        birthAgeRange:births.length?[Math.min(...births),Math.max(...births)]:[],
        firstBirthAgeMedian:median(mothers.filter(m=>m.count).map(m=>m.birthAges[0])),
        lastBirthAgeMedian:median(mothers.filter(m=>m.count).map(m=>m.birthAges.at(-1))),
        availablePartnershipRolls:sum(years,'availablePartnershipRolls'), formedPartnerships:sum(years,'partnerships'),
        founderArrivalAgeMedian:median(founders.map(f=>f.arrivalAge)),
        founderArrivalAgeRange:founders.length?[Math.min(...founders.map(f=>f.arrivalAge)),Math.max(...founders.map(f=>f.arrivalAge))]:[],
        founderObservedDeathAgeMedian:median(founders.filter(f=>!f.censored).map(f=>f.deathAge)),
        founderDeaths:founders.filter(f=>!f.censored).length, founderCensored:founders.filter(f=>f.censored).length,survival,
        fertilityBlockers:count(fertility,'firstBlocker'),
        birthsDuringOwnCare:fertility.filter(r=>r.firstBlocker==='born'&&r.ownCare).length,
        reserveBlocksWithoutShortfall:years.filter(r=>r.humanShortfall===0&&r.cattleShortfall===0).reduce((n,r)=>n+(r.fertilityBlockers.food??0),0),
        herdsLostBy80:completeFinal.filter(r=>r.cattle===0).length,
        zeroBullYears:years.filter(r=>(r.cattleSex.male??0)===0).length,
        cattleOnlyReserveBlocks:sum(years,'cattleOnlyReserveBlocks'),carePersonYears:sum(years,'careBurden'),
        foodShortfallYears:years.filter(r=>r.humanShortfall>0||r.cattleShortfall>0).length,
        humanShortfall:sum(years,'humanShortfall'),cattleShortfall:sum(years,'cattleShortfall'),
        emptyStockYears:years.filter(r=>r.food===0).length,
        firstShortfalls:valid.map(r=>({seed:r.seed,year:r.annual.find(a=>a.humanShortfall>0||a.cattleShortfall>0)?.elapsedWinter??null})),
        early:valid.map(r=>({seed:r.seed,food:r.annual.filter(a=>a.elapsedWinter<=10).map(a=>a.food),
            shortageYears:r.annual.filter(a=>a.elapsedWinter<=10&&(a.humanShortfall>0||a.cattleShortfall>0)).length,
            reserveBlocks:sum(r.annual.filter(a=>a.elapsedWinter<=10).map(a=>({count:a.fertilityBlockers?.food??0})),'count')})),
        shelteredResidentYears:sum(years,'shelteredResidentWinters'),exposedResidentYears:sum(years,'exposedResidentWinters'),
        expectedHumanDeaths:sum(years,'expectedHumanDeaths'),
        cattleBirths:sum(years,'cattleBirths'),cattleDeaths:sum(years,'cattleDeaths'),slaughters:sum(years,'slaughters'),transfers:0,
        expectedCattleDeaths:sum(years,'expectedCattleDeaths'),cattleRiskComponents:combine(years,'cattleRiskComponents'),
        exposedCattleYears:sum(years,'exposedCattleWinters'),shelteredCattleYears:sum(years,'shelteredCattleWinters'),
        overcrowdedCattleYears:sum(years,'overcrowdedAnimalWinters'),eligibleCowYears:sum(years,'eligibleCowWinters'),
        cattleFoodProduced:sum(years,'cattleProduced'),cattleFoodRequired:sum(years,'cattleRequired'),cattleFoodConsumed:sum(years,'cattleConsumed'),
        breedingBlockers:combine(years,'breedingBlockers'),weather:count(years,'weather'),
        traceDropped:sum(years,'traceDropped'),accountingResiduals:sum(years,'foodResidual')+sum(years,'materialsResidual')+sum(years,'cattleResidual')});
}
writeFileSync(join(root,'summary.json'),JSON.stringify({cohorts},null,2)+'\n');
console.log(JSON.stringify(cohorts.map(c=>({key:c.key,status:c.statuses,pop:c.populationAt80Median,cattle:c.completeFinalMedians.cattle,births:c.births,foodBlocks:c.fertilityBlockers.food,cattleBlocks:c.cattleOnlyReserveBlocks})),null,2));
