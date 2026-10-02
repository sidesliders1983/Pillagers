# Optimize existing extracted reference surfaces serially; never publish unreviewed assets.
param([int]$WaitForReviewProcess=0)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
$taskLock=[Threading.Mutex]::new($false,'Local\PillagersBeardLODQueue')
if(!$taskLock.WaitOne(0)){exit 0}
try {
 $PID | Set-Content scratch/beards-v03/lod-queue.pid
 if($WaitForReviewProcess -gt 0){Wait-Process -Id $WaitForReviewProcess -ErrorAction SilentlyContinue}
 $taskStates=@{}
 foreach($taskStyle in @('stubble','short','medium','long','split-braid')) {
  $taskFolder=Join-Path $taskRoot "scratch/beards-v03/$taskStyle"
  $taskOutput=Join-Path $taskFolder 'lods-2500-1800-1200'
  $taskReport=Join-Path $taskOutput "Beard_${taskStyle}_report.json"
  if(Test-Path $taskReport){$taskStates[$taskStyle]=@{stage='awaiting-LOD-review';report=$taskReport};continue}
  $taskVoxel='.0035'
  if(Test-Path $taskOutput){
   # Preserve a failed run; a coarser cleanup joins tiny UV-mask fragments.
   $taskOutput=Join-Path $taskFolder ('lods-retry-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
   $taskReport=Join-Path $taskOutput "Beard_${taskStyle}_report.json"
   $taskVoxel='.007'
  }
  $taskStates[$taskStyle]=@{stage='optimizing';started=(Get-Date).ToString('o')}
  $taskLog=Join-Path $taskFolder ('optimization-'+(Split-Path $taskOutput -Leaf)+'.log')
  $taskStates | ConvertTo-Json -Depth 8 | Set-Content scratch/beards-v03/lod-queue-status.json
  # Windows PowerShell converts native stderr into exceptions under Stop.
  # Record the exit code and continue other styles instead of losing the queue.
  try {
   $ErrorActionPreference='Continue'
   & tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/optimize-character.py -- (Join-Path $taskFolder 'beard-candidate.glb') $taskOutput --name "Beard_$taskStyle" --targets 2500 1800 1200 --textures 512 256 128 --voxel $taskVoxel *> $taskLog
  } finally {$ErrorActionPreference='Stop'}
  if($LASTEXITCODE -eq 0 -and (Test-Path $taskReport)){$taskStates[$taskStyle]=@{stage='awaiting-LOD-review';finished=(Get-Date).ToString('o');report=$taskReport}}
  else{$taskStates[$taskStyle]=@{stage='failed';exitCode=$LASTEXITCODE}}
  $taskStates | ConvertTo-Json -Depth 8 | Set-Content scratch/beards-v03/lod-queue-status.json
 }
} finally {$taskLock.ReleaseMutex();$taskLock.Dispose()}
