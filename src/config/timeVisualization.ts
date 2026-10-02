export type TimeVisualization='off'|'day-night'|'seasons';
export const seasonPresets=[
    {name:'Spring',sky:0xcbded4,fog:0xcbded4,sun:0xffefd8,ground:0xd9e8be,foliage:0xb8dc8e,ambient:2.45,intensity:1.55},
    {name:'Summer',sky:0xbad7e3,fog:0xcadfe4,sun:0xffe0ab,ground:0xf2e2b4,foliage:0xc3db96,ambient:2.65,intensity:1.8},
    {name:'Autumn',sky:0xd6c4b4,fog:0xdac8b9,sun:0xffbe86,ground:0xe2c39f,foliage:0xeaa274,ambient:2.15,intensity:1.35},
    {name:'Winter',sky:0xcbd9e4,fog:0xdbe4e9,sun:0xddeaff,ground:0xf5f4ef,foliage:0xe0e5e3,ambient:2.05,intensity:1.1},
] as const;
export function seasonBlend(progress:number){
    const phase=((progress%1+1)%1)*4,index=Math.floor(phase),t=phase-index;
    return {from:seasonPresets[index],to:seasonPresets[(index+1)%4],mix:t*t*(3-2*t)};
}
/** Noon at cycle start, midnight halfway, noon again at the annual tick. */
export function daylight(progress:number){return (1+Math.cos(progress*Math.PI*2))/2;}
