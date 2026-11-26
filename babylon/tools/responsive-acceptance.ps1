param([Parameter(Mandatory=$true)][string]$PageId,[Parameter(Mandatory=$true)][string]$EvidenceDirectory,
      [string]$Url='http://localhost:4186/')
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
$review=Get-Content -Raw -Encoding utf8 "$PSScriptRoot/responsive-layout-review.js"
$minimum=@(568,320)
$sizes=@($minimum,@(844,390),@(768,1024),@(1280,720),@(1920,1080),@(2560,1080),@(3840,2160))
$results=[Collections.Generic.List[object]]::new()
function ClickId($id){Cmd @('click','--page',$PageId,'--element',('#'+$id))|Out-Null}
function Set-TestViewport($size){
  $options=@('viewport','--page',$PageId,'--width',([string]$size[0]),'--height',([string]$size[1]))
  if($size[0] -lt 900){$options+='--mobile'}
  Cmd $options|Out-Null
}
function Test-ViewportState($state,$size){
  Set-TestViewport $size
  Read 'new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(true))))'|Out-Null
  $record=Read $review
  if($record.width -ne $size[0] -or $record.height -ne $size[1]){throw 'Viewport size mismatch'}
  $expected=@{limit='viewport-limit';menu='overlay';settings='settings-panel';goal='game';photo='game';book='inventory';pause='overlay'}
  if($record.surface -ne $expected[$state]){throw ("Expected {0} panel, saw {1}" -f $state,$record.surface)}
  if($state -eq 'photo' -and !$record.subtitle.text){throw 'Photo subtitle is missing'}
  $record|Add-Member -NotePropertyName state -NotePropertyValue $state
  $results.Add($record)
  $name="$state-$($size[0])x$($size[1])"
  if($name -in @('goal-568x320','photo-568x320','photo-1280x720','book-568x320','limit-390x844','menu-844x390','settings-768x1024') -or $record.errors.Count){
    $capture=Cmd @('screenshot','--page',$PageId)
    Copy-Item -LiteralPath $capture.path -Destination (Join-Path $script:Evidence ($name+'.png'))
  }
}
function Test-ViewportMatrix($state){foreach($size in $sizes){Test-ViewportState $state $size}}
Cmd @('goto','--page',$PageId,'--url',$Url)|Out-Null
Test-ViewportState limit @(390,844)
Test-ViewportState limit @(479,320)
Test-ViewportState limit @(568,215)
Set-TestViewport $minimum
Cmd @('wait','--page',$PageId,'--selector','#start:not(:disabled)')|Out-Null
Test-ViewportMatrix menu
ClickId 'settings-open';Test-ViewportMatrix settings
Set-TestViewport $minimum;ClickId 'settings-back'
Set-TestViewport @(1280,720);Enter-Chapter
Cmd @('wait','--page',$PageId,'--selector','#game[data-input=free-look],#game[data-input=locked]')|Out-Null
Cmd @('exec','--page',$PageId,'--command','keydown w')|Out-Null
try {
  $near=Read 'new Promise(done=>{const end=performance.now()+6000;function check(){if(window.__ROOM_DEMO__.snapshot().position[2]>.2)done(true);else if(performance.now()>=end)done(false);else requestAnimationFrame(check)}check()})'
} finally {Cmd @('exec','--page',$PageId,'--command','keyup w')|Out-Null}
if(!$near){throw 'Did not reach the desk'}
Look -Point @(.5,1.59,1.8)
Test-ViewportMatrix goal
Cmd @('wait','--page',$PageId,'--selector','#notice.visible','--state','hidden')|Out-Null
ClickId 'interact'
if((Read).phase -ne 1){throw 'Photo interaction failed'}
Test-ViewportState photo $minimum
Test-ViewportState photo @(1280,720)
Test-ViewportState photo @(3840,2160)
ClickId 'inventory-open'
Test-ViewportMatrix book
Test-ViewportState limit @(568,215)
Test-ViewportState book $minimum
ClickId 'inventory-items-view'
Cmd @('click','--page',$PageId,'--element','[data-entry=bow]')|Out-Null
ClickId 'inventory-equip';ClickId 'inventory-close'
if((Read).weapon.id -ne 'blaster-j'){throw 'Journal equip failed'}
ClickId 'help';Test-ViewportMatrix pause
Set-TestViewport $minimum;ClickId 'settings-open';ClickId 'settings-back';Enter-Chapter
if((Read).paused){throw 'Could not resume from short viewport'}
Key z
Cmd @('wait','--page',$PageId,'--selector','[data-posture=prone][aria-pressed=true]')|Out-Null
Test-ViewportState limit @(479,320)
$blocked=Read
if(!$blocked.paused){throw 'Resize below the minimum did not pause gameplay'}
Hold w 400;Key Escape
$stillBlocked=Read
if($stillBlocked.position[2] -ne $blocked.position[2] -or !(Read 'document.getElementById(`viewport-limit`).open')){
  throw 'Input escaped the viewport limit'
}
Test-ViewportState pause $minimum
Enter-Chapter
$resumed=Read
if($resumed.paused -or $resumed.movement.posture -ne 'prone' -or $resumed.position[2] -ne $blocked.position[2]){
  throw 'Returning to the minimum viewport lost the playing state'
}
$failures=@($results|Where-Object {$_.errors.Count})
$results|ConvertTo-Json -Depth 5|Set-Content -Encoding utf8 (Join-Path $script:Evidence 'sizes.json')
if($failures.Count){throw ($failures|ConvertTo-Json -Depth 5 -Compress)}
Write-Output ("Passed {0} viewport and game-state checks" -f $results.Count)
