param([Parameter(Mandatory=$true)][string]$PageId,[Parameter(Mandatory=$true)][string]$EvidenceDirectory,[switch]$Reference)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
Cmd @('reload','--page',$PageId) | Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not([disabled])') | Out-Null
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720') | Out-Null
Enter-Chapter
Cmd @('wait','--page',$PageId,'--selector','#game[data-input=free-look],#game[data-input=locked]') | Out-Null
if((Read).input.captureChoice -eq 'denied'){Cmd @('click','--page',$PageId,'--element','#free-cursor') | Out-Null}
Key V
Hold w 420
Read (Get-Content -Raw -Encoding utf8 "$PSScriptRoot/pose-review.js") | Out-Null
function MoveMouse([int]$y){Cmd @('mouse','move','--page',$PageId,'--x','640','--y',"$y") | Out-Null}
function Cast(){
  Cmd @('mouse','down','--page',$PageId,'--button','left') | Out-Null
  Cmd @('mouse','up','--page',$PageId,'--button','left') | Out-Null
}
MoveMouse 360
Cast
Key R
Start-Sleep -Milliseconds 900
Key 2
WaitForWeapon bow
Cmd @('mouse','down','--page',$PageId,'--button','right') | Out-Null
Start-Sleep -Milliseconds 800
Cast
WaitForWeapon bow
MoveMouse 6
Start-Sleep -Milliseconds 850
MoveMouse 714
Start-Sleep -Milliseconds 1600
Cmd @('mouse','up','--page',$PageId,'--button','right') | Out-Null
Key 1
Start-Sleep -Milliseconds 700
Cast
MoveMouse 185
Hold a 350
Hold d 700
Hold a 150
Cmd @('exec','--page',$PageId,'--command','keydown Shift')|Out-Null
try {
  Cmd @('exec','--page',$PageId,'--command','keydown w')|Out-Null
  try { Key Space } finally { Cmd @('exec','--page',$PageId,'--command','keyup w')|Out-Null }
} finally { Cmd @('exec','--page',$PageId,'--command','keyup Shift')|Out-Null }
Start-Sleep -Milliseconds 300
Key Space
Start-Sleep -Milliseconds 800
$names=Read 'window.__poseReview.names()'
foreach($name in $names){
  $f=Read ('window.__poseReview.frame(`'+$name+'`)')
  [IO.File]::WriteAllBytes((Join-Path $script:Evidence ($name+'.png')),[Convert]::FromBase64String($f.image))
}
$metrics=Read 'window.__poseReview.finish()'
$metrics|ConvertTo-Json -Depth 5|Set-Content -Encoding utf8 (Join-Path $script:Evidence 'measurements.json')
Key Escape
foreach($pose in 'wand-idle','wand-cast','wand-cast-down','wand-reload','bow-level','bow-release','bow-nock','bow-up','bow-down','YBot_LeftStrafeWalk','YBot_RightStrafeWalk','jump','landing'){
  if($names -notcontains $pose){throw "Missing pose: $pose"}
}
if(!$Reference){
  if(@($metrics.wandAngles|Where-Object {!$_.blocked -and $_.toImpact -gt 1}).Count){throw 'Wand angled away from the emitted spell'}
  foreach($action in $metrics.bowGloves.psobject.Properties){
    if($action.Value.crossings){throw "Hand intersected the hood in $($action.Name)"}
  }
}
Write-Output ($names -join ', ')
