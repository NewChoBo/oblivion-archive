# 망각의 서재 · Unreal

Unreal Engine 5.9 Preview 2용 C++ 프로젝트다. 시작 화면에서 Enter로 챕터를 시작하면 열람실의 사진, 회랑 벽화와 봉인 받침 세 개, 보관실 원부, 귀환로 빗장, 사진 복원 엔딩으로 이어진다. WASD로 이동하고 마우스로 바라본 물체를 E로 조사한다. Shift는 달리기, Space는 점프, Esc는 일시 정지다. 저장이 있으면 시작 화면에서 Enter로 이어가거나 N으로 새로 시작할 수 있다.

## 브라우저에서 실행

개발 기준은 Epic Launcher의 **5.9.0 Preview 2**와 Emscripten SDK `6.0.10`이다. 대응하는 공식 소스 태그는 `5.9.0-preview-2`다. 기본 Wasm 엔진은 ICU를 생략하므로 게임이 브라우저에서 전달받은 언어 태그로 한국어·영어 대사 파일을 고른다. 아래 명령에서 `$ue`와 `$emsdk`는 각 도구를 설치한 위치로 지정한다. [Epic 웹 패키징 가이드](https://dev.epicgames.com/documentation/unreal-engine/packaging-your-project-for-webassembly?lang=en-US)

```powershell
$ue = 'D:\Work\UE5\UE_5.9'
$emsdk = Join-Path $env:LOCALAPPDATA 'OblivionArchive/toolchain/emsdk-6.0.10'
$portableSdk = Join-Path $env:LOCALAPPDATA 'OblivionArchive/toolchain/UE_SDKS'
if (Test-Path $portableSdk) { $env:UE_SDKS_ROOT = $portableSdk }
.\unreal\Tools\PackageWeb.ps1 -EngineRoot $ue -EmsdkRoot $emsdk
python "$ue/Engine/Platforms/Wasm/Build/Tools/web/serve.py" --root unreal/Saved/Web/Wasm --bind 127.0.0.1 --port 8800
```

Orca 내장 브라우저에서 `http://127.0.0.1:8800/`을 연다. 한국어를 지정하려면 `?args=-culture%3Dko`를 붙인다. `?compat=1`에서는 브라우저의 WebGPU·메모리 요구 사항을 점검할 수 있다. 위 서버는 Wasm 응답 형식과 공유 메모리에 필요한 교차 출처 격리 헤더를 설정한다.

## Windows 에디터에서 실행

Windows에서 Visual Studio의 C++ 게임 개발 도구와 Windows SDK를 설치한 뒤 Epic Launcher의 라이브러리에서 5.9.0 Preview 2를 설치한다. 소스 빌드를 사용할 경우 `$ue`를 공식 태그의 엔진 루트로 지정한다. 아래 PowerShell 명령은 저장소 루트에서 실행한다. [Epic Preview 2 배포 안내](https://forums.unrealengine.com/t/preview-2-unreal-engine-5-9-preview/2852840)

```powershell
$ue = 'D:\Work\UE5\UE_5.9'
$project = (Resolve-Path unreal/OblivionArchive.uproject).Path
$portableSdk = Join-Path $env:LOCALAPPDATA 'OblivionArchive/toolchain/UE_SDKS'
if (Test-Path $portableSdk) { $env:UE_SDKS_ROOT = $portableSdk }
& "$ue\Engine\Build\BatchFiles\Build.bat" OblivionArchiveEditor Win64 Development "-Project=$project" -WaitMutex
& "$ue\Engine\Binaries\Win64\UnrealEditor.exe" $project
```

에디터에서 **Play**를 누르면 된다. 영어가 출시 원문이고 한국어 카탈로그도 포함한다. 한국어 게임을 직접 실행하려면 에디터 실행 명령에 `/Engine/Maps/Entry -game -culture=ko`를 붙인다. 이 프로젝트는 엔진의 Entry 맵에 자체 GameMode가 공유 도면을 조립한다. 계정에 귀속되는 Fab 원본은 선택 사항이며 로컬 전용 `Content/LocalVendor/`에 둘 수 있다.

## Unreal Assistant와 Codex 연결

에디터 안에서는 **Unreal Assistant** 패널에서 Codex를 선택하면 현재 에디터의 도구를 사용할 수 있다. 터미널에서 작업할 때는 `unreal/`에서 Codex를 시작한다. 이 폴더의 `.codex/config.toml`이 엔진에 동봉된 Unreal MCP 서버에 연결한다. 아래 명령으로 터미널 설정을 확인할 수 있다. [Epic의 Unreal MCP 가이드](https://dev.epicgames.com/documentation/unreal-engine/unreal-mcp-in-unreal-editor)

```powershell
# From the repository root
Set-Location unreal
codex.exe mcp get unreal-mcp
```

게임과 Fab 임시 프로젝트가 함께 열려 있으면 각 에디터가 다른 포트를 쓸 수 있다. 에디터의 MCP 주소와 설정의 포트를 맞추고, 연결 초기 응답의 `projectFile`이 현재 체크아웃의 `unreal/OblivionArchive.uproject`인지 확인한다. 첫 작업으로 “열람실 서가 `SM_Shelf_01`의 LOD 0 삼각형 수와 재질 슬롯을 읽어 줘”라고 요청하면 실제 에셋을 읽는지 확인할 수 있다. 레벨 배치를 바꿀 때는 `shared/levels`의 도면과 이를 조립하는 C++를 수정해야 다음 Play에서도 변경이 유지된다.

## Fab 서가·화물 상자·회랑 벽돌

Meshingun Studio의 [Stylized Village Fatpack](https://www.fab.com/listings/9c5894eb-9f40-4e8b-98be-8471ae620c8b)에서 목제 서가, 운반 상자, 반복 벽돌 재질을 사용한다. 보유한 Unity 형식 패키지와 Python의 Pillow를 준비하고 저장소 루트에서 다음을 실행한다. 두 도구가 별도 임시 Unreal 프로젝트에서 필요한 파일만 가져온다. 원본과 변환한 편집용 에셋은 로컬에 두고 게임에는 쿠킹한 자산을 포함한다. [Fab 이용 조건](https://www.fab.com/eula)

```powershell
$ue = 'D:\Work\UE5\UE_5.9'
$pack = Read-Host 'Stylized Village Fatpack .unitypackage 파일 경로'
python unreal/Tools/ImportFabProps.py $pack $ue
python unreal/Tools/ImportFabMasonry.py $pack $ue
.\unreal\Tools\VerifyChapter.ps1 -EngineRoot $ue -RequireFab
```

| 공간 | 도면과 에셋 |
| --- | --- |
| 열람실·봉인 보관실 | `SM_Shelf_01`을 열람실 서가 여섯 자리에 두 칸씩, 보관실 네 자리에 한 칸씩 둔다. 손질한 목재 선반 세 단의 실제 높이에 기록물을 얹는다. |
| 동쪽 하역장 | `SM_Crate_01` 다섯 개를 `work-layout.json`의 화물 배치에 맞춘다. 바닥과 상자 사이에 틈이 없도록 중심 피벗을 보정하고 도면의 충돌면을 사용한다. 인양기에 매달린 화물에는 원래 애니메이션을 사용한다. |
| 북쪽 아치·회랑·보관실·귀환로 | `T_Tiling_Brick`의 색·노멀·표면 마스크를 기존 벽에 적용한다. 줄눈은 월드 좌표를 따라 이어진다. |

원본이 없는 체크아웃은 같은 도면으로 기본 서가·상자·석벽을 구성한다. `-RequireFab`은 실제 메시·벽 재질이 연결되고 서가가 지정된 바닥에 놓였는지 추가 검사한다.

## 네이티브 검증과 패키징

```powershell
.\unreal\Tools\VerifyChapter.ps1 -EngineRoot $ue
& "$ue\Engine\Build\BatchFiles\Build.bat" OblivionArchive Win64 Development "-Project=$project" -WaitMutex
& "$ue\Engine\Build\BatchFiles\RunUAT.bat" BuildCookRun "-project=$project" -target=OblivionArchive -platform=Win64 -clientconfig=Development -build -cook -stage -pak -unattended -NoP4
.\unreal\Tools\VerifyChapter.ps1 -PackagedExe .\unreal\Saved\StagedBuilds\Windows\OblivionArchive\Binaries\Win64\OblivionArchive.exe
```

검증 스크립트는 별도 임시 사용자 디렉터리에서 NullRHI를 실행한다. `-ArchiveVerify`는 전용 슬롯 `Archive.Automation.Chapter`를 사용하고 끝나면 지운다. 플레이어의 슬롯은 `Archive.ChapterOne.v1`이다. 테스트는 실제 월드와 캐릭터를 띄워 정해진 관찰 지점에서 시선 광선, 문 개폐 전후 충돌, 오답·정답, 재도전과 저장 왕복을 확인한다. 게임패드·키보드 실입력과 렌더링 품질은 이 검사 범위 밖이다.

2026-11-24에 UE 5.7.4(CL 51494982)로 에디터와 Win64 Development 게임을 빌드했다. 에디터와 패키징한 게임에서 각 30개 검사가 모두 통과했고, Windows 쿠커는 경고·오류 0건으로 완료했다. 패키지에서 성채 부품 708개와 재질 14종을 읽고, 다리와 귀환로의 실제 바닥을 각각 세 지점에서 확인했다.

`shared/levels`의 챕터·프리팹·재질 도면과 `shared/locales`의 문구를 사용한다. 원본 도면의 오른쪽·위·앞(m)은 Unreal의 Y·Z·X(cm)로 변환한다. UBT가 사용하는 JSON·이미지·성채 데이터를 `Content/ArchiveData`로 복사하고 UFS 런타임 의존성으로 스테이징한다. 사진 두 장은 `asset-sources/Art/Chapter1/archive-photo-{erased,restored}.webp`에서 파생했다. 아래 명령은 Pillow로 현재의 JPEG 두 장을 재생성한다.

```powershell
python -c "from PIL import Image; from pathlib import Path; [(Image.open(Path('asset-sources/Art/Chapter1') / ('archive-photo-'+n+'.webp')).convert('RGB').save(Path('unreal/Media') / (n+'.jpg'), quality=91, optimize=True)) for n in ('erased','restored')]"
```

현재 네이티브 범위는 1인칭 이동, 관찰 퍼즐, 지름길, 사진 복원, 체크포인트와 성채 외관이다. 잉크 그림자 전투, 3인칭 전신 모션, 무기·인벤토리·채석장·아레나, 삽화 서막과 기존 웹 저장 이행은 후속 이식 대상이다.
