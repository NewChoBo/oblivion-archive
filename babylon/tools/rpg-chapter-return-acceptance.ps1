param([Parameter(Mandatory=$true)][string]$PageId,[string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-24/rpg/no-farming-chapter",[switch]$AtPhoto)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
function Check($value,$name){if(!$value){throw $name};Write-Output ('PASS '+$name)}
function MoveUntil($key,$condition){
  Cmd @('exec','--page',$PageId,'--command',('keydown '+$key))|Out-Null
  try{$pass=Read ('new Promise(resolve=>{const end=performance.now()+18000;function sample(){const s=window.__ROOM_DEMO__.snapshot();if('+$condition+')resolve(true);else if(s.paused||performance.now()>end)resolve(false);else requestAnimationFrame(sample)}sample()})');Check $pass $condition}finally{Cmd @('exec','--page',$PageId,'--command',('keyup '+$key))|Out-Null}
}
function NativePulse($key,$milliseconds){
  # Schedule only a native Orca key release, so CLI settling cannot extend a
  # short approach into a multi-meter walk. No page-state setters are used.
  $release=Start-Job -ArgumentList $script:OrcaExe,$PageId,$key,$milliseconds -ScriptBlock {
    param($exe,$page,$heldKey,$delay)
    Start-Sleep -Milliseconds $delay
    & $exe exec --page $page --command ('keyup '+$heldKey) --json
  }
  try{Cmd @('exec','--page',$PageId,'--command',('keydown '+$key))|Out-Null;Wait-Job -Job $release -Timeout 15|Out-Null;Receive-Job -Job $release|Out-Null}
  finally{Cmd @('exec','--page',$PageId,'--command',('keyup '+$key))|Out-Null;Remove-Job -Job $release -Force}
}
Check ((Read).phase -eq 4) 'ledger and shortcut complete without farming'
if(!$AtPhoto){
if(!(Read).paused){Key Escape};ClickButton '#retry-checkpoint'
Look -Angles @(-1.5708,0)
MoveUntil w 's.position[0]<5.5'
Look -Angles @(0,0)
MoveUntil a 's.position[0]<-2.5'
Key Z
MoveUntil s 's.position[2]<2.0'
MoveUntil d 's.position[0]>-1.2'
NativePulse s 450
}
if((Read).movement.posture -eq 'prone'){Key Z}
Look -Point @(.5,1.59,1.8) -TargetId 'photo'
Key E
Check ((Read).phase -eq 5) 'chapter finishes without hunting or looting'
Capture '05-ending'
$expedition=Read 'window.__EXPEDITION__.snapshot()'
Check ($expedition.state.claimed.Count -eq 0 -and $expedition.state.kills -eq 0 -and $expedition.state.visit -eq 0) 'no chest, hunt or dungeon was required'
$receipt=[ordered]@{browser='Orca embedded browser';method='Native keys and pointer movement with read-only snapshots; actual checkpoint menu retries used to compensate delayed key-up';url=(Read 'location.href');bundle=(Read '[...document.scripts].map(s=>s.src).filter(Boolean)');final=(Read);expedition=$expedition;pass=$true}
$receipt|ConvertTo-Json -Depth 22|Set-Content -LiteralPath (Join-Path $script:Evidence 'walkthrough.json') -Encoding utf8
Cmd @('console','--page',$PageId,'--limit','100')|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $script:Evidence 'console.json') -Encoding utf8
