export function setupWorldHUD(){
    const help=document.querySelector<HTMLDetailsElement>('#world-help')!;
    const dev=document.querySelector<HTMLDetailsElement>('#world-dev')!;
    const close=()=>{help.open=false;dev.open=false;};
    help.addEventListener('toggle',()=>{if(help.open)dev.open=false;});
    dev.addEventListener('toggle',()=>{if(dev.open)help.open=false;});
    document.addEventListener('pointerdown',event=>{if(!(event.target as HTMLElement).closest('.world-utilities'))close();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
    dev.addEventListener('click',event=>{if((event.target as HTMLElement).closest('button,a'))close();});
    document.querySelector('#debug-close')!.addEventListener('click',()=>{document.querySelector<HTMLElement>('#debug')!.hidden=true;});
}
