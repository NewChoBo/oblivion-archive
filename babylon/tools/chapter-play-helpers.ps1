param([Parameter(Mandatory=$true)][string]$PageId,[string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-22/chapter1")
$ErrorActionPreference='Stop'
$script:OrcaExe=if($env:ORCA_CLI_COMMAND){$env:ORCA_CLI_COMMAND}else{'orca'}
$script:Evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Path $script:Evidence -Force | Out-Null
function Cmd([string[]]$Arguments){
  for($attempt=0;$attempt -lt 5;$attempt++){
    $r=(& $script:OrcaExe @Arguments --json|Out-String)|ConvertFrom-Json
    if($r.ok){return $r.result}
    # The host explicitly confirms these events never reached the QA tab.
    if($r.error.message -notlike '*input was not sent*' -or $attempt -eq 4){throw ($r.error|ConvertTo-Json -Compress)}
    Start-Sleep -Seconds 3
  }
}
function Read([string]$Expression='window.__ROOM_DEMO__.snapshot()'){$r=Cmd @('eval','--page',$PageId,'--expression',$Expression);try{return ($r.result|ConvertFrom-Json -ErrorAction Stop)}catch{return $r.result}}
function Open-FramebufferCapture([string]$Url){
  $builder=[UriBuilder]$Url
  $query=@($builder.Query.TrimStart('?').Split('&')|Where-Object{$_ -and $_ -notmatch '^capture(?:=|$)'})
  $builder.Query=($query+@('capture=1')) -join '&'
  Cmd @('goto','--page',$PageId,'--url',$builder.Uri.AbsoluteUri)|Out-Null
}
function Key([string]$Value){Cmd @('keypress','--page',$PageId,'--key',$Value)|Out-Null}
function Enter-LoadedLevel(){
  Cmd @('wait','--page',$PageId,'--fn','new URLSearchParams(location.search).has(`play`) && window.__ROOM_DEMO__?.snapshot().ready && !document.getElementById(`start`).disabled','--timeout','60000')|Out-Null
  Cmd @('click','--page',$PageId,'--element','#start')|Out-Null
}
function Enter-Chapter(){
  if(!(Read 'new URLSearchParams(location.search).has(`play`)')){Cmd @('click','--page',$PageId,'--element','#start') | Out-Null}
  Enter-LoadedLevel
  if(Read 'document.getElementById(`prologue`)?.open === true'){
    Cmd @('click','--page',$PageId,'--element','#prologue [data-skip]') | Out-Null
  }
}
# Send real mouse strokes on the canvas. Crossing a HUD button between strokes
# lets free-look recenter without reversing the turn or relying on edge scrolling.
function Look([double[]]$Point,[double[]]$Angles,[string]$TargetId){
  $goal=@{point=$Point;angles=$Angles;targetId=$TargetId}|ConvertTo-Json -Compress
  $measure=@'
(() => {
 const goal=JSON.parse(decodeURIComponent(`GOAL`)),s=window.__ROOM_DEMO__.snapshot(),button=document.getElementById(`interact`);
 if(s.paused)throw Error(`Cannot look while paused`);
 if(goal.targetId && !button.hidden && window.__EXPEDITION__.snapshot().target===goal.targetId)return {done:true};
 const [x,y,z]=s.camera.position, p=goal.point;
 const [yaw,pitch]=p?[Math.atan2(p[0]-x,p[2]-z),-Math.atan2(p[1]-y,Math.hypot(p[0]-x,p[2]-z))]:goal.angles;
 const error=yaw-s.yaw, gain=.0026*s.preferences.sensitivity;
 const dx=Math.round(Math.atan2(Math.sin(error),Math.cos(error))/gain),dy=Math.round((pitch-s.pitch)/gain);
 if(Math.abs(dx)<=2&&Math.abs(dy)<=2)return {done:true};
 const canvas=document.getElementById(`game`),w=innerWidth,h=innerHeight;
 const scale=Math.min(1,(w-112)/Math.max(1,Math.abs(dx)),h*.62/Math.max(1,Math.abs(dy)));
 const mx=Math.round(dx*scale),my=Math.round(dy*scale);
 const hud=document.getElementById(`help`).getBoundingClientRect();
 for(const cy of [.45,.55,.38,.65])for(const cx of [.5,.41,.59]){
   const ax=Math.round(w*cx-mx/2),ay=Math.round(h*cy-my/2),bx=ax+mx,by=ay+my;
   if(Math.min(ax,bx,ay,by,w-ax,w-bx,h-ay,h-by)>48&&document.elementFromPoint(ax,ay)===canvas&&document.elementFromPoint(bx,by)===canvas)
     return {locked:s.input.locked,points:[[Math.round(hud.x+hud.width/2),Math.round(hud.y+hud.height/2)],[ax,ay],[bx,by]]};
 }
 throw Error(`No unobstructed mouse stroke`);
})()
'@
  for($attempt=0;$attempt -lt 25;$attempt++){
    $stroke=Read ($measure.Replace('GOAL',[uri]::EscapeDataString($goal)))
    if($stroke.done){return}
    if($stroke.locked){Key Escape}
    for($i=0;$i -lt 3;$i++){
      if($stroke.locked -and $i -eq 0){continue}
      if($stroke.locked -and $i -eq 2){Key Enter}
      $xy=$stroke.points[$i]
      Cmd @('mouse','move','--page',$PageId,'--x',([string]$xy[0]),'--y',([string]$xy[1]))|Out-Null
    }
  }
  throw 'Could not align the camera with the requested view'
}
function Hold([string]$Value,[int]$Milliseconds){Cmd @('exec','--page',$PageId,'--command',('keydown '+$Value))|Out-Null;try{if($Milliseconds -gt 0){Start-Sleep -Milliseconds $Milliseconds}}finally{Cmd @('exec','--page',$PageId,'--command',('keyup '+$Value))|Out-Null}}
function ClickButton([string]$Selector){Cmd @('click','--page',$PageId,'--element',$Selector)|Out-Null}
function WaitForWeapon([ValidateSet('wand','bow')][string]$Kind){
  $ready=if($Kind -eq 'bow'){'w.id===`blaster-j` && w.nock.ready && !w.drawing'}else{'w.id===`blaster-a` && w.ammo>0'}
  Cmd @('wait','--page',$PageId,'--fn',('(()=>{const w=window.__ROOM_DEMO__?.snapshot().weapon;return w?.state===`ready` && '+$ready+'})()'))|Out-Null
}
function RestoreInputPreferences($saved){
  $state=Read
  if($state.preferences.pointerLock -eq $saved.pointerLock -and $state.preferences.dominantHand -eq $saved.dominantHand){return}
  if(Read 'document.getElementById(`settings-panel`).hidden'){
    if($state.started -and !$state.paused){Key Escape}
    ClickButton '#settings-open'
  }
  if($state.preferences.pointerLock -ne $saved.pointerLock){Cmd @('click','--page',$PageId,'--element','#pointer-lock')|Out-Null}
  if($state.preferences.dominantHand -ne $saved.dominantHand){Cmd @('click','--page',$PageId,'--element','#left-handed')|Out-Null}
  Key Escape
}
function Capture([string]$Name){$c=Cmd @('screenshot','--page',$PageId);Copy-Item -LiteralPath $c.path -Destination (Join-Path $script:Evidence ($Name+'.png'));Read|ConvertTo-Json -Depth 18|Set-Content -LiteralPath (Join-Path $script:Evidence ($Name+'.json')) -Encoding utf8}
function Note([string]$Name){$s=Read;$s|ConvertTo-Json -Depth 18|Set-Content -LiteralPath (Join-Path $script:Evidence ($Name+'.json')) -Encoding utf8;$s|Select-Object phase,position,defeated,paused,yaw,pitch,@{n='runes';e={$_.chapter.runes -join ','}},@{n='health';e={$_.world.health}},@{n='grounded';e={$_.jump.grounded}}|ConvertTo-Json -Compress}

# Walk to a point on the citadel survey grid using native forward input.
function Go([double]$X,[double]$Z){
  $tx=$X+$origin[0];$tz=$Z+$origin[2]
  $s=Read
  $slowed=$false
  try{for($attempt=0;$attempt -lt 3;$attempt++){
    $dx=$tx-$s.position[0];$dz=$tz-$s.position[2]
    $length=[math]::Sqrt($dx*$dx+$dz*$dz)
    if($length -le .65){break}
    # A delayed native key-up can carry the player past a short landing.
    # Re-approach its original survey point at walking or crouching speed.
    if($attempt -gt 0 -and $s.movement.posture -eq 'standing'){Key C;$slowed=$true}
    Look -Angles @([math]::Atan2($dx,$dz),0)
    $txs=$tx.ToString([cultureinfo]::InvariantCulture);$tzs=$tz.ToString([cultureinfo]::InvariantCulture)
    $nx=($dx/$length).ToString([cultureinfo]::InvariantCulture);$nz=($dz/$length).ToString([cultureinfo]::InvariantCulture)
    Cmd @('exec','--page',$PageId,'--command','keydown w')|Out-Null
    try{
      $arrived=Read "new Promise(resolve=>{const end=performance.now()+14000;function step(){const s=window.__ROOM_DEMO__.snapshot(),[x,,z]=s.position;if(($txs-x)*($nx)+($tzs-z)*($nz)<.82)resolve(true);else if(s.paused||performance.now()>end)resolve(false);else requestAnimationFrame(step)}step()})"
      if(!$arrived){throw "Walk stopped before $X, $Z"}
    }finally{Cmd @('exec','--page',$PageId,'--command','keyup w')|Out-Null}
    $s=Read
    if([math]::Pow($s.position[0]-$tx,2)+[math]::Pow($s.position[2]-$tz,2) -le 3.8){break}
  }}finally{if($slowed){Key C}}
  if([math]::Pow($s.position[0]-$tx,2)+[math]::Pow($s.position[2]-$tz,2) -gt 3.8){throw "Missed $X, $Z at $($s.position)"}
  $visited.Add(@{station=@($X,$Z);position=$s.position;view=$s.viewMode})
}
