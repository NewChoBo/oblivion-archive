[CmdletBinding(DefaultParameterSetName = 'Editor')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Editor')][string]$EngineRoot,
    [Parameter(ParameterSetName = 'Editor')][switch]$SkipBuild,
    [Parameter(Mandatory = $true, ParameterSetName = 'Packaged')][string]$PackagedExe,
    [switch]$RequireFab
)
$ErrorActionPreference = 'Stop'
$arguments = @()
if ($PSCmdlet.ParameterSetName -eq 'Packaged') {
    $executable = (Resolve-Path $PackagedExe).Path
} else {
    $project = (Resolve-Path (Join-Path $PSScriptRoot '../OblivionArchive.uproject')).Path
    $engine = (Resolve-Path $EngineRoot).Path
    if (!$SkipBuild) {
        & (Join-Path $engine 'Engine/Build/BatchFiles/Build.bat') OblivionArchiveEditor Win64 Development "-Project=$project" -WaitMutex -NoHotReload
        if ($LASTEXITCODE -ne 0) { throw "Editor target build failed with exit code $LASTEXITCODE." }
    }
    $executable = Join-Path $engine 'Engine/Binaries/Win64/UnrealEditor-Cmd.exe'
    $arguments += @(('"' + $project + '"'), '-game')
}
$validation = Join-Path ([IO.Path]::GetTempPath()) ("OblivionArchive-verify-" + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($validation) | Out-Null
$log = Join-Path $validation 'chapter.log'
if ($RequireFab) { $arguments += '-ArchiveVerifyFab' }
$arguments += @('/Engine/Maps/Entry', '-NullRHI', '-RenderOffScreen',
    '-Unattended', '-NoSplash', '-NoSound', '-NoCrashDialog', '-NoCrashReportClient', '-NoLiveCoding',
    '-ArchiveVerify', ('-UserDir="' + $validation + '"'), ('-AbsLog="' + $log + '"'))
$process = Start-Process -FilePath $executable -ArgumentList $arguments -WindowStyle Hidden -PassThru
if (!$process.WaitForExit(180000)) {
    $process.Kill()
    throw "The verification game did not finish within three minutes. Read $log."
}
$summary = Select-String -LiteralPath $log -Pattern 'ARCHIVE VERIFY RESULT passed=(\d+) failed=(\d+)'
if ($process.ExitCode -ne 0 -or !$summary -or [int]$summary.Matches[0].Groups[1].Value -lt 1 -or $summary.Matches[0].Groups[2].Value -ne '0') {
    throw "Native chapter verification failed. Read $log."
}
Write-Output $summary.Line
Write-Output $log
