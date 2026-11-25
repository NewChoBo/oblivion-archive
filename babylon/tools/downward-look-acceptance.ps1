param([Parameter(Mandatory=$true)][string]$PageId,
      [ValidateSet('before','after')][string]$Version='after',
      [string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-22/downward-look")
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
function MouseY([int]$Y){Cmd @('mouse','move','--page',$PageId,'--x','640','--y',"$Y") | Out-Null}
function Picture([string]$name){
  $shot=Cmd @('screenshot','--page',$PageId)
  Copy-Item -LiteralPath $shot.path -Destination (Join-Path $script:Evidence "$Version-$name.png")
}
function FloorShot(){
  $count=(Read).spells.fired
  Cmd @('mouse','down','--page',$PageId,'--button','left') | Out-Null
  Cmd @('mouse','up','--page',$PageId,'--button','left') | Out-Null
  $s=Read
  if($s.spells.fired -le $count){throw 'Expected a new shot from the canvas.'}
  return $s.spells.events[-1]
}
function View(){
  return Read @'
(() => {
  const s=window.__ROOM_DEMO__.snapshot(), p=s.camera.rotation[0], yaw=s.camera.rotation[1];
  const [x,h,z]=s.camera.position, travel=h/Math.tan(p);
  return {mode:s.viewMode, degrees:p*180/Math.PI, camera:s.camera.position,
    floor:[x+Math.sin(yaw)*travel,0,z+Math.cos(yaw)*travel], player:s.position,
    yaw:s.yaw, tip:s.weapon.muzzle.world,handContacts:s.weapon.handContacts, hands:s.player.hands};
})()
'@
}
Cmd @('reload','--page',$PageId) | Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not([disabled])') | Out-Null
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720') | Out-Null
Enter-Chapter
Cmd @('wait','--page',$PageId,'--selector','#game[data-input=free-look],#game[data-input=locked]') | Out-Null
if((Read).input.captureChoice -eq 'denied'){Cmd @('click','--page',$PageId,'--element','#free-cursor') | Out-Null}
if((Read).input.mode -ne 'free-look'){throw 'The edge reversal test requires free look.'}
Cmd @('wait','--page',$PageId,'--selector','#notice:not(.visible)') | Out-Null
$r=[ordered]@{browser='Orca';bundle=(Read 'document.querySelector(`script[type=module]`).src');input=(Read).input.captureChoice}
MouseY 360
MouseY 713
Start-Sleep -Milliseconds 1600
$r.first=View
Picture 'first'
$r.wand=FloorShot
Key V
Key 2
Cmd @('mouse','down','--page',$PageId,'--button','right')|Out-Null
Start-Sleep -Milliseconds 500
$r.third=View
Picture 'third'
$r.bow=FloorShot
Cmd @('mouse','up','--page',$PageId,'--button','right')|Out-Null
MouseY 697
Start-Sleep -Milliseconds 450
$r.afterReverse=View
MouseY 6
Start-Sleep -Milliseconds 1700
$r.up=View
Key Escape
$r | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $script:Evidence "$Version.json")
if($Version -eq 'after'){
  if([Math]::Abs($r.first.degrees-85) -gt .15 -or [Math]::Abs($r.first.degrees-$r.third.degrees) -gt .05){throw 'Unexpected down limit or view switch'}
  if($r.afterReverse.degrees -ge $r.third.degrees-.2){throw 'Bottom edge still fights an inward mouse movement'}
  if([Math]::Abs($r.up.degrees+60.16) -gt .3){throw 'Upward limit changed'}
  if($r.third.camera[1] -gt 3.8 -or $r.up.camera[1] -lt .19){throw 'Camera crossed the room ceiling or floor padding'}
  # The shoulder camera sits off-axis. Compare the arrow to the reticle on the
  # floor from the draw hand, including parallax at this short distance.
  $left=$r.third.tip
  $right=$r.third.handContacts.right
  $dot=0;$arrowSq=0;$targetSq=0
  foreach($i in 0..2){
    $a=$left[$i]-$right[$i];$b=$r.third.floor[$i]-$right[$i]
    $dot+=$a*$b;$arrowSq+=$a*$a;$targetSq+=$b*$b
  }
  if($dot/[Math]::Sqrt($arrowSq*$targetSq) -lt [Math]::Cos([Math]::PI/180)){throw 'Bow did not align with the floor reticle'}
  foreach($pair in @(@($r.first,$r.wand),@($r.third,$r.bow))){
    $view,$hit=$pair
    $miss=[Math]::Sqrt([Math]::Pow($hit.end[0]-$view.floor[0],2)+[Math]::Pow($hit.end[2]-$view.floor[2],2))
    if(!$hit.hit -or !$hit.arrived -or $miss -gt .05 -or [Math]::Abs($hit.end[1]) -gt .05){throw 'Floor impact missed the reticle'}
  }
}
Write-Output ("$Version look down "+$r.first.degrees+", third "+$r.third.degrees+", after reversal "+$r.afterReverse.degrees)
