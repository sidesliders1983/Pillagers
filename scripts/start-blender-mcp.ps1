param([string]$BlenderPath = $env:BLENDER_PATH)
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!$BlenderPath) { $BlenderPath = Join-Path $projectRoot 'tools/blender-4.5.9-windows-x64/blender.exe' }
$addonPath = Join-Path $projectRoot 'tools/mcp-for-blender/addon.py'
if (!(Test-Path -LiteralPath $BlenderPath) -or !(Test-Path -LiteralPath $addonPath)) { throw 'Supply Blender 4.5+ and clone mcp-for-blender into tools. See docs/ASSET-OPTIMIZATION-V01.md.' }
$scriptPath = Join-Path $PSScriptRoot 'blender-mcp-start.py'
$logRoot = Join-Path $projectRoot 'scratch'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$arguments = @('--factory-startup', '--python', ('"' + $scriptPath + '"'), '--', ('"' + $addonPath + '"'))
$process = Start-Process -FilePath $BlenderPath -ArgumentList $arguments -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'blender-mcp.log') -RedirectStandardError (Join-Path $logRoot 'blender-mcp-error.log') -PassThru
Write-Output "Dedicated Blender MCP session started (PID $($process.Id)), loopback port 9876."
