# CPU-only candidates from completed original-reference busts. Never publishes.
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
$taskFolder=Join-Path $taskRoot 'scratch/beards-v03'
$taskLock=[Threading.Mutex]::new($false,'Local\PillagersBeardExtraction')
if(!$taskLock.WaitOne(0)){exit 0}
try{
 $PID|Set-Content (Join-Path $taskFolder 'extraction.pid')
 $taskStates=@{}
 foreach($taskStyle in @('stubble','short','medium','long','split-braid','braid')){
  $taskStyleFolder=Join-Path $taskFolder $taskStyle
  $taskSource=Join-Path $taskStyleFolder 'generated.glb'
  $taskOutput=Join-Path $taskStyleFolder 'beard-candidate.glb'
  if(!(Test-Path $taskSource)){continue}
  $taskStates[$taskStyle]=@{stage='extracting'}
  $taskStates|ConvertTo-Json -Depth 12|Set-Content (Join-Path $taskFolder 'extraction-status.json')
  if(!(Test-Path $taskOutput)){
   $taskColourArgs=if($taskStyle -eq 'braid'){@('--max-saturation','.98','--beard-braid')}else{@()}
   try{$ErrorActionPreference='Continue'
    & (Join-Path $taskRoot 'tools/blender-4.5.9-windows-x64/blender.exe') --background --factory-startup --threads 2 --python-exit-code 1 --python (Join-Path $PSScriptRoot 'extract-generated-hair.py') -- $taskSource $taskOutput @taskColourArgs *> (Join-Path $taskStyleFolder 'extraction.log')
   }finally{$ErrorActionPreference='Stop'}
   if($LASTEXITCODE -ne 0){$taskStates[$taskStyle]=@{stage='needs-review';exitCode=$LASTEXITCODE};continue}
  }
  $taskStream=[IO.File]::OpenRead($taskOutput);$taskSha=[Security.Cryptography.SHA256]::Create()
  try{$taskDigest=([BitConverter]::ToString($taskSha.ComputeHash($taskStream))).Replace('-','').ToLowerInvariant()}finally{$taskStream.Dispose();$taskSha.Dispose()}
  @{style=$taskStyle;generatedBust=(Get-Content (Join-Path $taskStyleFolder 'generated.provenance.json') -Raw|ConvertFrom-Json);extraction=(Get-Content (Join-Path $taskStyleFolder 'beard-candidate.extraction.json') -Raw|ConvertFrom-Json);outputSha256=$taskDigest;reviewRequired=$true}|ConvertTo-Json -Depth 25|Set-Content (Join-Path $taskStyleFolder 'beard-candidate.provenance.json')
  $taskStates[$taskStyle]=@{stage='awaiting-extraction-review';finished=(Get-Date -Format o)}
 }
 $taskStates|ConvertTo-Json -Depth 12|Set-Content (Join-Path $taskFolder 'extraction-status.json')
}finally{$taskLock.ReleaseMutex();$taskLock.Dispose()}
