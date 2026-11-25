param([Parameter(Mandatory=$true)][string]$PageId,[Parameter(Mandatory=$true)][string]$EvidenceDirectory,[string]$GameUrl='http://localhost:4186/')
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
function ClickId($id){Cmd @('click','--page',$PageId,'--element',('#'+$id))|Out-Null}
function InterruptRecharge([string]$code){
  $started=Read ('(()=>{const tap=code=>{for(const type of [`keydown`,`keyup`])window.dispatchEvent(new KeyboardEvent(type,{code}))};tap(`KeyR`);const started=__ROOM_DEMO__.snapshot().weapon.state===`reloading`;tap(`'+$code+'`);return started})()')
  if(!$started){throw 'The wand did not start charging before the interruption'}
}
function DataFile($name,$b64){[IO.File]::WriteAllBytes((Join-Path $script:Evidence $name),[Convert]::FromBase64String($b64))}
function Review($key,$view,$hand){
  Key $key;Start-Sleep -Milliseconds 580
  ClickId 'game';Start-Sleep -Milliseconds 300
  $start=Read
  if($start.viewMode -ne $view -or $start.preferences.dominantHand -ne $hand){throw 'Incorrect perspective or hand'}
  Read (Get-Content -Raw -Encoding utf8 "$PSScriptRoot/recharge-review.js")|Out-Null
  if($hand -eq 'right'){Read (Get-Content -Raw "$PSScriptRoot/capture-start.js")|Out-Null}
  Key R
  Start-Sleep -Milliseconds 1680
  $result=Read 'window.__rechargeReview.finish()'
  $name="$hand-$view-$key"
  if($hand -eq 'right'){DataFile "$name.webm" (Read (Get-Content -Raw "$PSScriptRoot/capture-stop.js"))}
  $frame=Read 'window.__rechargeReview.frame()'
  if($frame){DataFile "$name.webp" $frame}
  $max=6
  if($result.initial -ge $max -or $result.final -ne $max -or $result.fired -or $result.earlyRefill -or !$result.refilledOnFlash -or $result.phases.Count -ne 3 -or !$frame -or $result.audio[-1] -ne 'reload-complete' -or $result.largestReachGap -gt .03 -or $result.largestNockGap -gt .032){
    throw ($result|ConvertTo-Json -Depth 3 -Compress)
  }
  Write-Host ("{0} {1} {2} · reach {3:N3} m" -f $hand,$view,$result.tool,$result.largestReachGap)
  return $result
}
Open-FramebufferCapture $GameUrl
Cmd @('wait','--page',$PageId,'--selector','#start:not(:disabled)')|Out-Null
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
$original=(Read).preferences
$checks=@()
try{
  ClickId 'settings-open'
  if($original.pointerLock){ClickId 'pointer-lock'}
  if($original.dominantHand -eq 'left'){ClickId 'left-handed'}
  Key Escape;Enter-Chapter
  Hold w 580
  foreach($hand in 'right','left'){
    if($hand -eq 'left'){Key Escape;ClickId 'settings-open';ClickId 'left-handed';Key Escape;Enter-Chapter;Key V}
    foreach($view in 'first','third'){
      if($view -eq 'third'){Key V}
      $checks+=Review '1' $view $hand
    }
  }
  ClickId 'game';Start-Sleep -Milliseconds 290
  $before=(Read).weapon
  InterruptRecharge 'Digit2'
  Start-Sleep -Milliseconds 1450
  Key 1;Start-Sleep -Milliseconds 570
  $after=(Read).weapon
  if($after.ammo -ne $before.ammo -or $after.shots -ne $before.shots -or $after.recharge.completionGlow){throw 'Cancelled recharge changed weapon energy or fired a shot'}
  InterruptRecharge 'Escape'
  $paused=Read
  Start-Sleep -Milliseconds 1500
  $later=Read
  if(!$paused.paused -or $paused.weapon.state -ne 'reloading' -or $later.weapon.reloadProgress -ne $paused.weapon.reloadProgress){throw 'Recharge did not freeze in menu'}
  Enter-Chapter;Start-Sleep -Milliseconds 1600
  if((Read).weapon.ammo -ne 6){throw 'Recharge did not resume'}
  $count=(Read).weapon.ammo
  for($i=0;$i -lt ($count-1);$i++){ClickId 'game';Start-Sleep -Milliseconds 300}
  $beforeLastShot=(Read).weapon
  if($beforeLastShot.ammo -ne 1){throw 'Wand did not reach its final charge'}
  Read (Get-Content -Raw -Encoding utf8 "$PSScriptRoot/recharge-review.js")|Out-Null
  ClickId 'game';Start-Sleep -Milliseconds 1600
  $auto=Read 'window.__rechargeReview.finish()'
  if(!$auto.refilledOnFlash -or $auto.initial -ne 1 -or $auto.final -ne $count -or $auto.fired -ne 1 -or
     $auto.earlyRefill -or $auto.phases.Count -ne 3 -or (Read).weapon.reloads -ne ($beforeLastShot.reloads+1)){
    throw ('Automatic recharge after the last shot: '+($auto|ConvertTo-Json -Compress))
  }
  $receipt=[ordered]@{browser='Orca';bundle=(Read 'document.querySelector(`script[type=module]`).src');checks=$checks;empty=@($auto);switchCancelled=$true;pauseResumed=$true}
  $receipt|ConvertTo-Json -Depth 5|Set-Content (Join-Path $script:Evidence 'checks.json') -Encoding utf8
  Key Escape
}finally{RestoreInputPreferences $original}
