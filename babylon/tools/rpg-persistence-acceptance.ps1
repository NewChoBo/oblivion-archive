param([Parameter(Mandatory=$true)][string]$PageId,[string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-24/rpg")
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
$checks=[Collections.Generic.List[object]]::new()
function Rpg { Read 'window.__EXPEDITION__.snapshot()' }
function Assert($value,$name){$checks.Add(@{name=$name;pass=[bool]$value});if(!$value){throw $name};Write-Output ('PASS '+$name)}
function Click($selector){Cmd @('click','--page',$PageId,'--element',$selector)|Out-Null}
function WaitState($condition,$milliseconds=8000){Read ('new Promise(resolve=>{const end=performance.now()+'+$milliseconds+';function sample(){const s=window.__ROOM_DEMO__.snapshot(),r=window.__EXPEDITION__.snapshot();if('+$condition+')resolve(true);else if(performance.now()>end)resolve(false);else requestAnimationFrame(sample)}sample()})')}
function SaveRpg($name){Capture $name;(Rpg)|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $script:Evidence ($name+'-expedition.json')) -Encoding utf8}
try{
  $before=(Rpg).state
  if((Read).paused){Key Escape}
  Cmd @('mouse','move','--page',$PageId,'--x','640','--y','360')|Out-Null
  Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null
  try{
    Assert (WaitState 's.weapon.drawing' 2500) 'bow is held while enemies attack'
    Assert (WaitState 's.defeated' 30000) 'enemy damage reaches defeat during bow draw'
  }finally{Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}
  SaveRpg '08-defeat-during-draw'
  Click '#start'
  Enter-LoadedLevel
  $after=(Rpg).state
  Assert ($after.area -eq 'chapter' -and $after.health -eq $after.maxHealth) 'retry returns safely and restores health'
  foreach($kind in @('wand','bow')){Assert (($after.ammo.$kind.loaded+$after.ammo.$kind.reserve) -eq ($before.ammo.$kind.loaded+$before.ammo.$kind.reserve)) ('retry preserves finite '+$kind+' total')}
  Assert ($after.claimed.Count -eq $before.claimed.Count -and $after.points -eq $before.points) 'retry cannot duplicate chest or skill rewards'
  Assert (!(Read).weapon.drawing -and !(Read).weapon.held -and (Read).weapon.reloadProgress -eq 0) 'retry clears draw and reload transients'
  Assert ($after.torchLit -eq $before.torchLit -and $after.selected -eq 1) 'retry preserves selected weapon and torch state'
  SaveRpg '09-retry'
  Key 3;WaitState 's.weapon.state===`ready`'|Out-Null
  Cmd @('mouse','move','--page',$PageId,'--x','640','--y','360')|Out-Null
  if((Read).input.outside){Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null;Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}
  if((Read).weapon.torchLit){Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null;Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}
  Assert (!(Read).weapon.torchLit) 'torch toggles off with native click'
  Key 2
  Key Escape
  Click '#return-title'
  Cmd @('wait','--page',$PageId,'--selector','#start:not([disabled])','--timeout','60000')|Out-Null
  Click '#continue-save'
  Enter-LoadedLevel
  $loaded=(Rpg).state
  Assert ($loaded.selected -eq 1 -and !$loaded.torchLit) 'continue restores worn gear and torch'
  foreach($kind in @('wand','bow')){Assert (($loaded.ammo.$kind.loaded+$loaded.ammo.$kind.reserve) -eq ($after.ammo.$kind.loaded+$after.ammo.$kind.reserve)) ('continue preserves finite '+$kind+' total')}
  Key Escape;Click '#settings-open';Click '#keyboard-heading';Click '[data-action=inventory]';Key I;Key Escape;Click '#start'
  Key I;Assert (Read 'document.getElementById(`inventory`).open') 'saved I inventory assignment remains usable'
  Key I;Assert (!(Read).paused) 'I closes bag and resumes'
  Key Tab;Assert (Read 'document.getElementById(`inventory`).open') 'Tab remains a bag alias with I assigned'
  Key Tab;Assert (!(Read).paused) 'Tab closes bag with I assigned'
  Key Escape;SaveRpg '10-continue-and-input'
}finally{
  $checks|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $script:Evidence 'persistence-checks.json') -Encoding utf8
  (Rpg)|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $script:Evidence 'persistence-last-expedition.json') -Encoding utf8
}
