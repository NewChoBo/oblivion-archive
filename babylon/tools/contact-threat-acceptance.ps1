param([Parameter(Mandatory=$true)][string]$PageId,[string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-22/contact-threat")
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
function Check([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Fire([int]$Ms){Cmd @('mouse','move','--page',$PageId,'--x','300','--y','300')|Out-Null;Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null;try{Start-Sleep -Milliseconds $Ms}finally{Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}}
$result=[ordered]@{browser='Orca embedded browser';method='Native keyboard/mouse input; frame sampling observes state only'}
ClickButton '#restart';Key V
Read '(()=>{const rows=[];window.__JUMP_SAMPLES__=rows;const end=performance.now()+7000;function sample(){const s=window.__ROOM_DEMO__.snapshot();rows.push({position:s.position,jump:s.jump});if(performance.now()<end)requestAnimationFrame(sample)}sample();return true})()'|Out-Null
Read (Get-Content -LiteralPath "$PSScriptRoot/capture-start.js" -Raw)|Out-Null
Cmd @('exec','--page',$PageId,'--command','keydown Shift')|Out-Null;Cmd @('exec','--page',$PageId,'--command','keydown d')|Out-Null;try{Key Space;Start-Sleep -Milliseconds 700}finally{Cmd @('exec','--page',$PageId,'--command','keyup d')|Out-Null;Cmd @('exec','--page',$PageId,'--command','keyup Shift')|Out-Null}
Start-Sleep -Milliseconds 1600
$result.wallJump=Read;$result.samples=Read 'window.__JUMP_SAMPLES__'
$result.falseLandings=@($result.samples|Where-Object{$_.position[1] -gt .94 -and $_.jump.grounded}).Count
Check ($result.falseLandings -eq 0) 'Side contact still counted as grounded'
Check ($result.wallJump.jump.landings -eq 1 -and $result.wallJump.position[1] -lt .88) 'Jump did not land on actual floor'
Capture '01-wall-jump-fixed'
$video=Read (Get-Content -LiteralPath "$PSScriptRoot/capture-stop.js" -Raw);[IO.File]::WriteAllBytes((Join-Path $script:Evidence 'wall-jump-fixed.webm'),[Convert]::FromBase64String($video))
Key Escape;ClickButton '#restart';Hold d 300;Hold w 1500
Fire 500;$result.stone=Read
Check (@($result.stone.spells.events|Where-Object{$_.hit -and $_.surface -eq 'stone' -and $_.arrived}).Count -ge 1) 'Stone surface was not hit'
Capture '02-stone-surface'
Key Escape;ClickButton '#restart';Hold w 1000;Look -Point @(.5,1.59,1.8);Key E;Look -Angles @(0,.06);Hold a 150;Hold w 1000;Hold d 80;Hold w 2600
Look -Angles @(1.5708,0);Hold w 1300
Fire 3500;$result.threatHit=Read
Check ($result.threatHit.world.hits -gt 0) 'Real tool shot did not stun the ink shadow'
Capture '03-shadow-hit-observation'
Start-Sleep -Seconds 9;$result.defeat=Read
Check ($result.defeat.defeated) 'Ink shadow did not produce the failure screen'
Capture '04-defeat'
ClickButton '#retry-checkpoint';$result.retry=Read
Check ($result.retry.phase -eq 1 -and [Math]::Abs($result.retry.position[0]-1.7) -lt .01 -and [Math]::Abs($result.retry.position[2]-10.3) -lt .01) 'Defeat retry failed'
Key Escape;$result.pass=$true;$result|ConvertTo-Json -Depth 24|Set-Content -LiteralPath (Join-Path $script:Evidence 'contact-threat.json') -Encoding utf8
Write-Output ('PASS '+(Join-Path $script:Evidence 'contact-threat.json'))
