param([Parameter(Mandatory=$true)][string]$PageId,[string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-22/controls")
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
function Check([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Mouse([int]$X,[int]$Y){Cmd @('mouse','move','--page',$PageId,'--x',"$X",'--y',"$Y")|Out-Null}
function MotionSample([int]$Expected){
  Read ("new Promise(r=>{const start=performance.now();function frame(){const s=window.__ROOM_DEMO__.snapshot();if(Math.abs(s.movement.speed-"+$Expected+")<.1||performance.now()-start>3500)r(s);else requestAnimationFrame(frame)}frame()})")
}
function BeginAgain(){Key Escape;ClickButton '#restart'}
$result=[ordered]@{browser='Orca embedded browser';method='Native Orca keys, mouse and UI; snapshots and MediaRecorder output only'}
Cmd @('reload','--page',$PageId)|Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not([disabled])')|Out-Null
$result.bundle=Read 'document.querySelector(`script[type=module]`).src'
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
ClickButton '#settings-open';ClickButton '#settings-reset';Cmd @('click','--page',$PageId,'--element','#sensitivity')|Out-Null;Key End
ClickButton '#keyboard-heading';ClickButton '#key-bindings [data-action=jump]';Key W
$result.conflict=Read 'document.getElementById(`settings-message`).textContent'
$expectedConflict=if((Read 'document.documentElement.lang') -eq 'ko'){'사용 중'}else{'is assigned to'}
Check ($result.conflict.Contains($expectedConflict)) 'Conflicting jump binding was accepted'
Key J
$result.changed=(Read).preferences
Check ($result.changed.bindings.jump -eq 'KeyJ') 'Jump rebind failed'
Check ($result.changed.sensitivity -eq 3) 'Sensitivity slider did not receive End'
Capture '01-settings'
ClickButton '#settings-back'
Cmd @('reload','--page',$PageId)|Out-Null;Cmd @('wait','--page',$PageId,'--selector','#start:not([disabled])')|Out-Null
$result.persisted=(Read).preferences
Check ($result.persisted.bindings.jump -eq 'KeyJ' -and $result.persisted.sensitivity -eq 3) 'Settings did not survive reload'
Enter-Chapter
Cmd @('wait','--page',$PageId,'--selector','#game[data-input=free-look],#game[data-input=locked]')|Out-Null
$result.lock=(Read).input
if($result.lock.captureChoice -eq 'denied'){ClickButton '#free-cursor'}
Key J;$result.jump=(Read).jump
Check ($result.jump.jumps -ge 1) 'Rebound jump key did not jump'
$result.airInputVerification='The unit test covers repeated jump input while airborne. The native keypress round trip exceeded the time in the air.'
Key Escape;ClickButton '#settings-open';ClickButton '#settings-reset';$result.reset=(Read).preferences;ClickButton '#settings-back';ClickButton '#start'
Mouse 100 250;$before=Read;Mouse 240 250;$after=Read;$result.look1=$after.yaw-$before.yaw
Check ([Math]::Abs($result.look1-.364) -lt .02) 'No-button look or default sensitivity failed'
Key Escape;ClickButton '#settings-open';Cmd @('click','--page',$PageId,'--element','#sensitivity')|Out-Null;Key End;ClickButton '#settings-back';ClickButton '#start'
Mouse 100 250;$before=Read;Mouse 240 250;$after=Read;$result.look3=$after.yaw-$before.yaw
Check ([Math]::Abs($result.look3/$result.look1-3) -lt .05) 'Sensitivity ratio failed'
Key Escape;ClickButton '#settings-open';ClickButton '#settings-reset';ClickButton '#settings-back';ClickButton '#restart'
Cmd @('exec','--page',$PageId,'--command','keydown w')|Out-Null;try{$result.walk=MotionSample 3}finally{Cmd @('exec','--page',$PageId,'--command','keyup w')|Out-Null}
Check ([Math]::Abs($result.walk.movement.speed-3) -lt .1) 'Walking speed failed'
BeginAgain
Cmd @('exec','--page',$PageId,'--command','keydown Shift')|Out-Null;Cmd @('exec','--page',$PageId,'--command','keydown w')|Out-Null;try{$result.run=MotionSample 5}finally{Cmd @('exec','--page',$PageId,'--command','keyup w')|Out-Null;Cmd @('exec','--page',$PageId,'--command','keyup Shift')|Out-Null}
Check ([Math]::Abs($result.run.movement.speed-5) -lt .1) 'Sprinting speed failed'
BeginAgain
$result.first=Read;Key V;$result.third=Read
Check ($result.third.viewMode -eq 'third' -and $result.third.phase -eq $result.first.phase -and $result.third.weapon.ammo -eq $result.first.weapon.ammo) 'Perspective switch lost state'
Read (Get-Content -LiteralPath "$PSScriptRoot/capture-start.js" -Raw)|Out-Null
Cmd @('exec','--page',$PageId,'--command','keydown Shift')|Out-Null;Cmd @('exec','--page',$PageId,'--command','keydown d')|Out-Null;try{Key Space;Start-Sleep -Milliseconds 900;$result.runningJump=Read}finally{Cmd @('exec','--page',$PageId,'--command','keyup d')|Out-Null;Cmd @('exec','--page',$PageId,'--command','keyup Shift')|Out-Null}
$layout=Get-Content -Encoding utf8 -Raw "$PSScriptRoot/../../shared/levels/chapter-1.json"|ConvertFrom-Json
$catalog=Get-Content -Encoding utf8 -Raw "$PSScriptRoot/../../shared/levels/environment-prefabs.json"|ConvertFrom-Json
$column=$layout.zones.readingRoom|Where-Object id -eq 'reading-column-east-1'
$reach=$column.position[0]-$catalog.prefabs.'timber-column'.parts[0].size[0]/2-.25
Hold d 3000;$result.rightPillar=Read;Capture '02-right-pillar-third'
Check ([Math]::Abs($result.rightPillar.position[0]-$reach) -lt .04) 'Right pillar collision failed'
Hold a 5600;$result.leftPillar=Read;Capture '03-left-pillar-third'
Check ([Math]::Abs($result.leftPillar.position[0]+$reach) -lt .04) 'Left pillar collision failed'
Hold s 900;$result.wallCamera=Read;Capture '04-camera-wall'
Check ($result.wallCamera.player.obstructed) 'Shoulder camera crossed wall'
$video=Read (Get-Content -LiteralPath "$PSScriptRoot/capture-stop.js" -Raw)
[IO.File]::WriteAllBytes((Join-Path $script:Evidence 'movement-third.webm'),[Convert]::FromBase64String($video))
Key Escape;$result.paused=Read;Hold w 500;$result.pausedAfter=Read
Check ([Math]::Abs($result.paused.position[2]-$result.pausedAfter.position[2]) -lt .001) 'Paused movement leaked'
$result.pass=$true;$result|ConvertTo-Json -Depth 22|Set-Content -LiteralPath (Join-Path $script:Evidence 'controls.json') -Encoding utf8
Write-Output ('PASS '+(Join-Path $script:Evidence 'controls.json'))
