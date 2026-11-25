param([Parameter(Mandatory=$true)][string]$PageId,[string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-22/magic")
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
function Check([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Fire([int]$Ms){Cmd @('mouse','move','--page',$PageId,'--x','300','--y','300')|Out-Null;Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null;try{Start-Sleep -Milliseconds $Ms}finally{Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}}
$result=[ordered]@{browser='Orca embedded browser';audio='Decoded actual Web Audio output mix; speaker hardware and human listening not verified'}
Cmd @('reload','--page',$PageId)|Out-Null;Cmd @('wait','--page',$PageId,'--selector','#start:not([disabled])')|Out-Null
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
$original=(Read).preferences
try{
if($original.pointerLock){
  ClickButton '#settings-open'
  Cmd @('click','--page',$PageId,'--element','#pointer-lock')|Out-Null
  Key Escape
}
Enter-Chapter
Cmd @('wait','--page',$PageId,'--selector','#game[data-input=free-look],#game[data-input=locked]')|Out-Null
if((Read).input.captureChoice -eq 'denied'){ClickButton '#free-cursor'}
Read (Get-Content -LiteralPath "$PSScriptRoot/capture-start.js" -Raw)|Out-Null
foreach($tool in @('wand','bow')){
  if($tool -eq 'bow'){
    Key 2
    WaitForWeapon bow
  }
  Read (Get-Content -LiteralPath "$PSScriptRoot/audio-start.js" -Raw)|Out-Null
  if($tool -eq 'bow'){
    Fire 250
    WaitForWeapon bow
  }else{Fire 3500}
  $sound=Read (Get-Content -LiteralPath "$PSScriptRoot/audio-stop.js" -Raw)
  $recording=if($tool -eq 'bow'){'bow-nock.wav'}else{'wand-empty-recharge.wav'}
  [IO.File]::WriteAllBytes((Join-Path $script:Evidence $recording),[Convert]::FromBase64String($sound.wav))
  $sound.psobject.Properties.Remove('wav');$result[$tool]=$sound
  Check ($sound.peak -gt .001) ($tool+' output was silent')
  $expected=if($tool -eq 'bow'){@('bow-quiver','bow-nock')}else{@('empty','reload-complete')}
  foreach($event in $expected){Check (@($sound.events|Where-Object{$_.type -eq $event}).Count -ge 1) ($tool+' missing audio event '+$event)}
  Capture ($tool+'-first')
}
Key V;Key 1;Fire 700;Capture 'wand-third'
Key 2;WaitForWeapon bow;Fire 700;Capture 'bow-third'
$result.final=Read
$events=$result.final.spells.events
Check (@($events|Where-Object{$_.hit -and $_.arrived}).Count -ge 1) 'No surface impact reached the first surface'
$result.unblockedTipMaxError=($events|Where-Object{-not $_.muzzleBlocked}|ForEach-Object{[Math]::Sqrt([Math]::Pow($_.start[0]-$_.muzzle[0],2)+[Math]::Pow($_.start[1]-$_.muzzle[1],2)+[Math]::Pow($_.start[2]-$_.muzzle[2],2))}|Measure-Object -Maximum).Maximum
Check ($result.unblockedTipMaxError -lt .000001) 'Projectile origin did not match actual tool tip'
$video=Read (Get-Content -LiteralPath "$PSScriptRoot/capture-stop.js" -Raw)
[IO.File]::WriteAllBytes((Join-Path $script:Evidence 'magic-first-third.webm'),[Convert]::FromBase64String($video))
Key Escape
}finally{RestoreInputPreferences $original}
$result.pass=$true;$result|ConvertTo-Json -Depth 22|Set-Content -LiteralPath (Join-Path $script:Evidence 'magic.json') -Encoding utf8
Write-Output ('PASS '+(Join-Path $script:Evidence 'magic.json'))
