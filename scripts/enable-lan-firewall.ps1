#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$resultPath = Join-Path $PSScriptRoot '..\artifacts\lan-firewall-result.json'
try {
    $nodePath = 'C:\Users\Devoteam\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (-not (Test-Path -LiteralPath $nodePath)) { $nodePath = (Get-Command node.exe -ErrorAction Stop).Source }
    $ruleName = 'Pillagers-LAN-Preview'
    $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -Name $ruleName -DisplayName 'Pillagers LAN preview' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4175,5175 -RemoteAddress LocalSubnet -InterfaceAlias 'Wi-Fi' -Profile Any -Program $nodePath | Out-Null
    }
    $rule = Get-NetFirewallRule -Name $ruleName
    [PSCustomObject]@{ status = 'success'; rule = $rule.Name; enabled = "$($rule.Enabled)"; ports = @(4175,5175); scope = 'Wi-Fi, local subnet, Node process' } | ConvertTo-Json | Set-Content -LiteralPath $resultPath
} catch {
    [PSCustomObject]@{ status = 'error'; message = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath $resultPath
    throw
}
