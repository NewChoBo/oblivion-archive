param(
  [Parameter(Mandatory=$true)][uri]$BaseUrl,
  [string]$EvidenceDirectory=(Join-Path ([IO.Path]::GetTempPath()) ('oblivion-bots-'+[guid]::NewGuid()))
)
$ErrorActionPreference='Stop'
$orcaExe=if($env:ORCA_CLI_COMMAND){$env:ORCA_CLI_COMMAND}else{'orca'}
foreach($case in @(
  @{mode='deathmatch';level='gothic-arena';kind='ranged'},
  @{mode='specter-hunt';level='ink-quarry';kind='melee'}
)){
  $url=[UriBuilder]$BaseUrl
  $query=@($url.Query.TrimStart('?').Split('&')|Where-Object{$_ -and $_ -notmatch '^(?:play|mode|level)(?:=|$)'})
  $url.Query=($query+@("play=arena&mode=$($case.mode)&level=$($case.level)")) -join '&'
  $tab=(& $orcaExe tab create --url $url.Uri.AbsoluteUri --json|Out-String)|ConvertFrom-Json
  if(!$tab.ok){throw ($tab.error|ConvertTo-Json)}
  $page=$tab.result.browserPageId
  try {
    . "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $page -EvidenceDirectory $EvidenceDirectory
    Cmd @('wait','--page',$page,'--fn','window.__ROOM_DEMO__?.snapshot().ready || !document.getElementById(`startup-retry`).hidden','--timeout','90000')|Out-Null
    if(!(Read 'window.__ROOM_DEMO__?.snapshot().ready')){throw (Read 'document.getElementById(`loading`).textContent')}
    $sample='(()=>{let initial;const rows=[];window.__BOT_RUN__=rows;
      function frame(){
        if(!initial && !window.__ROOM_DEMO__.snapshot().started){requestAnimationFrame(frame);return;}
        const s=window.__EXPEDITION__.snapshot();initial ??= s;
        const row={health:s.state.health,distance:0,windup:false,recovery:false,kind:s.world.enemies[0].attack.kind};
        for(const [i,e] of s.world.enemies.entries()){
          const p=initial.world.enemies[i].position;
          row.distance=Math.max(row.distance,Math.hypot(e.position[0]-p[0],e.position[2]-p[2]));
          row.windup ||= e.attack.phase===`windup`;row.recovery ||= e.attack.phase===`recovery`;
        }
        rows.push(row);if(row.health>=initial.state.health)requestAnimationFrame(frame);
      }frame();return true})()'
    Read $sample | Out-Null
    Cmd @('click','--page',$page,'--element','#start')|Out-Null
    $damaged='window.__BOT_RUN__.length>1 && window.__BOT_RUN__.at(-1).health<window.__BOT_RUN__[0].health'
    for($attempt=0;$attempt -lt 4;$attempt++){
      Cmd @('wait','--page',$page,'--fn',("("+$damaged+") || (window.__ROOM_DEMO__.snapshot().started && window.__ROOM_DEMO__.snapshot().paused)"),'--timeout','48000')|Out-Null
      if(Read $damaged){break}
      # Native browser focus loss pauses the game. Use its ordinary resume button.
      Cmd @('click','--page',$page,'--element','#start')|Out-Null
    }
    $result=Read '(()=>{const r=window.__BOT_RUN__,last=r.at(-1);return {kind:last.kind,damage:r[0].health-last.health,movement:Math.max(...r.map(v=>v.distance)),windup:r.some(v=>v.windup && v.health===r[0].health),recovery:last.recovery}})()'
    if($result.kind -ne $case.kind -or $result.damage -le 0 -or $result.movement -le .15 -or !$result.windup -or !$result.recovery){
      throw ($result|ConvertTo-Json)
    }
    $console=Cmd @('console','--page',$page,'--limit','200')
    if($console.truncated -or @($console.entries|Where-Object level -eq 'error').Count){throw ($console|ConvertTo-Json)}
    $result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $EvidenceDirectory ($case.mode+'.json')) -Encoding utf8
    Write-Output ("PASS "+$case.mode+" "+($result|ConvertTo-Json -Compress))
  } catch {
    $diagnostics=Read '(()=>{const s=window.__ROOM_DEMO__?.snapshot();return {mode:location.search,started:s?.started,paused:s?.paused,samples:window.__BOT_RUN__?.length,first:window.__BOT_RUN__?.[0],last:window.__BOT_RUN__?.at(-1),enemies:window.__EXPEDITION__?.snapshot().world.enemies}})()'
    Write-Output ($diagnostics|ConvertTo-Json -Depth 6 -Compress)
    throw
  } finally { & $orcaExe tab close --page $page --json | Out-Null }
}
