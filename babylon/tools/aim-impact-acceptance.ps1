param([Parameter(Mandatory=$true)][string]$PageId)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory "$PSScriptRoot/../../docs/validation/2026-11-24/motion-combat/after"
$saved=(Read).preferences
$cases=[Collections.Generic.List[object]]::new()
function CenterCanvas {
  Cmd @('mouse','move','--page',$PageId,'--x','640','--y','360')|Out-Null
  if((Read).input.outside){
    Cmd @('click','--page',$PageId,'--element','#game')|Out-Null
  }
  Start-Sleep -Milliseconds 250
}
function Shot {
  CenterCanvas
  Cmd @('click','--page',$PageId,'--element','#game')|Out-Null
}
Read (Get-Content -Raw "$PSScriptRoot/capture-start.js")|Out-Null
try {
  if((Read).paused){Cmd @('click','--page',$PageId,'--element','#start')|Out-Null}
  if((Read).viewMode -ne 'first'){Key V}
  Key 1
  if((Read).weapon.ammo -lt 3){Key R;WaitForWeapon wand}
  foreach($mode in 'first','left','right'){
    if($mode -ne 'first'){
      if((Read).viewMode -eq 'first'){Key V}
      Key Escape
      Cmd @('click','--page',$PageId,'--element','#settings-open')|Out-Null
      Cmd @('select','--page',$PageId,'--element','#camera-shoulder','--value',$mode)|Out-Null
      Key Escape
      Cmd @('click','--page',$PageId,'--element','#start')|Out-Null
    }
    Look -Angles @(0,.45)
    Start-Sleep -Milliseconds 300
    $before=(Read).spells.fired
    Shot
    Start-Sleep -Milliseconds 550
    $state=Read
    $shot=$state.spells.events[-1]
    if($state.spells.fired -le $before -or !$shot.hit){throw "Missing wand impact in $mode"}
    $error=[math]::Sqrt([math]::Pow($shot.aim[0]-$shot.end[0],2)+[math]::Pow($shot.aim[1]-$shot.end[1],2)+[math]::Pow($shot.aim[2]-$shot.end[2],2))
    if(!$shot.muzzleBlocked -and $error -gt .03){throw "Aim differed by $error in $mode"}
    Capture ('wand-'+$mode)
    $cases.Add(@{view=$mode;kind='wand';aimError=$error;shot=$shot;retained=$state.spells.retained})
  }
  Key 2
  WaitForWeapon bow
  Look -Angles @(0,.15)
  foreach($duration in @(0,1200)){
    if($duration -eq 0){Shot}else{
      CenterCanvas
      Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null
      try{Start-Sleep -Milliseconds $duration}finally{Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}
    }
    Start-Sleep -Milliseconds 1300
    $state=Read
    $shot=$state.spells.events[-1]
    if($shot.id -ne 'blaster-j' -or !$shot.arrived -or !$shot.hit){throw 'Missing swept arrow impact'}
    if($duration -eq 0 -and $shot.bowPower -ge .3){throw 'A native tap should be a quick release'}
    Capture ('arrow-'+$duration)
    $cases.Add(@{view=$state.viewMode;shoulder=$state.preferences.cameraShoulder;kind='bow';shot=$shot;retained=$state.spells.retained})
    WaitForWeapon bow
  }
  Start-Sleep -Milliseconds 1800
  Capture 'retained-arrow'
  @{browser='Orca';bundle=(Read 'document.querySelector(`script[type=module]`).src');cases=$cases}|ConvertTo-Json -Depth 15|Set-Content (Join-Path $script:Evidence 'aim-impacts.json') -Encoding utf8
} finally {
  $video=Read (Get-Content -Raw "$PSScriptRoot/capture-stop.js")
  [IO.File]::WriteAllBytes((Join-Path $script:Evidence 'aim-impacts.webm'),[Convert]::FromBase64String($video))
  if((Read).preferences.cameraShoulder -ne $saved.cameraShoulder){
    if(!(Read).paused){Key Escape}
    Cmd @('click','--page',$PageId,'--element','#settings-open')|Out-Null
    Cmd @('select','--page',$PageId,'--element','#camera-shoulder','--value',$saved.cameraShoulder)|Out-Null
    Key Escape
  }
}
