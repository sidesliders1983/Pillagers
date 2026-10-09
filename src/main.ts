import './style.css';
const route=location.pathname.replace(/\/+$/, '');
if(route === '/water-lab') {
    import('./water-lab/WaterLab').then(({ WaterLab }) => new WaterLab().start()).catch(error => {
        console.error(error);
        document.body.textContent = `Could not open Water Lab. ${error.message}`;
    });
}else if(route==='/environment-lab'){
    import('./environment-lab/EnvironmentLab').then(({EnvironmentLab})=>new EnvironmentLab().start()).catch(error=>{console.error(error);document.body.textContent='Could not open Environment Lab. '+error.message;});
}else if(route==='/play'){
    import('./play/PlayUI').then(({PlayUI})=>new PlayUI().start()).catch(error=>{console.error(error);document.body.textContent='Could not open settlement. '+error.message;});
}else if(route==='/gameplay-lab'){
    import('./gameplay-lab/GameplayLab').then(({GameplayLab})=>new GameplayLab().start()).catch(error=>{console.error(error);document.body.textContent="Could not open Gameplay Lab. "+error.message;});
}else if(route==='/asset-lab'){
    import('./asset-lab/AssetLab').then(({AssetLab})=>new AssetLab().start()).catch(error=>{console.error(error);document.body.textContent=`Could not open Asset Lab. ${error.message}`;});
}else if(route==='/meshy-preview'){
    import('./character-lab/MeshyCharacterLab').then(({MeshyCharacterLab})=>new MeshyCharacterLab().start()).catch(error=>{console.error(error);document.body.textContent='Could not open Meshy Character Lab. '+error.message;});
}else if(route==='/character-lab'){
    import('./character-lab/CharacterLab').then(({CharacterLab})=>new CharacterLab().start()).catch(error=>{
        console.error(error);document.body.textContent=`Could not open Character Lab. ${error.message}`;
    });
}else{
    import('./core/Game').then(({Game})=>new Game().start(document.querySelector<HTMLCanvasElement>('#world')!)).catch(error => { console.error(error); document.querySelector('#status')!.textContent = `Could not load the world. Check local Assets/Terrain files and WebGL support. ${error.message}`; });
}
