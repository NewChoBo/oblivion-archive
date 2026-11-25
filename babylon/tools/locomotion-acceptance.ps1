param(
  [Parameter(Mandatory=$true)][string]$PageId,
  [ValidateSet('before','after')][string]$Version='after',
  [string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-22/locomotion"
)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
function Down([string]$key){Cmd @('exec','--page',$PageId,'--command',('keydown '+$key)) | Out-Null}
function Up([string]$key){Cmd @('exec','--page',$PageId,'--command',('keyup '+$key)) | Out-Null}
Cmd @('reload','--page',$PageId) | Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not([disabled])') | Out-Null
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720') | Out-Null
Enter-Chapter
Cmd @('wait','--page',$PageId,'--selector','#game[data-input=free-look],#game[data-input=locked]') | Out-Null
if((Read).input.captureChoice -eq 'denied'){
  ClickButton '#free-cursor'
}
Cmd @('wait','--page',$PageId,'--selector','#notice:not(.visible)') | Out-Null
if((Read).viewMode -eq 'first'){Key V}
Read @'
(() => {
  const frames = [];
  let active = true;
  const start = performance.now();
  function record(now) {
    if (!active) return;
    const s = window.__ROOM_DEMO__.snapshot();
    frames.push([now-start, s.movement.speed, s.position, s.player.feet, s.player.gaitPhase,
                 s.player.locomotion, s.jump.velocity, s.player.supportFoot ?? null, s.yaw]);
    requestAnimationFrame(record);
  }
  requestAnimationFrame(record);
  window.__finishLocomotion = () => { active=false; return JSON.stringify(frames); };
  return true;
})()
'@ | Out-Null
Read (Get-Content -Raw -Encoding utf8 "$PSScriptRoot/capture-start.js") | Out-Null
Hold a 220
Hold w 480
Down Shift
try {
  Down w
  try { Key Space; Start-Sleep -Milliseconds 600 }
  finally { Up w }
} finally { Up Shift }
Hold s 250
Key Space
Start-Sleep -Milliseconds 850
$video=Read (Get-Content -Raw -Encoding utf8 "$PSScriptRoot/capture-stop.js")
[IO.File]::WriteAllBytes((Join-Path $script:Evidence ($Version+'.webm')),[Convert]::FromBase64String($video))
$frames=(Cmd @('eval','--page',$PageId,'--expression','window.__finishLocomotion()')).result
$trace=Join-Path $env:TEMP ('oblivion-motion-'+$Version+'.json')
[IO.File]::WriteAllText($trace,$frames)
$s=Read
Key Escape
$bundle=Read 'document.querySelector(`script[type=module]`).src'
node "$PSScriptRoot/measure-locomotion.mjs" $trace (Join-Path $script:Evidence ($Version+'.json')) $bundle $Version
if($LASTEXITCODE){throw 'Locomotion measurement failed.'}
Write-Output "Trace $trace. Jumps $($s.jump.jumps), landings $($s.jump.landings), bundle $bundle."
if($s.jump.landings -ne 2){throw 'Expected a running jump and a stationary jump.'}
