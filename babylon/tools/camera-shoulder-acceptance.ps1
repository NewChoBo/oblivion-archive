param([Parameter(Mandatory=$true)][string]$PageId,[Parameter(Mandatory=$true)][string]$EvidenceDirectory)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
function ClickId($id){Cmd @('click','--page',$PageId,'--element',('#'+$id))|Out-Null}
function SetShoulder($side){Cmd @('select','--page',$PageId,'--element','#camera-shoulder','--value',$side)|Out-Null}
Cmd @('goto','--page',$PageId,'--url','http://localhost:4186/')|Out-Null
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not(:disabled)')|Out-Null
$original=(Read).preferences
$cases=@()
try {
  ClickId 'settings-open'
  if($original.pointerLock){ClickId 'pointer-lock'}
  Key Escape
  Enter-Chapter
  Hold w 900
  Key V
  foreach($hand in 'right','left'){
    foreach($side in 'left','center','right'){
      Key Escape
      ClickId 'settings-open'
      if((Read).preferences.dominantHand -ne $hand){ClickId 'left-handed'}
      SetShoulder $side
      Key Escape
      Enter-Chapter
      Cmd @('mouse','move','--page',$PageId,'--x','640','--y','360')|Out-Null
      Key 1
      Start-Sleep -Milliseconds 1400
      Read @'
(()=>{
  const snap=()=>window.__ROOM_DEMO__.snapshot();
  const start=snap(),tools=new Set();
  let drift=0,rotationDrift=0,fovDrift=0,draw=0,frames=0,raf;
  const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  function sample(){
    const s=snap();
    tools.add(s.weapon.id);
    drift=Math.max(drift,distance(s.camera.position,start.camera.position));
    rotationDrift=Math.max(rotationDrift,distance(s.camera.rotation,start.camera.rotation));
    fovDrift=Math.max(fovDrift,Math.abs(s.camera.fov-start.camera.fov));
    draw=Math.max(draw,s.weapon.draw);
    frames++;
    raf=requestAnimationFrame(sample);
  }
  sample();
  window.finishCameraProbe=()=>{
    cancelAnimationFrame(raf);
    const [x,,z]=start.camera.position.map((v,i)=>v-start.position[i]);
    return {hand:start.weapon.dominantHand,side:start.preferences.cameraShoulder,view:start.viewMode,
      offset:x*Math.cos(start.yaw)-z*Math.sin(start.yaw),tools:[...tools],frames,draw,
      shots:snap().spells.fired-start.spells.fired,drift,rotationDrift,fovDrift};
  };
  return true;
})()
'@|Out-Null
      Key 2
      WaitForWeapon bow
      Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null
      try{Start-Sleep -Milliseconds 1350}finally{Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}
      WaitForWeapon bow
      Key 3
      Start-Sleep -Milliseconds 500
      $case=Read 'window.finishCameraProbe()'
      $sign=[Math]::Sign([Math]::Round($case.offset,3))
      if($case.hand -ne $hand -or $case.side -ne $side -or $case.view -ne 'third' -or $sign -ne @{left=-1;center=0;right=1}[$side] -or
         ($case.tools -join ',') -ne 'blaster-a,blaster-j,torch' -or $case.draw -ne 1 -or $case.shots -ne 1 -or
         $case.drift -gt .001 -or $case.rotationDrift -gt .00001 -or $case.fovDrift -gt .00001){throw ($case|ConvertTo-Json -Compress)}
      $cases+=$case
    }
  }
  $report=@{browser='Orca';bundle=(Read 'document.querySelector(`script[type=module]`).src');cases=$cases}
  $report|ConvertTo-Json -Depth 4|Set-Content (Join-Path $script:Evidence 'camera-shoulder.json') -Encoding utf8
  Write-Output "PASS $($cases.Count) camera and hand combinations"
}finally{
  if(Read 'document.getElementById(`settings-panel`).hidden'){
    if((Read).started -and !(Read).paused){Key Escape}
    ClickId 'settings-open'
  }
  SetShoulder $original.cameraShoulder
  RestoreInputPreferences $original
  if(!(Read 'document.getElementById(`settings-panel`).hidden')){Key Escape}
}
