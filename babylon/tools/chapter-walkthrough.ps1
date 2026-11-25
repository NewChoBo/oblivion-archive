param([Parameter(Mandatory=$true)][string]$PageId,[string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-22/final",
      [int]$Width=1280,[int]$Height=720,[switch]$Mobile,[switch]$SkipReload,[switch]$FromFirstCheckpoint)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
function Check([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function MoveUntil([string]$Key,[string]$Condition){
  Cmd @('exec','--page',$PageId,'--command',('keydown '+$Key)) | Out-Null
  try {
    $reached=Read ('new Promise(resolve=>{const end=performance.now()+11000;function sample(){const s=window.__ROOM_DEMO__.snapshot();if('+ $Condition +')resolve(true);else if(performance.now()>end||s.paused)resolve(false);else requestAnimationFrame(sample)}sample()})')
    Check $reached ("Did not reach "+$Condition)
  } finally { Cmd @('exec','--page',$PageId,'--command',('keyup '+$Key)) | Out-Null }
}
if(!$FromFirstCheckpoint){
if(!$SkipReload){Cmd @('reload','--page',$PageId)|Out-Null}
Cmd @('wait','--page',$PageId,'--selector','#start:not([disabled])','--timeout','60000')|Out-Null
$viewport=@('viewport','--page',$PageId,'--width',([string]$Width),'--height',([string]$Height))
if($Mobile){$viewport+='--mobile'}
Cmd $viewport|Out-Null
Enter-Chapter
Cmd @('wait','--page',$PageId,'--selector','#game[data-input=free-look],#game[data-input=locked]') | Out-Null
if((Read).input.captureChoice -eq 'denied'){ClickButton '#free-cursor'}
Capture '01-start'
Hold w 1400
Look -Angles @(-.8,0)
Key E
Check ((Read 'document.getElementById(`interact`).hidden') -and (Read).phase -eq 0) 'Photo activated while looking away'
Look -Point @(.5,1.59,1.8) -TargetId 'photo'
if((Read).input.locked){Key E}else{Cmd @('click','--page',$PageId,'--element','#interact')|Out-Null}
Check ((Read).phase -eq 1) 'Photo investigation failed'
Look -Angles @(0,.06)
# Stay inside the clear lane between the desk and the arch before aligning sideways.
Key Z
MoveUntil a 's.position[0]<-1.4'
MoveUntil w 's.position[2]>3.3'
if((Read).position[2] -gt 5.6){MoveUntil s 's.position[2]<5.0'}
for($attempt=0;$attempt -lt 6;$attempt++){
  $x=(Read).position[0]
  if([math]::Abs($x) -lt .72){break}
  if($x -lt 0){MoveUntil d 's.position[0]>-.40'}
  else{MoveUntil a 's.position[0]<.40'}
}
Check ([math]::Abs((Read).position[0]) -lt .72) 'Could not line up with the north arch'
Key C
MoveUntil w 's.position[2]>9.65'
Look -Angles @(1.5708,0)
}else{
  if(!(Read).paused){Key Escape}
  ClickButton '#retry-checkpoint'
  Look -Angles @(1.5708,0)
}
# Approach the mural slowly so delayed key-up cannot carry the player out of interaction range.
if((Read).movement.posture -ne 'crouch'){Key C}
if((Read).position[2] -gt 11.45){MoveUntil d 's.position[2]<10.75'}
if((Read).position[0] -lt 3.2){MoveUntil w 's.position[0]>3.2'}
if((Read).position[0] -gt 4.4){MoveUntil s 's.position[0]<3.65'}
Key C
Look -Point @(3.6,1.5,12.24) -TargetId 'mural'
Check (Read '!document.getElementById(`interact`).hidden && window.__EXPEDITION__.snapshot().target===`mural`') 'Mural prompt is not in reach'
Key E;Check ((Read).chapter.clue) 'Mural evidence failed'
Capture '02-corridor-and-mural'
# Use the real menu checkpoint button to confirm retry before running the gauntlet.
Key Escape;ClickButton '#retry-checkpoint';Check ([math]::Abs((Read).position[0]-1.7) -lt .15) 'Checkpoint spawn failed'
# Reach the ward, then handle either side of a plinth if native key-up arrives late.
Cmd @('exec','--page',$PageId,'--command','keydown Shift')|Out-Null
try{MoveUntil w 's.position[0]>7.0'}finally{Cmd @('exec','--page',$PageId,'--command','keyup Shift')|Out-Null}
Key C
if((Read).position[0] -lt 8.67){MoveUntil w 's.position[0]>8.67'}
function FocusRune($z,$targetId){
  $state=Read
  $x=$state.position[0]
  if($x -gt 10.17){Look -Angles @(1.5708,0);MoveUntil s 's.position[0]<10.12'}
  $target=if((Read).position[0] -lt 9.4){@(9.11,1.12,$z)}else{@(9.4,.57,$z)}
  Look -Point $target -TargetId $targetId
  Check ((Read '!document.getElementById(`interact`).hidden && window.__EXPEDITION__.snapshot().target') -eq $targetId) ("Expected "+$targetId+" at "+((Read).position -join ','))
}
function ClearPlinthRow(){
  if((Read).movement.posture -ne 'prone'){Key Z}
  for($attempt=0;$attempt -lt 8;$attempt++){
    $x=(Read).position[0]
    if($x -gt 9.91){return}
    if($x -ge 8.30 -and $x -lt 8.90){return}
    if($x -ge 8.90 -and $x -lt 9.40){Hold s 50}else{Hold w 50}
  }
  throw "Could not clear the plinth row at $((Read).position)"
}
$work=(& node --experimental-strip-types "$PSScriptRoot/export-citadel-construction.mjs"|ConvertFrom-Json).workLayout
$middleZ=10.3+$work.corridor.plinthShiftZ
$leftZ=11.35+$work.corridor.plinthShiftZ
FocusRune $middleZ 'rune1'
Key E;Key E
Look -Angles @(1.5708,0)
# Leave the line of plinths before moving north or south along it. A delayed
# key-up can leave the player in a gap between two solid pedestals.
ClearPlinthRow
$leftApproach=($leftZ-.19).ToString([cultureinfo]::InvariantCulture)
MoveUntil a "s.position[2]>$leftApproach"
if((Read).position[0] -lt 8.60){MoveUntil w 's.position[0]>8.61'}
FocusRune $leftZ 'rune0'
Key E
Check (((Read).chapter.runes -join ',') -eq '0,1,2') 'Spatial rune puzzle was not solved'
Look -Angles @(1.5708,0)
# Walk around the south end only if still on the entry side of the plinths.
ClearPlinthRow
if((Read).position[0] -lt 9.98){
  if((Read).position[2] -gt 8.9){MoveUntil d 's.position[2]<8.9'}
  MoveUntil w 's.position[0]>9.98'
}
Key C
if((Read).position[2] -lt 10.09){MoveUntil a 's.position[2]>10.09'}
if((Read).position[2] -gt 10.6){MoveUntil d 's.position[2]<10.6'}
if((Read).position[0] -lt 11.25){MoveUntil w 's.position[0]>11.25'}
Key V
Look -Angles @(-2.31,0)
Key E
Check ((Read 'document.getElementById(`interact`).hidden') -and (Read).phase -eq 1) 'Door activated behind the third-person player'
Capture '03-looking-away'
Look -Point @(11.9,1.5,10.3) -TargetId 'seal'
Cmd @('wait','--page',$PageId,'--selector','#interact:not([hidden])')|Out-Null
Capture '03-door-focus'
Key E
Check ((Read).phase -eq 2) 'Sealed door did not open'
Capture '03-vault-open'
# Preserve this safe checkpoint and explicitly verify retry there as well.
Key Escape
ClickButton '#retry-checkpoint'
if((Read).paused){Enter-Chapter}
MoveUntil w 's.position[0]>14.35'
if((Read).viewMode -eq 'third'){Key V}
Key C
MoveUntil d 's.position[2]<9.58'
# Allow for native key-up latency before aiming at the two nearby interactables.
if((Read).position[2] -lt 9.07){MoveUntil a 's.position[2]>9.07'}
Look -Point @(15.4,1.55,7.15)
Key E
Check ((Read 'document.getElementById(`interact`).hidden') -and (Read).phase -eq 2) 'The ledger behind the player activated while facing the latch'
Capture '04-facing-latch-before-unlock'
Look -Point @(15.81,1.65,10.3) -TargetId 'ledger'
Capture '04-facing-ledger'
Key E
Check ((Read).phase -eq 3) 'Ledger evidence failed'
# Approach along the sightline to the latch. Other nearby folios also show E.
if(!(Read).defeated){
  try{
    Look -Point @(15.4,1.55,7.15) -TargetId 'shortcut'
    Key E
  }catch{if(!(Read).defeated){throw}}
}
if((Read).phase -eq 3){
  if((Read).defeated){Enter-Chapter}
  else{Key Escape;ClickButton '#retry-checkpoint'}
  Look -Point @(15.4,1.55,7.15)
  MoveUntil w '!document.querySelector(`#interact`).hidden && window.__EXPEDITION__.snapshot().target===`shortcut`'
  Key E
}
Check ((Read).phase -eq 4) 'Shortcut latch failed'
# Align with the reading-room doorway before crossing its narrow opening.
if((Read).movement.posture -ne 'prone'){Key Z}
Look -Angles @(0,0)
if((Read).position[2] -gt 6.25){MoveUntil s 's.position[2]<5.85'}
for($attempt=0;$attempt -lt 8;$attempt++){
  $offset=(Read).position[2]-5.4
  if([math]::Abs($offset) -le .28){break}
  if($offset -gt 0){Hold s 160}else{Hold w 160}
}
Check ([math]::Abs((Read).position[2]-5.4) -le .28) 'Could not align with the reading-room doorway'
Capture '04-shortcut'
MoveUntil a 's.position[0]<6.4'
Key Z
MoveUntil a 's.position[0]<-1.25'
MoveUntil s 's.position[2]<1.10'
MoveUntil d 's.position[0]>-.35'
if([math]::Pow((Read).position[0]-.4,2)+[math]::Pow((Read).position[2]-.85,2) -gt 1.69){
  Look -Point @(.5,1.59,1.8)
  MoveUntil w 'Math.hypot(s.position[0]-.4,s.position[2]-.85)<1.15'
}
Look -Point @(.5,1.59,1.8) -TargetId 'photo'
Key E
Check ((Read).phase -eq 5) 'Restoration ending failed'
Capture '05-ending'
$receipt=[ordered]@{browser='Orca embedded browser';method='Orca native keydown/keyup, keypress, UI clicks; read-only state snapshots; no progression or position setter';url=(Read 'location.href');bundle=(Read '[...document.scripts].map(s=>s.src).filter(Boolean)');final=(Read);expedition=(Read 'window.__EXPEDITION__?.snapshot()');pass=$true}
$receipt|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $script:Evidence 'walkthrough.json') -Encoding utf8
Cmd @('console','--page',$PageId,'--limit','100')|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $script:Evidence 'console.json') -Encoding utf8
Write-Output ('PASS '+(Join-Path $script:Evidence 'walkthrough.json'))
