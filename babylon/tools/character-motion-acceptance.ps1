param([Parameter(Mandatory=$true)][string]$PageId,[string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-22/character-motion")
$page=$PageId
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $page -EvidenceDirectory $EvidenceDirectory
function Picture([string]$name){$p=Cmd @('screenshot','--page',$page);Copy-Item -LiteralPath $p.path -Destination (Join-Path $script:Evidence ($name+'.png'))}
function StartCapture(){Read (Get-Content -Raw -Encoding utf8 "$PSScriptRoot/capture-start.js")|Out-Null}
function StopCapture([string]$name){$data=Read (Get-Content -Raw -Encoding utf8 "$PSScriptRoot/capture-stop.js");[IO.File]::WriteAllBytes((Join-Path $script:Evidence ($name+'.webm')),[Convert]::FromBase64String($data))}
Cmd @('reload','--page',$page)|Out-Null
Cmd @('wait','--page',$page,'--selector','#start:not([disabled])')|Out-Null
Cmd @('viewport','--page',$page,'--width','1280','--height','720')|Out-Null
Enter-Chapter
Cmd @('wait','--page',$PageId,'--selector','#game[data-input=free-look],#game[data-input=locked]') | Out-Null
if((Read).input.captureChoice -eq 'denied'){ClickButton '#free-cursor'}
Cmd @('wait','--page',$page,'--selector','#notice:not(.visible)')|Out-Null
Key V
Read @'
(() => {
  const result = {frames: 0, clips: {}, actions: {}, maxRightError: 0, maxLeftError: 0,
                  feetSpan: 0, matFinite: true, minBowForward: 1};
  let active = true;
  const count = (table, key) => { table[key] = (table[key] || 0) + 1; };
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  function sample() {
    if (!active) return;
    const s = window.__ROOM_DEMO__.snapshot();
    const p = s.player;
    if (s.viewMode === 'third' && !s.paused && p.locomotion) {
      result.frames++;
      count(result.clips, p.locomotion);
      if (p.action) count(result.actions, p.action);
      const bow = s.weapon.id === 'blaster-j';
      const [left, right] = p.hands;
      const toWorld = ([x,y,z]) => [
        s.position[0] + Math.cos(s.yaw)*x + Math.sin(s.yaw)*z,
        s.position[1] - .844 + y,
        s.position[2] - Math.sin(s.yaw)*x + Math.cos(s.yaw)*z,
      ];
      const errorR = distance(toWorld(right), s.weapon.handContacts.right);
      const errorL = bow ? distance(toWorld(left), s.weapon.handContacts.left) : 0;
      result.matFinite &&= Number.isFinite(errorL) && Number.isFinite(errorR);
      result.maxRightError = Math.max(result.maxRightError, errorR);
      result.maxLeftError = Math.max(result.maxLeftError, errorL);
      if (bow) {
        const aimZ = (left[2] - right[2]) / Math.max(.00001, distance(left, right));
        result.minBowForward = Math.min(result.minBowForward, aimZ);
      }
      result.feetSpan = Math.max(result.feetSpan, Math.abs(p.feet[0][2] - p.feet[1][2]));
    }
    requestAnimationFrame(sample);
  }
  sample();
  window.__FINISH_POSE_CHECK__ = () => { active = false; return JSON.stringify(result); };
  return true;
})()
'@ | Out-Null
StartCapture
Hold w 550
Picture 'idle-wand'
Hold a 250
Cmd @('exec','--page',$page,'--command','keydown Shift')|Out-Null
try{Cmd @('exec','--page',$page,'--command','keydown w')|Out-Null;try{Key Space;Start-Sleep -Milliseconds 550}finally{Cmd @('exec','--page',$page,'--command','keyup w')|Out-Null}}finally{Cmd @('exec','--page',$page,'--command','keyup Shift')|Out-Null}
Hold s 280
function Fire(){Cmd @('mouse','move','--page',$page,'--x','630','--y','355')|Out-Null;Cmd @('mouse','down','--page',$page,'--button','left')|Out-Null;Cmd @('mouse','up','--page',$page,'--button','left')|Out-Null}
Fire
Key R
Start-Sleep -Milliseconds 600
Key 2
Cmd @('mouse','down','--page',$page,'--button','right')|Out-Null
Cmd @('mouse','move','--page',$page,'--x','630','--y','300')|Out-Null
Cmd @('mouse','move','--page',$page,'--x','630','--y','455')|Out-Null
Cmd @('mouse','move','--page',$page,'--x','630','--y','255')|Out-Null
Picture 'idle-bow'
Fire
Cmd @('mouse','up','--page',$page,'--button','right')|Out-Null
Key R
Start-Sleep -Milliseconds 900
Hold d 180
Key V
Picture 'first-bow'
Key 1
Start-Sleep -Milliseconds 500
Picture 'first-wand'
StopCapture 'after'
$receipt=Read 'window.__FINISH_POSE_CHECK__()'
$t=Read
[ordered]@{bundle=(Read 'document.querySelector(`script[type=module]`).src');samples=$receipt;shots=$t.weapon.shots;jumps=$t.jump.jumps;landings=$t.jump.landings;reloads=$t.weapon.reloads;spells=$t.spells.fired;browser='Orca'}|ConvertTo-Json -Depth 7|Set-Content -Encoding utf8 (Join-Path $script:Evidence 'motion.json')
Key Escape
foreach($clip in @('YBot_Idle','YBot_Walk','YBot_Run','YBot_LeftStrafeWalk','YBot_RightStrafeWalk')){
  if(!$receipt.clips.$clip){throw "Missing locomotion clip: $clip"}
}
foreach($action in @('wand-cast','wand-reload','bow-aim','bow-release','bow-nock')){
  if(!$receipt.actions.$action){throw "Missing tool action: $action"}
}
if(!$receipt.matFinite -or $receipt.maxRightError -gt .001 -or $receipt.maxLeftError -gt .001){throw 'Hand contact drift'}
if($t.jump.landings -lt 1 -or $receipt.feetSpan -lt .15 -or $receipt.minBowForward -lt .30){throw 'Unexpected foot or bow pose'}
if($t.weapon.reloads -lt 2 -or $t.spells.fired -ne $t.weapon.shots){throw 'Tool input failed'}
Write-Output "PASS $($receipt.frames) frames, both grips within 1 mm."
