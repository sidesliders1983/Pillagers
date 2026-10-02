param([int]$WaitForBeardProcess=0)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
$taskLock=[Threading.Mutex]::new($false,'Local\PillagersClothingExtractionQueue')
if(!$taskLock.WaitOne(0)){exit 0}
try {
 $PID | Set-Content scratch/clothing-v03/extraction-queue.pid
 @{stage='waiting-for-beard-LOD';process=$WaitForBeardProcess} | ConvertTo-Json | Set-Content scratch/clothing-v03/extraction-queue-status.json
 if($WaitForBeardProcess -gt 0){Wait-Process -Id $WaitForBeardProcess -ErrorAction SilentlyContinue}
 $taskStates=@{}
 foreach($taskStyle in @('long-dress','belted-dress','apron-dress','short-red-tunic','shawl-dress','layered-workwear','cream-tunic','blue-tunic','work-vest','overshirt','mantle-tunic','green-tunic')) {
  $taskFolder=Join-Path $taskRoot "scratch/clothing-v03/$taskStyle"
  $taskSource=Join-Path $taskFolder 'generated.glb'
  $taskOutput=Join-Path $taskFolder 'clothing-candidate.glb'
  if(!(Test-Path $taskSource)){$taskStates[$taskStyle]=@{stage='generation-not-ready'};continue}
  if(Test-Path $taskOutput){$taskStates[$taskStyle]=@{stage='awaiting-extraction-review'};continue}
  $taskStates[$taskStyle]=@{stage='extracting';started=(Get-Date).ToString('o')}
  $taskStates | ConvertTo-Json -Depth 8 | Set-Content scratch/clothing-v03/extraction-queue-status.json
  try {
   $ErrorActionPreference='Continue'
   & tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/extract-generated-clothing.py -- $taskSource $taskOutput *> (Join-Path $taskFolder 'extraction.log')
  } finally {$ErrorActionPreference='Stop'}
  $taskStates[$taskStyle]=@{stage=$(if($LASTEXITCODE -eq 0){'awaiting-extraction-review'}else{'extraction-needs-correction'});exitCode=$LASTEXITCODE;finished=(Get-Date).ToString('o')}
  $taskStates | ConvertTo-Json -Depth 8 | Set-Content scratch/clothing-v03/extraction-queue-status.json
 }
} finally {$taskLock.ReleaseMutex();$taskLock.Dispose()}
