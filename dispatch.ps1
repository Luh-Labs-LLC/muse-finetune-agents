# Keeps this PC serving the site: runs the dispatcher (agents/dispatcher.py) and, if it ever stops (a crash, an error
# it can't get past), starts it again after a short pause. While this window is open the PC won't go to sleep, so a
# request or a chat message isn't left waiting; the power settings themselves aren't changed. Ctrl+C stops it all.
#
#   powershell -ExecutionPolicy Bypass -File dispatch.ps1
#
# Needs what the dispatcher needs: .env.local with the API key and DISPATCH_TOKEN, and the training packages.

Set-Location $PSScriptRoot

Add-Type -Namespace Muse -Name Power -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);
'@
$ES_CONTINUOUS = [uint32]"0x80000000"
$ES_SYSTEM_REQUIRED = [uint32]"0x00000001"
[Muse.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) | Out-Null  # awake until this exits

try {
    while ($true) {
        Write-Host "$(Get-Date -Format 'HH:mm:ss') starting the dispatcher"
        python agents/dispatcher.py
        Write-Host "$(Get-Date -Format 'HH:mm:ss') the dispatcher stopped (exit code $LASTEXITCODE); starting it again in 15 s"
        Start-Sleep -Seconds 15
    }
} finally {
    [Muse.Power]::SetThreadExecutionState($ES_CONTINUOUS) | Out-Null  # sleep as usual again
}
