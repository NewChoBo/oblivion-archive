param([Parameter(Mandatory=$true)][string]$PageId,[string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-24/rpg/responsive")
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
$results=[Collections.Generic.List[object]]::new()
function Click($selector){Cmd @('click','--page',$PageId,'--element',$selector)|Out-Null}
try{
  if(!(Read).paused){Key Escape}
  Click '#inventory-menu';Click '#inventory-growth-view'
  $points=Read 'window.__EXPEDITION__.snapshot().state.points'
  if($points -gt 0){Click '[data-skill=vitality]'}
  Key Tab
  if(Read 'document.getElementById(`inventory`).open'){throw 'Tab failed after skill rerender'}
  Click '#start';Key Tab
  foreach($size in @(@(1280,720),@(844,390),@(568,320),@(768,1024))){
    $args=@('viewport','--page',$PageId,'--width',([string]$size[0]),'--height',([string]$size[1]));if($size[0] -lt 900){$args+='--mobile'};Cmd $args|Out-Null
    $frame = $null
    foreach($mode in @('items','lore','growth')){
      Click ("#inventory-$mode-view")
      $layout = Read @'
(() => {
  const dialog = document.querySelector('#inventory');
  const rect = dialog.getBoundingClientRect();
  const panes = [...dialog.querySelectorAll('.journal-index, #inventory-detail, #inventory-growth')]
    .filter(pane => !pane.hidden)
    .map(pane => ({
      client: pane.clientHeight, scroll: pane.scrollHeight,
      overflow: getComputedStyle(pane).overflowY,
      horizontal: pane.scrollWidth <= pane.clientWidth + 1,
    }));
  return {
    width: innerWidth, height: innerHeight, open: dialog.open, view: dialog.dataset.view,
    rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
    inside: rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth + 0.5 && rect.bottom <= innerHeight + 0.5,
    panes,
    reachable: panes.every(pane => pane.client > 0 && (pane.scroll <= pane.client || pane.overflow === 'auto')),
    horizontal: document.documentElement.scrollWidth <= innerWidth && panes.every(pane => pane.horizontal),
  };
})()
'@
      $results.Add($layout)
      if (!$layout.open -or $layout.view -ne $mode -or !$layout.inside -or !$layout.horizontal -or !$layout.reachable) {
        throw ($layout | ConvertTo-Json -Depth 5)
      }
      if ($null -ne $frame -and ($layout.rect.width -ne $frame.width -or $layout.rect.height -ne $frame.height)) {
        throw "Journal frame changed between sections at $($size -join 'x')"
      }
      $frame = $layout.rect
      if($size[0] -eq 568 -or $size[0] -eq 1280){Capture ($mode+'-'+$size[0]+'x'+$size[1])}
    }
  }
  Key Tab
  Cmd @('viewport','--page',$PageId,'--width','1280','--height','720')|Out-Null
  if((Read).paused){throw 'Bag did not resume after viewport checks'}
  Key Escape
  Write-Output ('PASS '+$results.Count+' inventory tab/viewport checks and post-spend Tab routing')
}finally{$results|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $script:Evidence 'checks.json') -Encoding utf8}
