param([Parameter(Mandatory=$true)][string]$PageId,[Parameter(Mandatory=$true)][string]$EvidenceDirectory)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
function Mouse([string]$action,[string]$button){Cmd @('mouse',$action,'--page',$PageId,'--button',$button)|Out-Null}
function Still([string]$name){$shot=Cmd @('screenshot','--page',$PageId);Copy-Item -LiteralPath $shot.path -Destination (Join-Path $script:Evidence ($name+'.png'))}
Cmd @('reload','--page',$PageId)|Out-Null
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not(:disabled)')|Out-Null
Enter-Chapter
Cmd @('wait','--page',$PageId,'--selector','#game[data-input=free-look],#game[data-input=locked]')|Out-Null
if((Read).input.captureChoice -eq 'denied'){ClickButton '#free-cursor'}
Cmd @('wait','--page',$PageId,'--selector','#notice:not(.visible)')|Out-Null
Cmd @('mouse','move','--page',$PageId,'--x','640','--y','360')|Out-Null
Read @'
(()=>{
  const shots=[],sub=(a,b)=>a.map((x,i)=>x-b[i]);
  let last=0,active=true;
  function next(){
    const s=window.__ROOM_DEMO__.snapshot();
    if(s.spells.fired>last){
      const e=s.spells.events.at(-1),axis=sub(e.muzzle,s.weapon.handContacts.right),path=sub(e.end,e.start);
      const cosine=axis.reduce((sum,x,i)=>sum+x*path[i],0)/(Math.hypot(...axis)*Math.hypot(...path));
      shots.push({tool:s.weapon.model,view:s.viewMode,pitch:s.pitch,aimed:s.weapon.aimed,blocked:e.muzzleBlocked,
        degrees:Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI,
        originError:Math.hypot(...sub(e.start,e.muzzle)),surface:e.mesh});
      last=s.spells.fired;
    }
    if(active)requestAnimationFrame(next);
  }
  next();window.finishToolReview=()=>{active=false;return shots};return true;
})()
'@|Out-Null
foreach($view in 'first','third'){
  if($view -eq 'third'){
    # Give the over-shoulder camera room behind the scribe, clear of the entry wall.
    Cmd @('exec','--page',$PageId,'--command','keydown w')|Out-Null
    try{Read 'new Promise(r=>{const limit=performance.now()+3500;function test(){if(window.__ROOM_DEMO__.snapshot().position[2]>-2||performance.now()>limit)r(true);else requestAnimationFrame(test)}test()})'|Out-Null}
    finally{Cmd @('exec','--page',$PageId,'--command','keyup w')|Out-Null}
    Key V
  }
  foreach($tool in 'wand','bow'){
    if($tool -eq 'bow'){Key 2}else{Key 1}
    Start-Sleep -Milliseconds 650
    Still "$view-$tool-carry"
    Mouse down left;Mouse up left
    Key R
    Start-Sleep -Milliseconds 1600
    $ammo=(Read).weapon.ammo
    Mouse down right
    try{
      Start-Sleep -Milliseconds 450
      $pose=(Read).weapon
      if(!$pose.aimed -or $pose.readiness -lt .98 -or $pose.ammo -ne $ammo){throw "Aim check failed for $view $tool (aim=$($pose.aimed) weight=$($pose.readiness) ammo=$($pose.ammo)/$ammo)"}
      $level=(Read).pitch
      Cmd @('mouse','move','--page',$PageId,'--x','640','--y','406')|Out-Null
      if([Math]::Abs((Read).pitch-$level) -lt .015){throw "View did not turn while aiming $view $tool"}
      Cmd @('mouse','move','--page',$PageId,'--x','640','--y','360')|Out-Null
      Still "$view-$tool-aim"
      Mouse down left;Mouse up left
    }finally{Mouse up right}
    Start-Sleep -Milliseconds 850
    if((Read).weapon.readiness -gt .03){throw 'Aim did not return to carry.'}
  }
}
Cmd @('viewport','--page',$PageId,'--width','600','--height','920')|Out-Null
Key V;Key 1
Start-Sleep -Milliseconds 600
Still 'narrow-wand'
Key 2
Start-Sleep -Milliseconds 600
Still 'narrow-bow'
$shots=Read 'window.finishToolReview()'
$result=[ordered]@{browser='Orca';bundle=(Read 'document.querySelector(`script[type=module]`).src');shots=$shots}
$result|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $script:Evidence 'orientation.json') -Encoding utf8
Key Escape
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
foreach($view in 'first','third'){
  foreach($tool in 'vesper-quill.glb','dawn-folio.glb'){
    $observed=@($shots|Where-Object {$_.view -eq $view -and $_.tool -eq $tool -and !$_.blocked})
    if($observed.Count -lt 2 -or $observed[0].aimed -or $true -notin $observed.aimed){throw "Missing quick and aimed shots for $view $tool"}
  }
}
if(@($shots|Where-Object {!$_.blocked -and ($_.degrees -gt 1 -or $_.originError -gt .001)}).Count){throw 'Released tool does not point to the visible trajectory.'}
Write-Output ("PASS "+$shots.Count+" releases")
