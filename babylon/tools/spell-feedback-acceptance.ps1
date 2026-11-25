param([Parameter(Mandatory=$true)][string]$PageId,[Parameter(Mandatory=$true)][string]$EvidenceDirectory)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
function ClickId($id){Cmd @('click','--page',$PageId,'--element',('#'+$id))|Out-Null}
function Mouse($action){Cmd @('exec','--page',$PageId,'--command',('mouse '+$action+' left'))|Out-Null}
function Draw($milliseconds){Mouse down;try{Start-Sleep -Milliseconds $milliseconds}finally{Mouse up}}
function Check($pass,$message){if(!$pass){throw $message}}
Cmd @('reload','--page',$PageId)|Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not(:disabled)')|Out-Null
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
$original=(Read).preferences
try{
  ClickId 'settings-open';if($original.pointerLock){ClickId 'pointer-lock'};Key Escape
  Enter-Chapter
  Hold w 520
  Cmd @('mouse','move','--page',$PageId,'--x','640','--y','360')|Out-Null
  Cmd @('mouse','move','--page',$PageId,'--x','640','--y','416')|Out-Null
  Key 2
  WaitForWeapon bow
  Read (Get-Content -Raw "$PSScriptRoot/capture-start.js")|Out-Null
  Read (Get-Content -Raw "$PSScriptRoot/audio-start.js")|Out-Null
  ClickId 'game'
  Start-Sleep -Milliseconds 270
  Draw 200
  Start-Sleep -Milliseconds 280
  Draw 1200
  Start-Sleep -Milliseconds 260
  Draw 1100
  Start-Sleep -Milliseconds 450
  Key 1
  Start-Sleep -Milliseconds 480
  ClickId 'game';Start-Sleep -Milliseconds 300
  ClickId 'game';Start-Sleep -Milliseconds 550
  Key V
  Draw 350
  Start-Sleep -Milliseconds 650
  $video=Read (Get-Content -Raw "$PSScriptRoot/capture-stop.js")
  [IO.File]::WriteAllBytes((Join-Path $script:Evidence 'spell-and-arrow.webm'),[Convert]::FromBase64String($video))
  $audio=Read (Get-Content -Raw "$PSScriptRoot/audio-stop.js")
  [IO.File]::WriteAllBytes((Join-Path $script:Evidence 'mix.wav'),[Convert]::FromBase64String($audio.wav))
  $state=Read
  $arrows=@($state.spells.events|Where-Object id -eq 'blaster-j')
  $wand=@($state.spells.events|Where-Object id -eq 'blaster-a')
  Check ($arrows.Count -eq 4 -and $arrows[0].bowPower -lt .15 -and $arrows[-1].bowPower -eq 1) 'Missing tap or full release'
  Check ($arrows[1].bowPower -gt .15 -and $arrows[1].bowPower -lt 1) 'Missing partial release'
  Check ($wand.Count -ge 3 -and $audio.peak -gt .025) 'Missing wand casts or mixed audio'
  Check (@($state.spells.events|Where-Object {(!$_.arrived) -or (!$_.hit)}).Count -eq 0) 'Missing first surface contact'
  Check (@($audio.events|Where-Object type -eq 'bow-draw').Count -eq 4) 'Incorrect draw cues'
  Check (@($audio.events|Where-Object type -eq 'impact').Count -eq $state.spells.events.Count) 'Incorrect impact cues'
  Key 2;Start-Sleep -Milliseconds 570
  $before=Read
  Mouse down
  try{Key i}finally{Mouse up}
  $cancel=Read
  Check ($cancel.paused -and !$cancel.weapon.audio.drawing -and $cancel.weapon.ammo -eq $before.weapon.ammo -and $cancel.spells.fired -eq $before.spells.fired) 'Journal released an arrow or left a voice running'
  Key i
  Mouse down
  try{Key 1}finally{Mouse up}
  $cancel=Read
  Check (!$cancel.weapon.audio.drawing -and $cancel.spells.fired -eq $before.spells.fired) 'Tool switch released an arrow or left a voice running'
  $receipt=[ordered]@{browser='Orca';bundle=(Read 'document.querySelector(`script[type=module]`).src');audioDuration=$audio.duration;sampleRate=$audio.sampleRate;peak=$audio.peak;rms=$audio.rms;audioEvents=$audio.events|Select-Object type,tool,power,surface,offset;shots=$state.spells.events;cancelledBy=@('journal','tool switch')}
  $receipt|ConvertTo-Json -Depth 7|Set-Content (Join-Path $script:Evidence 'checks.json') -Encoding utf8
  Key Escape
}finally{RestoreInputPreferences $original}
