# 외부 환경 에셋 적용 · 2026-11-22

이 문서는 **Unity 적용 초안과 초기 정적 검증의 보존 기록**이다. 이후 사용자 요구가 Babylon.js + npm 웹 데모로 변경되어 실제 납품·플레이·총기·화면 검증은 [현재 웹 데모 안내](../../web-demo/README.md)를 따른다. 초기 라이선스 차단은 사용자의 활성화로 해소되었고 새 Editor에서 entitlement 확인까지 진행한 뒤, 실행 대상 변경에 따라 Unity 임포트·빌드 작업을 중단했다.

에셋 파일과 실제 플레이 씬 참조를 연결했다. **Unity 임포트·빌드·화면·플레이 검증은 이 PC의 비활성 Editor 라이선스로 미실시**다. 이 문서는 구현 및 정적 검증 기록이며 시각적 완성이나 런타임 성공을 주장하지 않는다.

현재 작업 브랜치 `NewChoBo/game-scene-assets`는 기본 `main`의 `f3f6dc5`에서 시작했지만, 최신 타이틀·입문·본편 흐름이 `origin/develop`의 `2fae727`에 있어 이 분리 작업공간만 fast-forward했다. 원본 `E:/work/newchobo/github/ROOM_OF_DARK`의 브랜치와 파일은 변경하지 않았다. 엔진은 Unity 6000.6.0f1 / URP 그대로이며, Babylon.js 또는 별도 뷰어를 추가하지 않았다.

## 후보와 선택

| 공식 배포처·후보 | 조건·적합성 | 결정 |
| --- | --- | --- |
| [Poly Haven Wooden Bookshelf Worn](https://polyhaven.com/a/wooden_bookshelf_worn) | CC0, 단순한 두꺼운 프레임과 열린 선반. 6,479정점 / 10,106삼각형. 선택 FBX 314,092B, glTF 2,849B + BIN 267,964B, 1K diffuse 799,126B | 선택. 원본 기하에서 공유 Unity 메시를 만들고 기존 가구 크기에 맞춤 |
| [Poly Haven Old Wooden Floor 01](https://polyhaven.com/a/old_wooden_floor_01) | CC0, 2m 범위의 마루. 선택 1K 색상 606,736B + 노멀 818,192B | 선택. 석재 단색 바닥 및 단색 마루를 목재 표면으로 연결 |
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | 기존 프로젝트에 CC0 라이선스·모델 포함. 기존 간결한 스타일과 가장 가까움 | 책·책상·조명·의자와 다른 가구를 유지. 이번 작업의 신규 수집 대상으로 중복 추가하지 않음 |
| [Quaternius Medieval Village Pack](https://quaternius.com/packs/medievalvillage.html) | 공식 페이지상 CC0, FBX/OBJ/Blend 44종. 중세 건물·야외 소품 중심 | 실내 서재 개선에 비해 범위가 커 다운로드·임포트하지 않음 |

[Poly Haven 라이선스](https://polyhaven.com/license)는 수정·상업 이용·재배포·프로젝트 포함 배포를 허용한다. `Assets/_Oblivion/Art/PolyHaven/CC0-1.0.txt`에 CC0 원문, `SOURCES.md`에 제작자·출처·변형 내역, `downloads.json`에 공식 다운로드 URL과 체크섬을 보존했다.

실사 스캔 느낌이 기존 스타일을 지배하지 않도록 책장 색상 텍스처는 가져오기 512px, 마루 색상은 1024px, 노멀은 512px/강도 0.2, 재질은 무광으로 설정했다. 원본 JPEG는 그대로 보존한다. 이 조합의 실제 미술 적합성은 화면 검토 후 조정해야 한다.

## 실제 적용 위치

| 플레이 씬 | 서가 | 마루 |
| --- | --- | --- |
| `Assets/_Oblivion/Scenes/CompactLibraryHub.unity` | 양쪽 기존 `주변 서가` 6개 앵커에 새 메시 자식 | `연속된 바닥`에 4.5×7회 타일링 재질. 돌 타일 장식 렌더러는 숨김 |
| `Assets/_Oblivion/Scenes/FirstReturn.unity` | 기존 `bookcaseClosedWide` 4개 앵커에 새 메시 자식 | `연속 바닥`에 6×11.5회 타일링 재질. 기존 가로 이음 장식 렌더러는 숨김 |
| `Assets/_Oblivion/Scenes/LastReading.unity` | 기존 `bookcaseClosedWide` 18개 앵커에 새 메시 자식 | `연속 바닥`에 19×37회 타일링 재질. 기존 가로 이음 장식 렌더러는 숨김 |

새 자식 이름은 `PolyHaven Worn Bookshelf`다. 모두 같은 `WornBookshelf.asset`·`WornBookshelf.mat`을 참조한다. 원래 Kenney 서가의 **모델 자식**은 비활성화하고, 기존 부모의 BoxCollider는 유지했다. 장식용 책 묶음을 원본 선반 높이에 맞추고 입문·본편 장식 책의 높이를 85%로 낮춰 선반 사이에 들어가게 했다. 조사 대상이나 퀘스트 물건은 이동하지 않았다.

일반 빌드의 진입 경로는 기존 **TitleScreen → 새 게임 → FirstReturn → 서재 → LastReading**이다. 타이틀 메뉴·입력·퀘스트·저장·돌아가기·맵 구조는 변경하지 않았다. 과거 테스트 씬 `OblivionDemo`, `PortalPuzzle`, 대형 `LibraryHub`는 이번 적용 대상이 아니다.

새 Unity 에셋 폴더는 약 2.7 MiB이며 원본 기하 보관분은 약 0.56 MiB다. 재질의 instancing 옵션을 켰고 메시·재질을 공유하지만 실제 배칭·프레임 성능은 측정하지 않았다. 본편의 서가 18개만으로 약 182k 삼각형이 추가 배치되므로 모바일 성능을 확인해야 한다. 수치는 원본 파일/기하 기준이며 최종 압축 빌드 크기가 아니다.

## 현재 확인한 범위

`node Tools/Verify-LibraryEnvironment.mjs`로 다음을 실제 검사했다. 결과는 `Docs/Validation/2026-11-22/ExternalAssets-source.json`이다.

- 공식 다운로드 6개 파일의 크기·MD5·SHA-256 일치.
- 생성 메시 6,479정점, 10,106삼각형, 모든 인덱스 유효, 유한 좌표·단위 법선, 모든 삼각형의 와인딩과 법선 일치, 퇴화 삼각형 0개.
- 3개 씬에서 새 메시 6/4/18개, 중복 로컬 ID와 신규 누락 로컬 참조 0개, 부모-자식 연결과 원래 충돌 크기 일치.
- `2fae727` 대비 기존 물리·게임 스크립트 컴포넌트 **193개**의 직렬화 내용과 해당 오브젝트/상위 부모 위치·회전·배율 유지. 새 충돌체·게임 스크립트 없음.
- Runtime, Quests, 기존 Resources, ProjectSettings, Packages 변경 없음. 새 재질의 노멀 색공간·텍스처 해상도 제한·mipmap 설정 확인.

Unity를 batch 및 일반 모드로 실제 시작했지만 `Access token is unavailable`, `Found 0 entitlement groups`, `No valid Unity Editor license found. Please activate your license.`로 프로젝트를 열지 못했다. 로그는 `Logs/ExternalAssets/InitialImport.log`, `NormalImport.log`이며 요약은 `Docs/Validation/2026-11-22/ExternalAssets-runtime-blocker.md`에 남겼다. 자동 검증 프로세스만 종료했다.

이 때문에 생성 메시의 **Unity 자체 역직렬화/셰이더 컴파일, 실제 이미지, 선반 앞뒤 방향과 책 접촉, 연속 이동·상호작용, 빌드 및 FPS**는 미확인이다. 스크린샷을 만들지 않았으며 원본 배포처 이미지를 게임 캡처로 대체하지 않았다.

## 활성화 후 재현·검증

1. Unity Hub에서 이 PC의 유효한 Editor 라이선스를 활성화한다. 해당 작업공간을 Unity 6000.6.0f1로 연다.
2. `TitleScreen.unity`에서 Play → 새 게임 확인 → 입문을 실행한다. E 조사, WASD 이동, 마우스 시점, 점프·앉기를 확인한다.
3. 입문을 완료해 작은 서재로 돌아오고 오른쪽 책상 우회 통로, 이야기 조각 획득, 본편 진입·증거 퍼즐·복원·귀환을 확인한다. 서가가 안쪽을 향하고 책이 떠 있거나 선반을 관통하지 않는지 확인한다.
4. Editor를 닫은 뒤 프로젝트 루트에서 다음을 실행한다.

```powershell
node Tools/Verify-LibraryEnvironment.mjs
.\Tools\Validate-LibraryEnvironment.ps1 -BuildPlayers
```

이 도우미는 기존 망각의 서재 EditMode/PlayMode 검사를 실행하며, 새 `ExternalEnvironmentImportTests` 3개가 실제 Mesh·재질·텍스처·씬 종속성과 충돌 앵커 연결을 검사한다. `-BuildPlayers`는 기존 일반 Windows/Web 빌드 경로를 사용한다. 새 빌드 후처리는 기존 Unity 빌드 메뉴에서도 `Licenses/PolyHaven/`에 CC0 원문과 출처를 복사한다.

기존 PlayMode 검사는 서재 이동·문 진입과 입문/본편 상호작용·귀환을 포함한다. 테스트 성공 후 `TestResults/CompactLibrary/`, `TestResults/AuthoredLevels/` 캡처를 확인한다. 일부 캡처는 장면 검토용 카메라 각도이므로, 실제 기본 TPS 화면은 별도 캡처해야 한다. Windows 실행 파일과 Web(`Tools/Start-OblivionWeb.ps1`)에서도 로딩과 조작을 확인한다. 현재 이 단계들은 아직 실행하지 못했다.

원본에서 변환을 재현하려면 **에셋 적용 전 `2fae727` 씬의 별도 작업공간**에서 `node Tools/Prepare-LibraryEnvironment.mjs`를 실행한다. 이미 적용된 씬에서는 중복 적용을 막고 파일 수정 없이 중단한다. 현재 씬에 재실행하거나 다른 작업공간의 씬을 덮어쓸 필요는 없다. 외부 다운로드를 런타임에 요청하지 않으며 원격 게시·push는 하지 않았다.
