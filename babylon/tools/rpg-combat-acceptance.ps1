param([Parameter(Mandatory=$true)][string]$PageId,[string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-24/rpg")
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
$origin=@(0,0,0);$visited=[Collections.Generic.List[object]]::new();$checks=[Collections.Generic.List[object]]::new()
function Rpg { Read 'window.__EXPEDITION__.snapshot()' }
function Assert($value,$name){$checks.Add(@{name=$name;pass=[bool]$value});if(!$value){throw $name};Write-Output ('PASS '+$name)}
function Click($selector){Cmd @('click','--page',$PageId,'--element',$selector)|Out-Null}
function SaveRpg($name){Capture $name;(Rpg)|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $script:Evidence ($name+'-expedition.json')) -Encoding utf8}
function WaitState($condition,$milliseconds=8000){Read ('new Promise(resolve=>{const end=performance.now()+'+$milliseconds+';function sample(){const s=window.__ROOM_DEMO__.snapshot(),r=window.__EXPEDITION__.snapshot();if('+$condition+')resolve(true);else if(performance.now()>end)resolve(false);else requestAnimationFrame(sample)}sample()})')}
try{
  if((Rpg).state.enemies[0].health -gt 0){
    Key 1;Cmd @('mouse','move','--page',$PageId,'--x','640','--y','360')|Out-Null
    Look -Point @(-3,1.05,1.8)
    if((Read).input.outside){Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null;Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}
    Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null
    try {Assert (WaitState 'r.state.enemies[0].health===0' 13000) 'native wand shots kill quarry enemy'} finally {Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}
  }
  Assert ((Rpg).state.kills -ge 1) 'native wand killed the first enemy'
  SaveRpg '04-first-kill'
  Key 2
  foreach($enemy in @(1,2)){
    for($attempt=0;$attempt -lt 5 -and (Rpg).state.enemies[$enemy].health -gt 0;$attempt++){
      Cmd @('mouse','move','--page',$PageId,'--x','640','--y','360')|Out-Null
      $p=(Rpg).world.enemies[$enemy].position
      $eye=(Read).camera.position;$range=[math]::Sqrt([math]::Pow($p[0]-$eye[0],2)+[math]::Pow($p[2]-$eye[2],2))
      # Existing arrows use actual gravity; compensate the 32 m/s full-draw arc.
      Look -Point @($p[0],($p[1]+1.1+.0048*$range*$range),$p[2])
      if((Read).input.outside){Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null;Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}
      Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null
      try {Assert (WaitState 's.weapon.draw>=.99' 4500) ('bow fully draws '+$enemy)} finally {Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}
      WaitState 's.weapon.nock.ready' 4500|Out-Null
    }
    Assert ((Rpg).state.enemies[$enemy].health -eq 0) ('native arrows kill enemy '+$enemy)
  }
  Assert ((Rpg).state.points -gt 0 -or (Rpg).state.skills.power -gt 0) 'combat experience earns a skill point'
  Key Tab
  Click '#inventory .journal-modes button:last-child'
  if((Rpg).state.skills.power -eq 0){Click '#inventory-growth button:first-of-type'}
  Assert ((Rpg).state.skills.power -eq 1) 'skill point spends on actual damage bonus'
  SaveRpg '05-skills'
  Key Tab
  Assert (!(Read).paused) 'Tab closes inventory after skill rerender'
  Look -Point @(0,1.1,-8) -TargetId 'leave-quarry';Key E
  Enter-LoadedLevel
  Assert ((Rpg).state.area -eq 'chapter') 'return portal restores chapter location'
  Look -Point @(-4.5,1.2,-2.5) -TargetId 'guide-mira';Key E
  Assert ((Rpg).state.claimed -contains 'hunt-contract') 'NPC pays hunt contract once'
  $points=(Rpg).state.points;Look -Point @(-4.5,1.2,-2.5);Key E
  Assert ((Rpg).state.points -eq $points) 'repeated conversation cannot duplicate skill points'
  Look -Point @(-4.5,1.1,.5) -TargetId 'enter-quarry';Key E
  Enter-LoadedLevel
  Assert ((Rpg).state.visit -eq 2) 'revisiting starts a distinct hunting wave'
  Assert ((Rpg).state.enemies[0].health -eq 72) 'enemy respawns for legitimate ammo farming'
  SaveRpg '06-revisit'
  Go 0 -2
  Assert (WaitState 'r.state.health<100' 18000) 'enemy attacks reduce health'
  Assert ((Rpg).state.armor -lt 60) 'armor absorbs real incoming damage'
  Key Escape;SaveRpg '07-armor-damage'
}finally{
  $checks|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $script:Evidence 'combat-checks.json') -Encoding utf8
  (Read)|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $script:Evidence 'combat-last-state.json') -Encoding utf8
  (Rpg)|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $script:Evidence 'combat-last-expedition.json') -Encoding utf8
}
