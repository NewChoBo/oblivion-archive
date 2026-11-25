param([Parameter(Mandatory=$true)][string]$PageId,[string]$EvidenceDirectory="$PSScriptRoot/../../docs/validation/2026-11-24/rpg/final-impact-routing")
. "$PSScriptRoot/chapter-play-helpers.ps1" -PageId $PageId -EvidenceDirectory $EvidenceDirectory
$origin=@(0,0,0);$visited=[Collections.Generic.List[object]]::new()
Cmd @('goto','--page',$PageId,'--url',(Read '(()=>{const url=new URL(location.href);for(const key of [`play`,`mode`,`level`])url.searchParams.delete(key);return url.href})()'))|Out-Null
Cmd @('wait','--page',$PageId,'--selector','#start:not([disabled])','--timeout','60000')|Out-Null
Cmd @('click','--page',$PageId,'--element','#continue-save')|Out-Null
Enter-LoadedLevel
if((Read).phase -ne 5){throw 'Completed chapter save did not continue'}
Go -4.4 -1.1
Look -Point @(-4.5,1.1,.5) -TargetId 'enter-quarry';Key E
Enter-LoadedLevel
if((Read 'window.__EXPEDITION__.snapshot().state.area') -ne 'dungeon'){throw 'Portal entry failed'}
if($null -ne (Read).world){throw 'The chapter scene was loaded behind the quarry'}
Key 1;Cmd @('mouse','move','--page',$PageId,'--x','640','--y','360')|Out-Null
Look -Point @(-3,1.05,1.8)
if((Read).input.outside){Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null;Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}
Cmd @('mouse','down','--page',$PageId,'--button','left')|Out-Null
try{$killed=Read 'new Promise(resolve=>{const end=performance.now()+12000;function sample(){if(window.__EXPEDITION__.snapshot().state.enemies[0].health===0)resolve(true);else if(performance.now()>end)resolve(false);else requestAnimationFrame(sample)}sample()})'}finally{Cmd @('mouse','up','--page',$PageId,'--button','left')|Out-Null}
if(!$killed){throw 'Quarry enemy was not killed by native fire'}
if($null -ne (Read).world){throw 'The chapter world reappeared during combat'}
Capture '11-impact-routing'
$receipt=@{pass=$true;url=(Read 'location.href');bundle=(Read '[...document.scripts].map(s=>s.src).filter(Boolean)');resources=(Read 'performance.getEntriesByType(`resource`).map(r=>r.name).filter(name=>/\/main-.*\.js/.test(name))');chapterIsolated=$true;state=(Read);expedition=(Read 'window.__EXPEDITION__.snapshot()')}
$receipt|ConvertTo-Json -Depth 22|Set-Content -LiteralPath (Join-Path $script:Evidence 'receipt.json') -Encoding utf8
Write-Output 'PASS final production continue, portal, native kill and isolated impact routing'
