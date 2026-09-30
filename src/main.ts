import './style.css';
const route=location.pathname.replace(/\/+$/, '');
if(route==='/character-lab'){
    import('./character-lab/CharacterLab').then(({CharacterLab})=>new CharacterLab().start()).catch(error=>{
        console.error(error);document.body.textContent=`Could not open Character Lab. ${error.message}`;
    });
}else{
    import('./core/Game').then(({Game})=>new Game().start(document.querySelector<HTMLCanvasElement>('#world')!)).catch(error => { console.error(error); document.querySelector('#status')!.textContent = `Could not load the world. Check local Assets/Terrain files and WebGL support. ${error.message}`; });
}
