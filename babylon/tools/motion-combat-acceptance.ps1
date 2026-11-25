param([Parameter(Mandatory=$true)][string]$PageId,[ValidateSet('before','after')][string]$Version='after')
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory "$PSScriptRoot/../../docs/validation/2026-11-24/motion-combat/$Version"
$layout=Get-Content -Raw -Encoding utf8 "$PSScriptRoot/../../shared/levels/fortress-exterior.json"|ConvertFrom-Json
$origin=$layout.chapterJoin.offset
$visited=[Collections.Generic.List[object]]::new()
Read (Get-Content -Raw -Encoding utf8 "$PSScriptRoot/capture-start.js")|Out-Null
Read '(()=>{const frames=[];let active=true,last=0;function sample(now=0){if(!active)return;if(now-last>100){last=now;const s=window.__ROOM_DEMO__.snapshot();frames.push({at:now,position:s.position,posture:s.movement.posture,camera:s.camera.position,muzzle:s.weapon.muzzle?.world,tool:s.weapon.id,model:s.weapon.modelPosition,fps:s.fps});}requestAnimationFrame(sample)}sample();window.__finishMotion=()=>{active=false;return frames};return true})()'|Out-Null
try {
  foreach($p in $layout.bridge.stations){Go $p[0] $p[2]}
  Go 0 5
  Go -3 7
  Go -3 17
  Go 0 19
  Go 0 21.5
  Key C
  Start-Sleep -Milliseconds 400
  Capture 'slope-crouched'
  Key C
  Start-Sleep -Milliseconds 400
  Capture 'slope-stand-attempt'
  Go 0 24
  Go 0 26.5
  Go 0 30
  Capture 'upper-flight'
  Go 0 26.5
  Go 0 24
  Go 0 20
  Capture 'lower-flight-return'
  Key 3
  Go 0 22
  Capture 'torch-up'
  Go 0 20
  Capture 'torch-down'
} finally {
  $video=Read (Get-Content -Raw -Encoding utf8 "$PSScriptRoot/capture-stop.js")
  [IO.File]::WriteAllBytes((Join-Path $script:Evidence 'movement.webm'),[Convert]::FromBase64String($video))
  Read 'window.__finishMotion()'|ConvertTo-Json -Depth 12 -Compress|Set-Content -LiteralPath (Join-Path $script:Evidence 'frames.json') -Encoding utf8
  $visited|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $script:Evidence 'visited.json') -Encoding utf8
}
