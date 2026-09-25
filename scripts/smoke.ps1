# Smoke test (HANDOFF 6-11): launch win-unpacked exe, MainWindowHandle must be non-zero after 10s
$ErrorActionPreference = 'Stop'
$exe = Get-ChildItem -Path (Join-Path $PSScriptRoot '..\dist\win-unpacked') -Filter '*.exe' |
  Where-Object { $_.Name -notmatch 'Uninstall' } | Select-Object -First 1
if (-not $exe) { Write-Output 'SMOKE-FAIL: exe not found'; exit 1 }

$ud = Join-Path $env:TEMP ("dtodo-smoke-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $ud | Out-Null
$env:DTODO_USER_DATA = $ud

$proc = Start-Process -FilePath $exe.FullName -PassThru
Start-Sleep -Seconds 10
$proc.Refresh()
if ($proc.HasExited) {
  Write-Output ("SMOKE-FAIL: process exited code=" + $proc.ExitCode)
  exit 1
}
if ($proc.MainWindowHandle -eq 0) {
  Write-Output 'SMOKE-FAIL: MainWindowHandle=0 (bad package)'
  Stop-Process -Id $proc.Id -Force
  exit 1
}
Write-Output ("SMOKE-PASS: exe=" + $exe.Name + " MainWindowHandle=" + $proc.MainWindowHandle)
Stop-Process -Id $proc.Id -Force
Start-Sleep -Seconds 2
try { Remove-Item -Recurse -Force $ud -ErrorAction SilentlyContinue } catch {}
exit 0
