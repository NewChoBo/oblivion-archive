param(
  [Parameter(Mandatory=$true)][uri]$BaseUrl,
  [string]$EvidenceDirectory=(Join-Path ([IO.Path]::GetTempPath()) ('oblivion-renderers-'+[guid]::NewGuid()))
)
$ErrorActionPreference='Stop'
$orcaExe=if($env:ORCA_CLI_COMMAND){$env:ORCA_CLI_COMMAND}else{'orca'}
$report=@()
foreach($backend in 'webgl','webgpu'){
  foreach($layout in 'desktop','landscape'){
    $page=$null
    try {
      $url=[UriBuilder]$BaseUrl
      $query=@($url.Query.TrimStart('?').Split('&')|Where-Object{$_ -and $_ -notmatch '^(?:renderer|play|mode|level)(?:=|$)'})
      $url.Query=($query+@("renderer=$backend&play=arena&mode=ward-defense&level=gothic-arena")) -join '&'
      $tab=(& $orcaExe tab create --url $url.Uri.AbsoluteUri --json | Out-String) | ConvertFrom-Json
      if(!$tab.ok){throw ($tab.error|ConvertTo-Json -Compress)}
      $page=$tab.result.browserPageId
      . "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $page -EvidenceDirectory $EvidenceDirectory
      $viewport=if($layout -eq 'landscape'){@('--width','568','--height','320','--mobile')}else{@('--width','1280','--height','720')}
      Cmd (@('viewport','--page',$page)+$viewport) | Out-Null
      Cmd @('wait','--page',$page,'--fn','window.__ROOM_DEMO__?.snapshot().ready || !document.querySelector(`#startup-retry`).hidden','--timeout','90000') | Out-Null
      if(!(Read 'window.__ROOM_DEMO__?.snapshot().ready === true')){throw (Read 'document.querySelector(`#loading`).textContent')}
      Cmd @('click','--page',$page,'--element','#start') | Out-Null
      Key V
      Cmd @('wait','--page',$page,'--fn','window.__ROOM_DEMO__.snapshot().player.mode===`third`') | Out-Null
      Cmd @('exec','--page',$page,'--command','keydown w') | Out-Null
      try {
        Cmd @('wait','--page',$page,'--fn','window.__ROOM_DEMO__.snapshot().player.locomotion===`YBot_Walk`') | Out-Null
      } finally { Cmd @('exec','--page',$page,'--command','keyup w') | Out-Null }
      $state=Read
      $expected=if($layout -eq 'landscape'){'568x320'}else{'1280x720'}
      if(($state.camera.viewport -join 'x') -ne $expected){throw 'Incorrect viewport'}
      $graphics=Read '(()=>{const {backend,adapter,activeMeshes}=window.__ROOM_DEMO__.renderStatus();return {backend,adapter,activeMeshes}})()'
      if($graphics.backend -notlike "$backend*" -or $graphics.activeMeshes -le 0 -or $state.walkDistance -le 0){throw 'Requested renderer or animated movement unavailable'}
      $console=Cmd @('console','--page',$page,'--limit','200')
      $errors=@($console.entries|Where-Object {$_.level -eq 'error' -or $_.text -match 'GPUValidationError|uncaptured error'})
      if($errors.Count -or $console.truncated){throw ($console.entries|ConvertTo-Json -Compress)}
      $image=Cmd @('screenshot','--page',$page)
      Copy-Item -LiteralPath $image.path -Destination (Join-Path $EvidenceDirectory "$backend-$layout.png")
      $report += [ordered]@{layout=$layout;viewport=$state.camera.viewport;graphics=$graphics;assets=$state.loadedAssets;
        mode=$state.player.mode;walkDistance=$state.walkDistance;consoleErrors=$errors.Count}
    } finally {
      if($page){& $orcaExe tab close --page $page --json | Out-Null}
    }
  }
}
$output=Join-Path $EvidenceDirectory 'renderers.json'
$report|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $output -Encoding utf8
Write-Output "PASS $output"
