param([Parameter(Mandatory=$true)][string]$PageId,[ValidateSet('hands','cover')][string]$Stage='hands')
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory "$PSScriptRoot/../../docs/validation/2026-11-24/combat-followup"
function ClickId($id){Cmd @('click','--page',$PageId,'--element',('#'+$id))|Out-Null}
function Check($value,$message){if(!$value){throw $message}}
function SetCamera($side){
  if(!(Read).paused){Key Escape}
  ClickId 'settings-open'
  Cmd @('select','--page',$PageId,'--element','#camera-shoulder','--value',$side)|Out-Null
  Key Escape
  Enter-Chapter
}
function ReenterCanvas {
  if((Read).input.outside){
    Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null
    Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null
    Start-Sleep -Milliseconds 250
  }
}
function Fire($bow=$false){
  ReenterCanvas
  $before=(Read).spells.fired
  Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null
  try{if($bow){Start-Sleep -Milliseconds 1150}}
  finally{Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}
  Start-Sleep -Milliseconds 850
  $s=Read
  Check ($s.spells.fired -gt $before) 'No native shot was emitted'
  return $s
}
$cases=[Collections.Generic.List[object]]::new()
if($Stage -eq 'hands'){
  Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
  ClickId 'settings-open'
  if((Read).preferences.pointerLock){ClickId 'pointer-lock'}
  if((Read).preferences.dominantHand -ne 'left'){ClickId 'left-handed'}
  ClickId 'settings-back'
  Enter-Chapter
  Cmd @('wait','--page',$PageId,'--selector','#game[data-input=free-look]')|Out-Null
}
Read (Get-Content -Raw "$PSScriptRoot/capture-start.js")|Out-Null
try {
  if($Stage -eq 'hands'){
    foreach($mode in 'first','left','right'){
      if($mode -ne 'first'){
        if((Read).viewMode -eq 'first'){Key V}
        SetCamera $mode
      }
      Key 1
      Key R
      WaitForWeapon wand
      Look -Point @(7.3,1.5,-3)
      $s=Fire
      Check ($s.weapon.dominantHand -eq 'left') 'Left hand preference was not applied'
      $shot=$s.spells.events[-1]
      Check $shot.hit 'Wand missed the actual room surface'
      $error=[math]::Sqrt([math]::Pow($shot.aim[0]-$shot.end[0],2)+[math]::Pow($shot.aim[1]-$shot.end[1],2)+[math]::Pow($shot.aim[2]-$shot.end[2],2))
      Check ($error -lt .001) 'Unobstructed left-hand wand did not converge on the camera point'
      Capture ('left-wand-'+$mode)
      $cases.Add(@{view=$mode;tool='wand';error=$error;position=$s.position;weapon=$s.weapon;shot=$shot})
      Key 2
      WaitForWeapon bow
      Look -Point @(7.3,1.5,-3)
      $s=Fire $true
      $shot=$s.spells.events[-1]
      Check ($s.weapon.dominantHand -eq 'left' -and $shot.id -eq 'blaster-j' -and $shot.hit) 'Left-hand bow impact was not observed'
      $horizontalSquared=$shot.direction[0]*$shot.direction[0]+$shot.direction[2]*$shot.direction[2]
      $flight=(($shot.end[0]-$shot.start[0])*$shot.direction[0]+($shot.end[2]-$shot.start[2])*$shot.direction[2])/($shot.speed*$horizontalSquared)
      $drop=$shot.start[1]+$shot.speed*$shot.direction[1]*$flight-$shot.end[1]
      Check ($drop -gt .01) 'No gravity drop was measured'
      Capture ('left-bow-'+$mode)
      $cases.Add(@{view=$mode;tool='bow';drop=$drop;flight=$flight;expectedDrop=4.9*$flight*$flight;position=$s.position;weapon=$s.weapon;shot=$shot})
    }
  } else {
    if((Read).paused){Enter-Chapter}
    if((Read).viewMode -eq 'third'){Key V}
    if((Read).movement.posture -ne 'standing'){Key Space}
    # This offset lets Go use actual room world coordinates.
    $origin=@(0,0,0);$visited=[Collections.Generic.List[object]]::new()
    Go 2.67 -4.45
    Key Z
    Key V
    SetCamera center
    Key 1;Key R
    WaitForWeapon wand
    Look -Angles @([math]::PI,0)
    Capture 'low-cover-before'
    $s=Fire
    Capture 'low-cover-hit'
    $shot=$s.spells.events[-1]
    $cases.Add(@{view='third-center';tool='wand';position=$s.position;camera=$s.camera;posture=$s.movement.posture;weapon=$s.weapon;shot=$shot})
    Check ($shot.hit -and $shot.cameraMesh -ne $shot.mesh) 'The visible camera target and blocked muzzle surface were not distinct'
    Key 2
    WaitForWeapon bow
    Look -Angles @([math]::PI,0)
    $s=Fire $true
    Capture 'low-cover-bow-hit'
    $shot=$s.spells.events[-1]
    $cases.Add(@{view='third-center';tool='bow';position=$s.position;camera=$s.camera;posture=$s.movement.posture;weapon=$s.weapon;shot=$shot})
    Check ($shot.hit -and $shot.cameraMesh -ne $shot.mesh) 'The bow passed through low cover to the camera target'
  }
  @{base='46df46d75b0e507628a6905930386859bf678ff6';bundle=(Read 'document.querySelector(`script[type=module]`).src');cases=$cases}|ConvertTo-Json -Depth 16|Set-Content (Join-Path $script:Evidence ($Stage+'.json')) -Encoding utf8
} finally {
  $video=Read (Get-Content -Raw "$PSScriptRoot/capture-stop.js")
  [IO.File]::WriteAllBytes((Join-Path $script:Evidence ($Stage+'.webm')),[Convert]::FromBase64String($video))
}
