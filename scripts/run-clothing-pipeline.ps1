# Generates original reference outfits sequentially, after the active hair GPU queue.
# Raw outfits require garment extraction and visual review before publication.
param([switch]$PrepareOnly)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
$taskFolder=Join-Path $taskRoot 'scratch/clothing-v03'
$taskLock=[System.Threading.Mutex]::new($false,'Local\PillagersClothingPipeline')
if(!$taskLock.WaitOne(0)){Write-Output 'Clothing worker already running.';exit 0}
try {
    $PID | Set-Content -LiteralPath (Join-Path $taskFolder 'pipeline.pid')
    $taskPython=Join-Path $taskRoot 'tools/image-to-3dlab/.venv-pixal/Scripts/python.exe'
    $env:HF_HUB_OFFLINE='1';$env:OMP_NUM_THREADS='2'
    $env:U2NET_HOME=Join-Path $taskRoot 'tools/image-to-3dlab/vendor/matte'
    $taskRecords=@()
    foreach($taskCategory in @('beards-v03','clothing-v03')){
        $taskCategoryFolder=Join-Path $taskRoot "scratch/$taskCategory"
        foreach($taskEntry in (Get-Content (Join-Path $taskCategoryFolder 'references.json') -Raw|ConvertFrom-Json)){
            $taskEntry|Add-Member -NotePropertyName folder -NotePropertyValue (Join-Path $taskCategoryFolder $taskEntry.id)
            $taskEntry|Add-Member -NotePropertyName jobId -NotePropertyValue "$taskCategory/$($taskEntry.id)"
            $taskRecords+=$taskEntry
        }
    }
    $taskStatus=@{stage='waiting-for-hair-queue';outfits=@{};updated=(Get-Date -Format o)}
    function Save-Status {$taskStatus.updated=Get-Date -Format o;$taskStatus|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $taskFolder 'pipeline-status.json')}
    Save-Status
    # CPU matting is allowed while the existing GPU generation continues.
    foreach($taskRecord in $taskRecords){
        $taskStyleFolder=$taskRecord.folder
        $taskInput=Join-Path $taskStyleFolder 'reference.png'
        if(!(Test-Path $taskInput)){
            & $taskPython (Join-Path $PSScriptRoot 'matte-clothing-reference.py') (Join-Path $taskStyleFolder 'reference-crop.png') $taskInput
            if($LASTEXITCODE -ne 0){throw "Matting failed: $($taskRecord.id)"}
        }
        $taskStatus.outfits[$taskRecord.jobId]=@{stage='queued'};Save-Status
    }
    if($PrepareOnly){$taskStatus.stage='prepared';Save-Status;exit 0}
    do {
        $taskHairPidFile=Join-Path $taskRoot 'scratch/appearance-v02/pipeline.pid'
        $taskHairWorker=$null
        if(Test-Path $taskHairPidFile){
            $taskHairWorker=Get-CimInstance Win32_Process -Filter "ProcessId=$([int](Get-Content $taskHairPidFile))" -ErrorAction SilentlyContinue
            if($taskHairWorker.CommandLine -notlike '*run-hair-pipeline.ps1*'){$taskHairWorker=$null}
        }
        $taskGpuWorker=Get-Process -Name trellis-cli -ErrorAction SilentlyContinue
        if($taskHairWorker -or $taskGpuWorker){Start-Sleep -Seconds 30}
    }while($taskHairWorker -or $taskGpuWorker)
    foreach($taskRecord in $taskRecords){
        $taskStyleFolder=$taskRecord.folder
        $taskOutput=Join-Path $taskStyleFolder 'generated.glb'
        if(!(Test-Path $taskOutput)){
            $taskStatus.stage='generating';$taskStatus.outfits[$taskRecord.jobId]=@{stage='generating';started=(Get-Date -Format o)};Save-Status
            & $taskPython (Join-Path $taskRoot 'tools/image-to-3dlab/scripts/pixal3d_generate.py') (Join-Path $taskStyleFolder 'reference.png') $taskOutput --seed 1983 --no-matte *> (Join-Path $taskStyleFolder 'generation.log')
            if($LASTEXITCODE -ne 0){$taskStatus.outfits[$taskRecord.jobId]=@{stage='failed';exitCode=$LASTEXITCODE};Save-Status;continue}
        }
        $taskStream=[IO.File]::OpenRead($taskOutput);$taskSha=[Security.Cryptography.SHA256]::Create()
        try {$taskDigest=([BitConverter]::ToString($taskSha.ComputeHash($taskStream))).Replace('-','').ToLowerInvariant()}finally{$taskStream.Dispose();$taskSha.Dispose()}
        @{reference=$taskRecord;matte=(Get-Content (Join-Path $taskStyleFolder 'reference.matte.json') -Raw|ConvertFrom-Json);generation=(Get-Content (Join-Path $taskStyleFolder 'generated.json') -Raw|ConvertFrom-Json);outputSha256=$taskDigest;reviewRequired=$true}|ConvertTo-Json -Depth 20|Set-Content (Join-Path $taskStyleFolder 'generated.provenance.json')
        $taskStatus.outfits[$taskRecord.jobId]=@{stage='awaiting-module-extraction';finished=(Get-Date -Format o)};Save-Status
    }
    $taskStatus.stage='awaiting-garment-extraction';Save-Status
} finally {$taskLock.ReleaseMutex();$taskLock.Dispose()}
