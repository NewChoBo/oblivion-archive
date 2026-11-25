param([Parameter(Mandatory=$true)][string]$PageId,[Parameter(Mandatory=$true)][string]$EvidenceDirectory)
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
function ClickId($id){Cmd @('click','--page',$PageId,'--element',('#'+$id))|Out-Null}
function Mouse($action){Cmd @('mouse',$action,'--page',$PageId,'--button','left')|Out-Null}
function Assert($condition,$message){if(!$condition){throw $message}}
function Shot(){
  $s=Read
  $e=$s.spells.events[-1]
  $originError=if($e){[Math]::Sqrt([Math]::Pow($e.start[0]-$e.muzzle[0],2)+[Math]::Pow($e.start[1]-$e.muzzle[1],2)+[Math]::Pow($e.start[2]-$e.muzzle[2],2))}
  [ordered]@{shots=$s.spells.fired;nocked=$s.weapon.nock.ready;power=$e.bowPower;speed=$e.speed;bindSeconds=$e.bindSeconds;hit=$e.mesh;arrived=$e.arrived;originError=$originError}
}
Cmd @('reload','--page',$PageId)|Out-Null
Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not(:disabled)')|Out-Null
$original=(Read).preferences
try{
ClickId 'settings-open'
if($original.pointerLock){ClickId 'pointer-lock'}
if($original.dominantHand -ne 'right'){ClickId 'left-handed'}
Key Escape
Enter-Chapter
Cmd @('mouse','move','--page',$PageId,'--x','640','--y','360')|Out-Null
Hold w 900
Key 2
WaitForWeapon bow
# Check the visible ammunition label and unit in the active language.
$ammo=Read '({label:document.querySelector(`#ammo-label`).textContent,unit:document.querySelector(`#ammo-unit`).textContent,totalHidden:document.querySelector(`#ammo .ammo-total`).hidden})'
$expected=if((Read 'document.documentElement.lang') -eq 'ko'){@('화살통','발')}else{@('Quiver','arrows')}
Assert ($ammo.label -ceq $expected[0] -and $ammo.unit -ceq $expected[1] -and $ammo.totalHidden) 'Bow did not show quiver stock and hide the charge capacity'
$results=[ordered]@{browser='Orca';bundle=(Read 'document.querySelector(`script[type=module]`).src');cases=@()}
foreach($hand in 'right','left'){
  if($hand -eq 'left'){Key Escape;ClickId 'settings-open';ClickId 'left-handed';Key Escape;Enter-Chapter}
  foreach($view in 'first','third'){
    if((Read).viewMode -ne $view){Key V}
    $before=Read
    Assert ($before.weapon.dominantHand -eq $hand) 'Unexpected hand'
    ClickId 'game'
    $tap=Shot
    Assert ($tap.shots -eq $before.spells.fired+1 -and $tap.power -lt .15) ("Unexpected quick release for $hand $view, from "+$before.spells.fired+" to "+($tap|ConvertTo-Json -Compress))
    WaitForWeapon bow
    Cmd @('exec','--page',$PageId,'--command','mouse down left')|Out-Null
    try{Start-Sleep -Milliseconds 130}finally{Cmd @('exec','--page',$PageId,'--command','mouse up left')|Out-Null}
    $partial=Shot
    Assert ($partial.shots -eq $tap.shots+1 -and $partial.power -gt $tap.power -and $partial.power -lt 1) 'Expected one intermediate-strength arrow'
    WaitForWeapon bow
    $movie=($hand -eq 'right')
    if($movie){Read (Get-Content -Raw "$PSScriptRoot/capture-start.js")|Out-Null}
    Read @'
(()=>{
  const points=[],until=performance.now()+12000;
  function observe(){
    const s=window.__ROOM_DEMO__.snapshot();
    const {drawing,draw,handContacts,arcane}=s.weapon;
    if(drawing && draw >= [.20,.50,.80,1][points.length]){
      const span=Math.hypot(...handContacts.left.map((value,i)=>value-handContacts.right[i]));
      const support=handContacts[s.weapon.dominantHand==='right'?'left':'right'];
      const [x,y,z]=support.map((v,i)=>v-s.camera.position[i]);
      const side=x*Math.cos(s.yaw)-z*Math.sin(s.yaw);
      const depth=(x*Math.sin(s.yaw)+z*Math.cos(s.yaw))*Math.cos(s.pitch)-y*Math.sin(s.pitch);
      const [width,height]=s.camera.viewport;
      const gripScreenX=.5+side*height/(2*depth*Math.tan(s.camera.fov/2)*width);
      const point={draw,span,glow:arcane.charge,gripScreenX};
      if(s.viewMode==='third'){
        const c=Math.cos(s.yaw),d=Math.sin(s.yaw);
        point.wristGap=Math.max(...s.player.hands.map(([a,b,h],i)=>{
          const p=[s.position[0]+a*c+h*d,s.position[1]-.844+b,s.position[2]-a*d+h*c];
          const grip=i===0?handContacts.left:handContacts.right;
          return Math.hypot(...p.map((v,j)=>v-grip[j]));
        }));
      }
      points.push(point);
    }
    if(points.length<4 && performance.now()<until)requestAnimationFrame(observe);
  }
  window.bowDrawSamples=points;observe();return true;
})()
'@|Out-Null
    Mouse down
    try{
      Start-Sleep -Milliseconds 1360
      $drawn=Read
      Assert ($drawn.weapon.drawing -and $drawn.weapon.draw -eq 1 -and $drawn.weapon.nock.ready -and $drawn.spells.fired -eq $partial.shots) 'Full draw released before the button was let go'
      $image=Cmd @('screenshot','--page',$PageId)
      Copy-Item -LiteralPath $image.path -Destination (Join-Path $script:Evidence "$hand-$view.png")
    }finally{Mouse up}
    Start-Sleep -Milliseconds 480
    $full=Shot
    Assert ($full.shots -eq $partial.shots+1 -and $full.power -eq 1 -and $full.arrived) 'Full release did not resolve one arrow'
    Assert ($full.speed -gt $tap.speed -and $full.bindSeconds -gt $tap.bindSeconds) 'Draw did not change arrow strength'
    if($movie){
      WaitForWeapon bow
      $bytes=Read (Get-Content -Raw "$PSScriptRoot/capture-stop.js")
      [IO.File]::WriteAllBytes((Join-Path $script:Evidence "$view-draw-release.webm"),[Convert]::FromBase64String($bytes))
    }
    $poses=Read 'window.bowDrawSamples'
    Assert ($poses.Count -eq 4 -and $poses[-1].span -gt $poses[0].span+.025) 'Draw did not visibly separate the hands'
    foreach($pose in $poses){
      if($view -eq 'first'){
        $offset=if($hand -eq 'right'){$pose.gripScreenX-.5}else{.5-$pose.gripScreenX}
        Assert ($offset -gt .035 -and $offset -lt .48) "Unexpected first-person grip at draw $($pose.draw) for $hand"
      }else{
        Assert ($pose.gripScreenX -gt 0 -and $pose.gripScreenX -lt 1) 'Third-person grip left the viewport'
      }
    }
    Assert (@($poses|Where-Object wristGap -gt .012).Count -eq 0) 'String or grip slipped out of a hand'
    Assert ($tap.originError -lt .001 -and $partial.originError -lt .001 -and $full.originError -lt .001) 'Arrow did not start at its tip'
    $results.cases+=@{hand=$hand;view=$view;tap=$tap;partial=$partial;full=$full;poses=$poses;heldAtFull=@{shots=$drawn.spells.fired;nocked=$drawn.weapon.nock.ready}}
    WaitForWeapon bow
  }
}
$before=Shot
Mouse down
try{Key Escape}finally{Mouse up}
Enter-Chapter
$after=Shot
Assert ($after.shots -eq $before.shots -and $after.nocked -eq $before.nocked) 'Pause released an arrow'
Mouse down
try{Key 1}finally{Mouse up}
Key 2
WaitForWeapon bow
Assert ((Read).spells.fired -eq $before.shots) 'Switch released an arrow'
Mouse down
try{
  Key R
  Assert ((Read).weapon.drawing -and (Read).spells.fired -eq $before.shots) 'The wand recharge key changed the bow draw'
  Key Escape
}finally{Mouse up}
$results.cancelledBy=@('pause','tool switch')
Key Escape
}finally{RestoreInputPreferences $original}
$results|ConvertTo-Json -Depth 7|Set-Content (Join-Path $script:Evidence 'checks.json') -Encoding utf8
Write-Output 'PASS charged bow releases and cancellation'
