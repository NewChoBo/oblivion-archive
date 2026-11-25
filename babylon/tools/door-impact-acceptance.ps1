param([Parameter(Mandatory=$true)][string]$PageId)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory "$PSScriptRoot/../../docs/validation/2026-11-24/combat-followup"
function Check($value,$message){if(!$value){throw $message}}
function MoveUntil($key,$condition){
  Cmd @('exec','--page',$PageId,'--command',('keydown '+$key))|Out-Null
  try {
    $reached=Read ('new Promise(resolve=>{const end=performance.now()+11000;function sample(){const s=window.__ROOM_DEMO__.snapshot();if('+$condition+')resolve(true);else if(performance.now()>end||s.paused)resolve(false);else requestAnimationFrame(sample)}sample()})')
    Check $reached ('Did not reach '+$condition)
  } finally {Cmd @('exec','--page',$PageId,'--command',('keyup '+$key))|Out-Null}
}
function NativeFire($bow=$false){
  if((Read).input.outside){
    Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null
    Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null
    Start-Sleep -Milliseconds 250
  }
  Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null
  try{if($bow){Start-Sleep -Milliseconds 1150}}
  finally{Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}
}
function ClearPlinthRow {
  if((Read).movement.posture -ne 'prone'){Key Z}
  for($attempt=0;$attempt -lt 8;$attempt++){
    $x=(Read).position[0]
    if($x -gt 9.91 -or ($x -ge 8.30 -and $x -lt 8.90)){return}
    if($x -ge 8.90 -and $x -lt 9.40){Hold s 50}else{Hold w 50}
  }
  throw 'Could not clear the real plinth row'
}
function FocusRune($z,$targetId){
  if((Read).position[0] -gt 10.17){Look -Angles @(1.5708,0);MoveUntil s 's.position[0]<10.12'}
  $point=if((Read).position[0] -lt 9.4){@(9.11,1.12,$z)}else{@(9.4,.57,$z)}
  Look -Point $point -TargetId $targetId
}
Cmd @('reload','--page',$PageId)|Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not([disabled])')|Out-Null
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
Enter-Chapter
Hold w 1400
Look -Point @(.5,1.59,1.8) -TargetId 'photo';Key E
Check ((Read).phase -eq 1) 'Photo investigation failed'
Look -Angles @(0,.06)
MoveUntil a 's.position[0]<-1.4';MoveUntil w 's.position[2]>3.5'
Key Z
for($attempt=0;$attempt -lt 6;$attempt++){
  $x=(Read).position[0]
  if([math]::Abs($x) -lt .72){break}
  if($x -lt 0){MoveUntil d 's.position[0]>-.40'}else{MoveUntil a 's.position[0]<.40'}
}
Key Z;MoveUntil w 's.position[2]>10.03'
Look -Angles @(1.5708,0);MoveUntil w 's.position[0]>3.2'
Look -Point @(3.6,1.5,12.24) -TargetId 'mural';Key E
Check ((Read).chapter.clue) 'Mural evidence failed'
Key Escape;ClickButton '#retry-checkpoint'
Cmd @('exec','--page',$PageId,'--command','keydown Shift')|Out-Null
try{MoveUntil w 's.position[0]>7.0'}finally{Cmd @('exec','--page',$PageId,'--command','keyup Shift')|Out-Null}
Key C
if((Read).position[0] -lt 8.67){MoveUntil w 's.position[0]>8.67'}
FocusRune 10.3 'rune1';Key E;Key E
Look -Angles @(1.5708,0);ClearPlinthRow
MoveUntil a 's.position[2]>11.16'
if((Read).position[0] -lt 8.60){MoveUntil w 's.position[0]>8.61'}
FocusRune 11.35 'rune0';Key E
Check (((Read).chapter.runes -join ',') -eq '0,1,2') 'The rune puzzle was not solved'
Look -Angles @(1.5708,0);ClearPlinthRow
MoveUntil d 's.position[2]<8.77';MoveUntil w 's.position[0]>9.98'
Key C;MoveUntil a 's.position[2]>10.09';MoveUntil w 's.position[0]>11.25'
Look -Point @(11.9,1.5,10.3) -TargetId 'seal'
Capture 'door-before-casting'
Read (Get-Content -Raw "$PSScriptRoot/capture-start.js")|Out-Null
Read '(()=>{const frames=[],first=window.__ROOM_DEMO__.snapshot().spells.fired;let active=true;function sample(t){if(!active)return;const s=window.__ROOM_DEMO__.snapshot();frames.push({time:t,phase:s.phase,open:s.world.vaultOpen,marks:s.spells.retained.filter(p=>p.number>first)});requestAnimationFrame(sample)}requestAnimationFrame(sample);window.__finishDoorProbe=()=>{active=false;return frames};return true})()'|Out-Null
try {
  Key 2;WaitForWeapon bow
  NativeFire $true
  Key 1;WaitForWeapon wand
  NativeFire
  $before=Read
  Capture 'door-mark-before-open'
  Key E
  Check ((Read).phase -eq 2) 'Door activation failed'
  Capture 'door-opening'
  Read 'new Promise(resolve=>{function sample(){if(window.__ROOM_DEMO__.snapshot().world.vaultOpen)resolve(true);else requestAnimationFrame(sample)}sample()})'|Out-Null
  Capture 'door-open'
  $frames=Read 'window.__finishDoorProbe()'
  @{base='46df46d75b0e507628a6905930386859bf678ff6';bundle=(Read 'document.querySelector(`script[type=module]`).src');before=$before;after=(Read);frames=$frames}|ConvertTo-Json -Depth 17 -Compress|Set-Content (Join-Path $script:Evidence 'door-frames.json') -Encoding utf8
} finally {
  Read 'window.__finishDoorProbe()'|Out-Null
  $video=Read (Get-Content -Raw "$PSScriptRoot/capture-stop.js")
  [IO.File]::WriteAllBytes((Join-Path $script:Evidence 'door.webm'),[Convert]::FromBase64String($video))
}
