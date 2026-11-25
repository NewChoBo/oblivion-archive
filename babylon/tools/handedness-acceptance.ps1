param([Parameter(Mandatory=$true)][string]$PageId,[Parameter(Mandatory=$true)][string]$EvidenceDirectory)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
function Check($condition,$reason){if(!$condition){throw $reason}}
function ClickId([string]$id){Cmd @('click','--page',$PageId,'--element',('#'+$id))|Out-Null}
function CenterMouse(){Cmd @('mouse','move','--page',$PageId,'--x','640','--y','360')|Out-Null}
function SettingsHand([string]$hand){
  ClickId 'settings-open'
  if((Read).preferences.dominantHand -ne $hand){ClickId 'left-handed'}
  Check ((Read).preferences.dominantHand -eq $hand) 'Hand preference did not update'
  Key Escape
  Cmd @('wait','--page',$PageId,'--selector','#overlay:not([hidden])')|Out-Null
}
function WatchPlay(){
  Read @'
(()=>{
  const snap=()=>window.__ROOM_DEMO__.snapshot(),canvas=document.getElementById('game');
  const frames={},shots=[];
  const frame=document.createElement('canvas');frame.width=768;frame.height=432;
  const ctx=frame.getContext('2d');
  let capture='',input='',last=snap().spells.fired,active=true,pressedAt=0;
  const taps=[];
  document.addEventListener('pointerdown',e=>{if(capture && e.button===0 && e.isTrusted)pressedAt=e.timeStamp},true);
  document.addEventListener('pointerup',e=>{if(capture && input==='tap' && e.button===0 && e.isTrusted && pressedAt)taps.push({capture,ms:e.timeStamp-pressedAt})},true);
  function still(key){ctx.drawImage(canvas,0,0,frame.width,frame.height);frames[key]=frame.toDataURL('image/webp',.88).split(',')[1]}
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),len=v=>Math.hypot(...v);
  function sample(){
    const s=snap(),w=s.weapon,hand=w.dominantHand;
    if(capture && w.stroke.sweep>.25 && !frames[capture+'-lift'])still(capture+'-lift');
    if(capture && w.stroke.sweep<-.25 && !frames[capture+'-finish'])still(capture+'-finish');
    if(s.spells.fired>last){
      last=s.spells.fired;
      const e=s.spells.events.at(-1),dominant=w.handContacts[hand],axis=sub(e.muzzle,dominant),path=sub(e.end,e.start);
      const dot=axis.reduce((n,v,i)=>n+v*path[i],0)/(len(axis)*len(path));
      const item={hand,input,view:s.viewMode,tool:w.arcane.form,clip:s.player.action,alignment:w.stroke.alignment,
        blocked:e.muzzleBlocked,originError:len(sub(e.muzzle,e.start)),surface:e.mesh,yaw:s.yaw,pitch:s.pitch,
        angle:Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI};
      if(s.viewMode==='third'){
        const [x,y,z]=s.position,c=Math.cos(s.yaw),d=Math.sin(s.yaw);
        item.shoulderOffset=(s.camera.position[0]-x)*c-(s.camera.position[2]-z)*d;
        for(const [i,side] of ['left','right'].entries()){
          if(w.arcane.form==='crystal-wand' && side!==hand)continue;
          const [a,b,h]=s.player.hands[i];
          item[side+'Gap']=len(sub([x+a*c+h*d,y-.844+b,z-a*d+h*c],w.handContacts[side]));
        }
      }
      shots.push(item);
      if(capture && !frames[capture+'-release'])still(capture+'-release');
    }
    if(active)requestAnimationFrame(sample);
  }
  window.handReview={start(k){capture=k;input='tap';still(k+'-carry')},hold(){input='hold'},stop(){capture=''},frames,shots,taps,end(){active=false}};
  sample();return true;
})()
'@|Out-Null
}
Open-FramebufferCapture (Read '({url:location.href})').url
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not(:disabled)')|Out-Null
$originalPreferences=(Read).preferences
$requestedLock=$originalPreferences.pointerLock
if($requestedLock){
  ClickId 'settings-open';ClickId 'pointer-lock';Key Escape
  Check (!(Read).preferences.pointerLock) 'Could not select free look for the paired captures'
}
SettingsHand 'right'
Enter-Chapter
Cmd @('wait','--page',$PageId,'--selector','#game[data-input=free-look],#game[data-input=locked]')|Out-Null
if((Read).input.captureChoice -eq 'denied'){ClickButton '#free-cursor'}
CenterMouse
Hold w 1000
Cmd @('wait','--page',$PageId,'--selector','#notice:not(.visible)')|Out-Null
WatchPlay
foreach($hand in 'right','left'){
  if($hand -eq 'left'){
    Key Escape
    $previous=Read
    SettingsHand 'left'
    ClickButton '#start'
    CenterMouse
    $switched=Read
    Check ($previous.weapon.ammo -eq $switched.weapon.ammo -and $previous.viewMode -eq $switched.viewMode) 'Switch interrupted game state'
  }
  foreach($view in 'first','third'){
    if((Read).viewMode -ne $view){Key V}
    foreach($tool in 'wand','bow'){
      if($tool -eq 'wand'){
        Key 1;Start-Sleep -Milliseconds 500;Key R;Start-Sleep -Milliseconds 1200
      }else{
        Key 2;WaitForWeapon bow
      }
      $k="$hand-$view-$tool"
      Read ("window.handReview.start('"+$k+"')")|Out-Null
      $before=Read
      $movie=$view -eq 'third' -and $tool -eq 'wand'
      if($movie){Read (Get-Content -Raw -Encoding utf8 "$PSScriptRoot/capture-start.js")|Out-Null}
      ClickId 'game'
      Start-Sleep -Milliseconds 350
      $after=Read
      Check ($after.spells.fired -eq $before.spells.fired+1) "Expected one shot for $k"
      if($tool -eq 'bow'){WaitForWeapon bow}
      Read 'window.handReview.hold()'|Out-Null
      Cmd @('mouse','down','--page',$PageId,'--button','right')|Out-Null
      Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null
      try{Start-Sleep -Milliseconds 350}finally{
        Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null
        Cmd @('mouse','up','--page',$PageId,'--button','right')|Out-Null
      }
      if($movie){
        $bytes=Read (Get-Content -Raw -Encoding utf8 "$PSScriptRoot/capture-stop.js")
        [IO.File]::WriteAllBytes((Join-Path $script:Evidence ($hand+'-cast.webm')),[Convert]::FromBase64String($bytes))
      }
      Read 'window.handReview.stop()'|Out-Null
    }
  }
}
$shots=Read 'window.handReview.shots'
$taps=Read 'window.handReview.taps'
$keys=Read 'Object.keys(window.handReview.frames)'
foreach($k in $keys){
  $image=Read ("window.handReview.frames['"+$k+"']")
  [IO.File]::WriteAllBytes((Join-Path $script:Evidence ($k+'.webp')),[Convert]::FromBase64String($image))
}
Read 'window.handReview.end()'|Out-Null
Key Escape
Cmd @('reload','--page',$PageId)|Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not(:disabled)')|Out-Null
Check ((Read).preferences.dominantHand -eq 'left' -and (Read).weapon.dominantHand -eq 'left') 'Reload lost handedness'
ClickId 'settings-open'
Check (Read 'document.querySelector(`#left-handed`).checked') 'Reloaded setting unchecked'
if($originalPreferences.dominantHand -eq 'right'){ClickId 'left-handed'}
if($requestedLock){ClickId 'pointer-lock'}
Key Escape
$report=[ordered]@{bundle=(Read 'document.querySelector(`script[type=module]`).src');browser='Orca';reloadLeft=$true;taps=$taps;shots=$shots}
$report|ConvertTo-Json -Depth 5|Set-Content (Join-Path $script:Evidence 'checks.json') -Encoding utf8
foreach($hand in 'right','left'){foreach($view in 'first','third'){foreach($form in 'crystal-wand','rune-bow'){
  $releases=@($shots|Where-Object {$_.hand -eq $hand -and $_.view -eq $view -and $_.tool -eq $form -and !$_.blocked})
  Check ($releases.Count -gt 0) "Missing releases: $hand $view $form"
  Check (@($releases|Where-Object input -eq 'tap').Count -eq 1 -and @($releases|Where-Object input -eq 'hold').Count -gt 0) "Missing tap or held cast"
  foreach($r in $releases){
    Check ($r.originError -lt .001 -and $r.angle -lt 1 -and $r.leftGap -lt .012 -and $r.rightGap -lt .012) ("Hand or trajectory mismatch: "+($r|ConvertTo-Json -Compress))
    if($view -eq 'third'){
      $expectedSign=@{left=-1;center=0;right=1}[$originalPreferences.cameraShoulder]
      Check ([Math]::Sign([Math]::Round($r.shoulderOffset,3)) -eq $expectedSign) 'Camera moved off the configured shoulder'
    }
  }
}}}
Write-Output ("PASS "+$shots.Count+" releases")
