param(
  [Parameter(Mandatory=$true)][string]$PageId,
  [Parameter(Mandatory=$true)][string]$EvidenceDirectory,
  [switch]$AfterEnding,
  [switch]$ResumeBridge
)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
$layout=Get-Content -Encoding utf8 -Raw "$PSScriptRoot/../../shared/levels/fortress-exterior.json"|ConvertFrom-Json
$origin=$layout.chapterJoin.offset
$visited=[Collections.Generic.List[object]]::new()
if(!$AfterEnding){
  Cmd @('reload','--page',$PageId)|Out-Null
  Cmd @('wait','--page',$PageId,'--selector','#start:not([disabled])')|Out-Null
}
$saved=(Read).preferences
try {
  if($saved.pointerLock){
    if((Read).started -and !(Read).paused){Key Escape}
    ClickButton '#settings-open'
    Cmd @('click','--page',$PageId,'--element','#pointer-lock')|Out-Null
    Cmd @('click','--page',$PageId,'--element','#settings-back')|Out-Null
  }
  if($AfterEnding){
    if((Read).phase -ne 5){throw 'Complete the chapter first'}
    if((Read).paused){Enter-Chapter}
    if(!$ResumeBridge){
      Go 0 38
      Go 0 34
      $steps=@($layout.stairs.stations)
      [array]::Reverse($steps)
      foreach($step in $steps){Go $step[0] $step[2]}
      Go -4 13
      Go -3 7
      Look -Point @(0,10,-6.5)
      Capture 'restored-court'
      Go 0 4
    }
    $steps=@($layout.bridge.stations)
    [array]::Reverse($steps)
    if($ResumeBridge){
      $pos=(Read).position
      $nearest=0;$best=[double]::PositiveInfinity
      for($i=0;$i -lt $steps.Count;$i++){
        $p=$steps[$i];$d=[math]::Pow($p[0]+$origin[0]-$pos[0],2)+[math]::Pow($p[2]+$origin[2]-$pos[2],2)
        if($d -lt $best){$best=$d;$nearest=$i}
      }
      if($best -gt 9){throw 'Resume requires standing on the bridge near a measured station'}
      $steps=$steps[$nearest..($steps.Count-1)]
    }
    foreach($step in $steps){Go $step[0] $step[2]}
    Go -15 -36.5
    $expected=@(0,-4.5)
    $tag='saved'
  }else{
    Cmd @('click','--page',$PageId,'--element','#start-citadel')|Out-Null
    Enter-LoadedLevel
    $expected=@($layout.arrival.spawn[0]+$origin[0];$layout.arrival.spawn[2]+$origin[2])
    $tag='arrival'
  }
  $before=Read
  Look -Angles @(-1.5707963,0)
  Cmd @('exec','--page',$PageId,'--command','keydown w')|Out-Null
  try{
    $fell=Read 'new Promise(resolve=>{const end=performance.now()+18000;function frame(){const s=window.__ROOM_DEMO__.snapshot();if(s.defeated)resolve(true);else if(performance.now()>end)resolve(false);else requestAnimationFrame(frame)}frame()})'
    if(!$fell){throw 'The landing edge did not lead to the void'}
  }finally{Cmd @('exec','--page',$PageId,'--command','keyup w')|Out-Null}
  $lost=Read
  $title=Read 'document.getElementById(`overlay-title`).textContent'
  $button=Read 'document.getElementById(`start`).textContent.trim()'
  $fallTitle=if((Read 'document.documentElement.lang') -eq 'ko'){'별바다로 추락했습니다'}else{'You fell into the sea of stars'}
  if($title -cne $fallTitle -or !$lost.paused -or $lost.position[1] -ge -24){throw "Unexpected game over: $title"}
  Capture "$tag-game-over"
  Enter-Chapter
  $retry=Read
  if($retry.defeated -or $retry.paused -or $retry.phase -ne $before.phase -or [math]::Abs($retry.position[0]-$expected[0]) -gt .1 -or [math]::Abs($retry.position[2]-$expected[1]) -gt .1){throw "Unexpected retry: $($retry.position)"}
  Capture "$tag-retry"
  @{browser='Orca';bundle=(Read 'document.querySelector(`script[type=module]`).src');phase=$before.phase;title=$title;button=$button;fall=$lost.position;retry=$retry.position;visited=$visited;pass=$true}|ConvertTo-Json -Depth 6|Set-Content -Encoding utf8 (Join-Path $script:Evidence "$tag-void.json")
  Write-Output "PASS $tag fall and retry"
}finally{RestoreInputPreferences $saved}
