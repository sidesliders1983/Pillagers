import './style.css';
const route=location.pathname.replace(/\/+$/, '');
if (route === '/fjord-play') {
    import('./fjord-play/FjordPlay').then(({ FjordPlay }) => new FjordPlay().start()).catch(error => {
        console.error(error);
        const status = document.querySelector('#fjord-notice');
        if (status) status.textContent = 'Fjord rendering unavailable. Simulation controls remain available. ' + error.message;
        else document.body.textContent = 'Could not open Fjord settlement. ' + error.message;
    });
} else if(route === '/water-lab') {
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
    Promise.all([import('./core/Game'), import('./core/world-shell.html?raw')]).then(([{ Game }, shell]) => {
        document.body.innerHTML = shell.default;
        return new Game().start(document.querySelector<HTMLCanvasElement>('#world')!);
    }).catch(error => { console.error(error); (document.querySelector('#status') ?? document.querySelector('#app-bootstrap') ?? document.body).textContent = `Could not load the world. Check the published assets in public/ and WebGL support. ${error.message}`; });
}
