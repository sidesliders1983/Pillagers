$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
$taskDirectory=Join-Path $taskRoot 'scratch/appearance-v02'
$pidFile=Join-Path $taskDirectory 'pipeline.pid'
if(Test-Path -LiteralPath $pidFile){
    $previousWorker=[int](Get-Content -LiteralPath $pidFile)
    $existing=Get-Process -Id $previousWorker -ErrorAction SilentlyContinue
    if($existing -and $previousWorker -ne $PID -and $existing.ProcessName -eq 'powershell'){Write-Output "Pipeline worker $previousWorker is already running.";exit 0}
}
$lock=[System.Threading.Mutex]::new($false,'Local\PillagersHairPipeline')
if(!$lock.WaitOne(0)){Write-Output 'Hair pipeline already running.';exit 0}
$PID|Set-Content -LiteralPath $pidFile
$python=Join-Path $taskRoot 'tools/image-to-3dlab/.venv-pixal/Scripts/python.exe'
$blender=Join-Path $taskRoot 'tools/blender-4.5.9-windows-x64/blender.exe'
$generator=Join-Path $taskRoot 'tools/image-to-3dlab/scripts/pixal3d_generate.py'
$env:U2NET_HOME=Join-Path $taskRoot 'tools/image-to-3dlab/vendor/matte'
$env:HF_HUB_OFFLINE='1'
$env:OMP_NUM_THREADS='2'
$states=@{}
# Medium first: it is the supplied clipping case. Only one GPU job at a time.
foreach($style in @('medium','short','long','tied','bun','braid')) {
    $folder=Join-Path $taskDirectory $style
    try {
        $states[$style]=@{stage='generating';started=(Get-Date -Format o)}
        $states|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $taskDirectory 'pipeline-status.json')
        $source=Join-Path $folder 'generated.glb'
        if(!(Test-Path -LiteralPath $source)) {
            & $python $generator (Join-Path $folder 'reference.png') $source --seed 1983 --no-matte *> (Join-Path $folder 'generation.log')
            if($LASTEXITCODE -ne 0){throw "Generation failed with exit code $LASTEXITCODE"}
        }
        $record=@{backend='pixal3d';reference=(Get-Content (Join-Path $folder 'reference.provenance.json') -Raw|ConvertFrom-Json);output=@{path=$source;sha256=(Get-FileHash $source -Algorithm SHA256).Hash.ToLower()};generation=(Get-Content (Join-Path $folder 'generated.json') -Raw|ConvertFrom-Json);reviewRequired=$true}
        $record|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $folder 'generated.provenance.json')
        $states[$style].stage='extracting'
        $states|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $taskDirectory 'pipeline-status.json')
        $hair=Join-Path $folder 'hair-candidate.glb'
        if(!(Test-Path -LiteralPath $hair)) {
            & $blender --background --factory-startup --threads 2 --python-exit-code 1 --python (Join-Path $PSScriptRoot 'extract-generated-hair.py') -- $source $hair *> (Join-Path $folder 'extraction.log')
            if($LASTEXITCODE -ne 0){throw "Hair extraction needs review (exit code $LASTEXITCODE)"}
        }
        $hairRecord=@{backend='pixal3d';generatedBust=$record;extraction=(Get-Content (Join-Path $folder 'hair-candidate.extraction.json') -Raw|ConvertFrom-Json);output=@{path=$hair;sha256=(Get-FileHash $hair -Algorithm SHA256).Hash.ToLower()};reviewRequired=$true}
        $hairRecord|ConvertTo-Json -Depth 25|Set-Content -LiteralPath (Join-Path $folder 'hair-candidate.provenance.json')
        $states[$style].stage='optimizing'
        $states|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $taskDirectory 'pipeline-status.json')
        $lods=Join-Path $folder 'lods'
        if(!(Test-Path -LiteralPath (Join-Path $lods "Hair_${style}_report.json"))) {
            & $blender --background --factory-startup --threads 2 --python-exit-code 1 --python (Join-Path $PSScriptRoot 'optimize-character.py') -- $hair $lods --name "Hair_$style" --targets 1600 800 300 --textures 512 256 128 *> (Join-Path $folder 'optimization.log')
            if($LASTEXITCODE -ne 0){throw "LOD optimization failed (exit code $LASTEXITCODE)"}
        }
        $states[$style].stage='awaiting-fit-review';$states[$style].finished=Get-Date -Format o
    } catch {
        $states[$style].stage='needs-review';$states[$style].error=$_.Exception.Message
    }
    $states|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $taskDirectory 'pipeline-status.json')
}
$lock.ReleaseMutex();$lock.Dispose()
