param([Parameter(Mandatory=$true)][string]$PageId,[string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-24/rpg")
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
$origin=@(0,0,0);$visited=[Collections.Generic.List[object]]::new();$checks=[Collections.Generic.List[object]]::new()
function Rpg { Read 'window.__EXPEDITION__.snapshot()' }
function Assert($value,$name){$checks.Add(@{name=$name;pass=[bool]$value});if(!$value){throw $name};Write-Output ('PASS '+$name)}
function Click($selector){Cmd @('click','--page',$PageId,'--element',$selector)|Out-Null}
function SaveRpg($name){Capture $name;(Rpg)|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $script:Evidence ($name+'-expedition.json')) -Encoding utf8}
function WaitState($condition,$milliseconds=8000){Read ('new Promise(resolve=>{const end=performance.now()+'+$milliseconds+';function sample(){const s=window.__ROOM_DEMO__.snapshot(),r=window.__EXPEDITION__.snapshot();if('+$condition+')resolve(true);else if(performance.now()>end)resolve(false);else requestAnimationFrame(sample)}sample()})')}
try{
  Cmd @('reload','--page',$PageId)|Out-Null
  Cmd @('wait','--page',$PageId,'--selector','#start:not([disabled])','--timeout','60000')|Out-Null
  Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
  Click '#settings-open'
  if((Read).preferences.pointerLock){Click '#pointer-lock'}
  Click '#settings-back';Enter-Chapter
  Assert (WaitState 's.started&&!s.paused') 'normal chapter entry'
  Key Tab;Assert (Read 'document.getElementById(`inventory`).open') 'Tab opens bag'
  SaveRpg '01-bag'
  Key Tab;Assert (!(Read).paused) 'Tab closes bag and resumes'
  Key Escape;Assert ((Read).paused) 'Escape pauses'
  Key Escape;Assert (!(Read).paused) 'Escape resumes'
  Go -1.35 -4.4
  Look -Point @(-2.67,.5,-5.35) -TargetId 'reading-supply'
  Key E;Assert ((Rpg).state.claimed -contains 'reading-supply') 'physical chest grants one-time supplies'
  $reward=Read 'document.querySelector(`#notice.visible #notice-text`)?.textContent'
  $collected=if((Read 'document.documentElement.lang') -eq 'ko'){'획득했습니다'}else{'Collected equipment'}
  Assert ($reward -and $reward.Contains($collected)) 'chest reward shows its subtitle'
  $chest=(Rpg).state.ammo.wand.reserve
  Look -Point @(-2.67,.4,-5.35);Key E
  Assert ((Rpg).state.ammo.wand.reserve -eq $chest) 'empty chest grants no duplicate ammunition'
  Key Tab;Click '[data-entry=survey-wand]';Click '#inventory-equip'
  Assert ((Rpg).state.slots[0] -eq 'survey-wand') 'bag weapon replaces worn wand'
  Assert ((Rpg).state.bag -contains 'wand') 'replaced weapon moves into bag'
  Key Tab
  Go 1.3 -4.35
  Look -Point @(2.67,.5,-5.35) -TargetId 'gear-storage';Key E
  Assert (Read 'document.getElementById(`inventory`).open') 'physical storage opens inventory'
  Click '[data-entry=wand]';Click '.journal-actions button:last-child'
  Assert ((Rpg).state.storage -contains 'wand') 'weapon deposits in storage'
  Click '[data-entry=wand]';Click '.journal-actions button:last-child'
  Assert ((Rpg).state.bag -contains 'wand') 'weapon withdraws into bag'
  Key Tab
  Go -3.1 -3.4
  Look -Point @(-4.5,1.25,-2.5) -TargetId 'guide-mira';Key E
  Assert ((Rpg).state.quest) 'guide NPC offers hunt and route guidance'
  SaveRpg '02-guide'
  Go -4.4 -1.15
  Look -Point @(-4.5,1.15,.5) -TargetId 'enter-quarry';Key E
  Enter-LoadedLevel
  Assert ((Rpg).state.area -eq 'dungeon') 'portal enters separate hunting room'
  Assert ((Read).levelId -eq 'ink-quarry' -and $null -eq (Read).world) 'only the quarry level is loaded'
  SaveRpg '03-quarry-entry'
}finally{
  $checks|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $script:Evidence 'checks.json') -Encoding utf8
  (Read)|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $script:Evidence 'last-state.json') -Encoding utf8
  (Rpg)|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $script:Evidence 'last-expedition.json') -Encoding utf8
}
