param([Parameter(Mandatory=$true)][string]$PageId,[Parameter(Mandatory=$true)][string]$EvidenceDirectory)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
Cmd @('reload','--page',$PageId)|Out-Null
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not(:disabled)')|Out-Null
Enter-Chapter
Cmd @('wait','--page',$PageId,'--selector','#game[data-input=free-look],#game[data-input=locked]')|Out-Null
if((Read).input.captureChoice -eq 'denied'){ClickButton '#free-cursor'}
Hold w 1800;Look -Point @(.5,1.59,1.8);Key E
if((Read).phase -ne 1){throw 'Reading-room photograph did not open the arch'}
Key Escape;ClickButton '#retry-checkpoint'
Hold s 3200
$start=Read
if($start.position[2] -gt 2.8 -or $start.position[2] -lt 2.4){throw 'Expected to start from the far edge of the desk'}
Cmd @('mouse','move','--page',$PageId,'--x','640','--y','360')|Out-Null
Cmd @('mouse','move','--page',$PageId,'--x','640','--y','465')|Out-Null
Read (Get-Content -Raw -Encoding utf8 "$PSScriptRoot/capture-start.js")|Out-Null
Cmd @('exec','--page',$PageId,'--command','keydown w')|Out-Null
try{
  $through=Read 'new Promise(resolve=>{const until=performance.now()+5500;function step(){const s=window.__ROOM_DEMO__.snapshot();if(s.position[2]>9.45)resolve(true);else if(performance.now()>until||s.paused)resolve(false);else requestAnimationFrame(step)}step()})'
}finally{Cmd @('exec','--page',$PageId,'--command','keyup w')|Out-Null}
$movie=Read (Get-Content -Raw -Encoding utf8 "$PSScriptRoot/capture-stop.js")
[IO.File]::WriteAllBytes((Join-Path $script:Evidence 'arch.webm'),[Convert]::FromBase64String($movie))
$end=Read
if(!$through -or !$end.jump.grounded){throw 'Player did not walk continuously through the arch'}
[ordered]@{start=$start.position;end=$end.position;pitch=$end.pitch;grounded=$end.jump.grounded;bundle=(Read 'document.querySelector(`script[type=module]`).src')}|ConvertTo-Json -Depth 4|Set-Content (Join-Path $script:Evidence 'walk.json') -Encoding utf8
Key Escape
