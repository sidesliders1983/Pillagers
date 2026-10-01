param([switch]$FinalizeOnly,[switch]$Watch)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
$taskDirectory=Join-Path $taskRoot 'scratch/appearance-v02'
$pidFile=Join-Path $taskDirectory $(if($FinalizeOnly){'finalizer.pid'}else{'pipeline.pid'})
$statusFile=Join-Path $taskDirectory $(if($FinalizeOnly){'finalization-status.json'}else{'pipeline-status.json'})
function Get-Sha256([string]$path){
    $stream=[System.IO.File]::OpenRead($path);$sha=[System.Security.Cryptography.SHA256]::Create()
    try{return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$sha.Dispose()}
}
if(Test-Path -LiteralPath $pidFile){
    $previousWorker=[int](Get-Content -LiteralPath $pidFile)
    $existing=Get-Process -Id $previousWorker -ErrorAction SilentlyContinue
    if($existing -and $previousWorker -ne $PID -and $existing.ProcessName -eq 'powershell'){Write-Output "Pipeline worker $previousWorker is already running.";exit 0}
}
$lock=[System.Threading.Mutex]::new($false,$(if($FinalizeOnly){'Local\PillagersHairFinalizer'}else{'Local\PillagersHairPipeline'}))
if(!$lock.WaitOne(0)){Write-Output 'Hair pipeline already running.';exit 0}
$PID|Set-Content -LiteralPath $pidFile
$python=Join-Path $taskRoot 'tools/image-to-3dlab/.venv-pixal/Scripts/python.exe'
$blender=Join-Path $taskRoot 'tools/blender-4.5.9-windows-x64/blender.exe'
$generator=Join-Path $taskRoot 'tools/image-to-3dlab/scripts/pixal3d_generate.py'
$env:U2NET_HOME=Join-Path $taskRoot 'tools/image-to-3dlab/vendor/matte'
$env:HF_HUB_OFFLINE='1'
$env:OMP_NUM_THREADS='2'
$states=@{}
if(Test-Path -LiteralPath $statusFile){$saved=Get-Content -LiteralPath $statusFile -Raw|ConvertFrom-Json;foreach($property in $saved.PSObject.Properties){$states[$property.Name]=@{};foreach($field in $property.Value.PSObject.Properties){$states[$property.Name][$field.Name]=$field.Value}}}
do {
# Medium first: it is the supplied clipping case. Only one GPU job at a time.
foreach($style in @('medium','short','long','tied','bun','braid')) {
    $folder=Join-Path $taskDirectory $style
    if($FinalizeOnly){
        if(!(Test-Path -LiteralPath (Join-Path $folder 'generated.json')) -or !(Test-Path -LiteralPath (Join-Path $folder 'generated.glb'))){continue}
        if($states.ContainsKey($style) -and $states[$style].stage -in @('awaiting-fit-review','needs-review')){continue}
    }
    try {
        $states[$style]=@{stage='generating';started=(Get-Date -Format o)}
        $states|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $statusFile
        $source=Join-Path $folder 'generated.glb'
        if(!(Test-Path -LiteralPath $source)) {
            & $python $generator (Join-Path $folder 'reference.png') $source --seed 1983 --no-matte *> (Join-Path $folder 'generation.log')
            if($LASTEXITCODE -ne 0){throw "Generation failed with exit code $LASTEXITCODE"}
        }
        $record=@{backend='pixal3d';reference=(Get-Content (Join-Path $folder 'reference.provenance.json') -Raw|ConvertFrom-Json);output=@{path=$source;sha256=(Get-Sha256 $source)};generation=(Get-Content (Join-Path $folder 'generated.json') -Raw|ConvertFrom-Json);reviewRequired=$true}
        $record|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $folder 'generated.provenance.json')
        $states[$style].stage='extracting'
        $states|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $statusFile
        $hair=Join-Path $folder 'hair-candidate.glb'
        if(!(Test-Path -LiteralPath $hair)) {
            & $blender --background --factory-startup --threads 2 --python-exit-code 1 --python (Join-Path $PSScriptRoot 'extract-generated-hair.py') -- $source $hair *> (Join-Path $folder 'extraction.log')
            if($LASTEXITCODE -ne 0){throw "Hair extraction needs review (exit code $LASTEXITCODE)"}
        }
        $hairRecord=@{backend='pixal3d';generatedBust=$record;extraction=(Get-Content (Join-Path $folder 'hair-candidate.extraction.json') -Raw|ConvertFrom-Json);output=@{path=$hair;sha256=(Get-Sha256 $hair)};reviewRequired=$true}
        $hairRecord|ConvertTo-Json -Depth 25|Set-Content -LiteralPath (Join-Path $folder 'hair-candidate.provenance.json')
        $states[$style].stage='optimizing'
        $states|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $statusFile
        $lods=Join-Path $folder 'lods'
        if(!(Test-Path -LiteralPath (Join-Path $lods "Hair_${style}_report.json"))) {
            & $blender --background --factory-startup --threads 2 --python-exit-code 1 --python (Join-Path $PSScriptRoot 'optimize-character.py') -- $hair $lods --name "Hair_$style" --targets 1600 800 300 --textures 512 256 128 *> (Join-Path $folder 'optimization.log')
            if($LASTEXITCODE -ne 0){throw "LOD optimization failed (exit code $LASTEXITCODE)"}
        }
        $states[$style].stage='awaiting-fit-review';$states[$style].finished=Get-Date -Format o
    } catch {
        $states[$style].stage='needs-review';$states[$style].error=$_.Exception.Message
    }
    $states|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $statusFile
}
    $generationWorker=$null
    if($FinalizeOnly -and $Watch){
        $generationPid=[int](Get-Content -LiteralPath (Join-Path $taskDirectory 'pipeline.pid'))
        $generationWorker=Get-Process -Id $generationPid -ErrorAction SilentlyContinue
        if($generationWorker){Start-Sleep -Seconds 30}
    }
}while($FinalizeOnly -and $Watch -and $generationWorker)
$lock.ReleaseMutex();$lock.Dispose()
