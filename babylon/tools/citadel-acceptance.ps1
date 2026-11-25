param([Parameter(Mandatory=$true)][string]$PageId,[Parameter(Mandatory=$true)][string]$EvidenceDirectory,[switch]$AfterEnding)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
$layout=Get-Content -Raw -Encoding utf8 "$PSScriptRoot/../../shared/levels/fortress-exterior.json"|ConvertFrom-Json
$origin=$layout.chapterJoin.offset
$visited=[Collections.Generic.List[object]]::new()
if($AfterEnding){
  if((Read).phase -ne 5){throw 'Restore the name before visiting the renewed citadel'}
  if((Read).paused){Enter-Chapter}
  Go 0 38
  Go 0 34
  $down=@($layout.stairs.stations);[array]::Reverse($down)
  foreach($p in $down){Go $p[0] $p[2]}
  Go -4 13
  Go -3 7
  Look -Point @(0,10,-6.5)
  Capture '05-restored-court'
  return
}
$gameUrl=if($env:WORLD_QA_URL){$env:WORLD_QA_URL}else{'http://localhost:4186/'}
Cmd @('goto','--page',$PageId,'--url',$gameUrl)|Out-Null
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not([disabled])')|Out-Null
$saved=(Read).preferences
try {
if($saved.pointerLock){
  Cmd @('click','--page',$PageId,'--element','#settings-open')|Out-Null
  Cmd @('click','--page',$PageId,'--element','#pointer-lock')|Out-Null
  Cmd @('click','--page',$PageId,'--element','#settings-back')|Out-Null
}
Cmd @('click','--page',$PageId,'--element','#start-citadel')|Out-Null
Enter-LoadedLevel
Capture '01-arrival'
foreach($p in $layout.bridge.stations){Go $p[0] $p[2]}
Go 0 3.4
Look -Point @(0,.45,-43.125)
Capture '01-gate-arch'
Look -Point @(-3.6,-4.13,-43.125)
Capture '01-gate-foot'
Go -4 4
Go -9.5 3.5
Go -16 2.5
Look -Point @(-20.5,-3,-41.8)
Capture '02-bindery'
Go -9.5 3.5
Go 0 5
Go 9 8.2
Go 14 8.4
Go 22 8.5
Look -Point @(27,-3.35,-36.9)
Capture '02-freight'
Go 14 8.4
Go 8 8.2
Go 0 5
Go -3 7
Look -Point @(0,10,-6.5)
Capture '02-court'
Go 0 5
Go 6 8
Look -Point @(12.8,.15,-32.7)
Capture '02-arcade-joints'
Go 0 5
Go -3 7
foreach($p in $layout.westWalk.stations){Go $p[0] $p[2]}
Go -28 15
Look -Point @(-4,-3,-51)
Capture '03-lookout'
Look -Angles @(-.55,-.59)
Read (Get-Content "$PSScriptRoot/capture-start.js" -Raw -Encoding utf8)|Out-Null
try{
  $twinkle=Read (Get-Content "$PSScriptRoot/measure-starlight.js" -Raw -Encoding utf8)
}finally{
  $clip=Read (Get-Content "$PSScriptRoot/capture-stop.js" -Raw -Encoding utf8)
  [IO.File]::WriteAllBytes((Join-Path $script:Evidence 'starlight.webm'),[Convert]::FromBase64String($clip))
}
if(!$twinkle.reduced -and $twinkle.changing -lt 5){throw 'Expected visible changes in five separate stars'}
Key V
$reverse=@($layout.westWalk.stations)
[array]::Reverse($reverse)
foreach($p in $reverse){Go $p[0] $p[2]}
Go -4 13
foreach($p in $layout.stairs.stations){
  Go $p[0] $p[2]
  if($p[2] -eq 26.5){
    Look -Point @(3.5,-1.6,-18.125)
    Capture '04-stair-joints'
    Look -Point @(9,-3.8,-32)
    Capture '04-court-cliff'
  }
}
Go 0 34
foreach($x in $layout.libraryWings.centers){
  Go $x 34
  Go $x 44
  Look -Angles @(.3,.1)
  if($x -gt 0){Capture '04-stacks'}else{Capture '04-reading-wing'}
  Go $x 34
  Go 0 34
}
Look -Point @(0,9,-6.25)
Capture '04-terrace'
Go 12 33.5
Look -Point @(11.6,4.08,-5.925)
Capture '04-window-reveal'
Go 2.85 33.25
Look -Point @(3.5,.055,-9.63)
Capture '04-rail-footing'
Go 0 34
Go 0 32.9
Look -Point @(0,1.83,-6.125)
Capture '04-framed-entrance'
Go 0 36
Go 0 38
if((Read).position[2] -lt -5.75){throw 'Upper terrace did not reach the reading room'}
$receipt=@{browser='Orca';bundle=(Read 'document.querySelector(`script[type=module]`).src');visited=$visited;twinkle=$twinkle;readingRoom=(Read).position}
$receipt|ConvertTo-Json -Depth 7|Set-Content -Encoding utf8 (Join-Path $script:Evidence 'citadel.json')
Key Escape
Write-Output ("PASS: "+$visited.Count+" stations and "+$twinkle.changing+" changing stars")
}finally{RestoreInputPreferences $saved}
