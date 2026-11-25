[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$EngineRoot,
    [string]$EmsdkRoot = $env:WASM_EMSDK_ROOT,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../Saved/Web'),
    [ValidateRange(1, 64)][int]$MaxParallelActions = 6
)

$ErrorActionPreference = 'Stop'
$engine = (Resolve-Path -LiteralPath $EngineRoot).Path
$project = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../OblivionArchive.uproject')).Path
$uat = Join-Path $engine 'Engine/Build/BatchFiles/RunUAT.bat'
$webPlatform = Join-Path $engine 'Engine/Platforms/Wasm/Config/Wasm_SDK.json'
if (!(Test-Path -LiteralPath $webPlatform)) {
    throw "The engine at $engine does not include the Wasm target."
}

$previousSdk = $env:WASM_EMSDK_ROOT
try {
    if ($EmsdkRoot) {
        $env:WASM_EMSDK_ROOT = (Resolve-Path -LiteralPath $EmsdkRoot).Path
    }
    & $uat Turnkey -command=VerifySdk -platform=Wasm -unattended -NoP4
    if ($LASTEXITCODE) { throw "Wasm SDK verification exited with code $LASTEXITCODE." }

    $output = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
    $buildArgs = "-MaxParallelActions=$MaxParallelActions"
    if (!(Test-Path -LiteralPath (Join-Path $engine 'Engine/Build/InstalledBuild.txt'))) {
        $buildArgs += ' -NoDebugInfo'
    }
    & $uat BuildCookRun "-project=$project" -target=OblivionArchive -platform=Wasm -clientconfig=Shipping `
        -build -cook -stage -pak -iostore -package -archive "-archivedirectory=$output" `
        "-ubtargs=$buildArgs" -unattended -NoP4
    if ($LASTEXITCODE) { throw "Unreal web packaging exited with code $LASTEXITCODE." }
    $index = Join-Path $output 'Wasm/index.html'
    if (!(Test-Path -LiteralPath $index -PathType Leaf)) {
        throw "The web archive is missing its entry page at $index."
    }
    Write-Output $index
} finally {
    $env:WASM_EMSDK_ROOT = $previousSdk
}
