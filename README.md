# 망각의 서재 · 사진에서 지워진 사람

[브라우저에서 플레이](https://newchobo.github.io/oblivion-archive/) · [한국어로 플레이](https://newchobo.github.io/oblivion-archive/?lang=ko)

| 엔진 | 여는 위치 | 실행 방법 |
| --- | --- | --- |
| Unreal Engine 5.9 Preview 2 | [unreal/](unreal/README.md) | 챕터 1의 C++ 프로젝트. Windows 에디터에서 개발하고 Wasm 타깃으로 웹 빌드를 만든다. |
| Unity 6000.6 | [unity/](unity) | Unity Hub에서 프로젝트를 열고 Play를 누른다. Web Build Support로 브라우저용 빌드를 만든다. |
| Babylon.js | [babylon/](babylon) | 이 디렉터리에서 `npm ci` 후 `npm run dev`를 실행한다. |

공유 도면은 [shared/levels](shared/levels)에 미터 단위로 저장한다. [public/assets](public/assets)는 게임에서 쓰는 모델·텍스처·오디오, [asset-sources](asset-sources)는 제작 원본과 이용 조건을 담는다. 해당 에셋에 허용된 엔진에서만 가져온다.

### 웹 배포

GitHub Pages는 `main`의 검사를 통과한 Babylon.js 빌드(`babylon/dist/`)를 배포한다. 최초 설정에서 **Settings → Pages → Source → GitHub Actions**를 선택한다. 이후 `main`에 푸시하면 자동으로 갱신되며, 같은 커밋을 다시 배포하려면 **Actions → Code quality → Run workflow**에서 `main`을 선택한다.

Babylon.js는 `babylon/dist/`, Unity는 `unity/Builds/ChapterOne/`을 정적 HTTP 서버에서 제공한다. Unreal 5.9 Preview 2는 WebAssembly와 WebGPU로 브라우저에서 직접 실행하는 실험적 타깃을 제공한다. 이 프로젝트의 웹 빌드와 로컬 서버 실행 방법은 [Unreal 개발 안내](unreal/README.md)에 있다. [Epic 웹 패키징 가이드](https://dev.epicgames.com/documentation/unreal-engine/packaging-your-project-for-webassembly?lang=en-US)

## Unity 개발판

Unity 6000.6.0f1에서 `unity/`를 연다. 처음 열면 챕터 씬을 생성한다. 시작 메뉴에서 서막과 제1장 또는 전투 훈련을 고른다. 제1장에서는 사진과 벽화를 조사하고 세 받침대의 문양을 맞춘 뒤 보관실 원부를 지름길로 가져와 사진을 복원한다. 열람실에서 미라를 만나 채석장에 다녀오거나 남문을 열고 성채의 작업 구역을 탐험할 수 있다.

Web Build Support를 설치한 같은 에디터에서 **Archive → Build Chapter One for Web**을 실행하면 `unity/Builds/ChapterOne/`이 생긴다. 결과 폴더를 HTTP로 제공하고 주소에 `?lang=ko`를 붙이면 한국어로 시작한다. 메뉴의 언어 버튼으로도 바꿀 수 있다.

| 수정할 부분                            | 소스                                                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 서막·벽화·룬·그림자·체크포인트·엔딩    | [Runtime/Story](unity/Assets/Archive/Runtime/Story)                                                                               |
| 이동·시점·키 설정·시전·활 당기기·피격  | [ChapterPlayer.cs](unity/Assets/Archive/Runtime/ChapterPlayer.cs), [Runtime/Player](unity/Assets/Archive/Runtime/Player)          |
| 가방·착용·보관·스킬·미라·채석장·미니맵 | [Runtime/Expedition](unity/Assets/Archive/Runtime/Expedition)                                                                     |
| 전투 모드·AI·장비 상점·승패 조건       | [Runtime/Arena](unity/Assets/Archive/Runtime/Arena), [공유 규칙 원본](babylon/src/content/catalogs/experiences.ts)                        |
| 성채 복원·하역 장치·전망대 조우        | [Runtime/World](unity/Assets/Archive/Runtime/World), [성채 메시 가져오기](unity/Assets/Archive/Editor/CitadelImporter.cs)         |
| 씬 조립·소품과 재질 가져오기           | [Editor](unity/Assets/Archive/Editor), [챕터 배치](shared/levels/chapter-1.json), [프리팹 치수](shared/levels/environment-prefabs.json) |

성채의 도면·재질·하역 동작이나 전투 규칙을 수정하면 `babylon/`의 제작 도구에서 `npm run assets:shared`로 엔진용 데이터를 갱신한다. `npm run assets:shared:check`로 도면과 생성물의 일치를 확인한다. Unity의 **Archive → Rebuild Chapter One**은 저장소에 포함된 데이터와 원본 GLB로 씬·메시·재질을 `unity/Assets/Archive/Generated/`에 만든다.

챕터 대사는 [shared/locales](shared/locales), Unity 조작·탐사·전투 UI 문구는 [unity/Localization](unity/Localization)에서 수정한다. 새 글자가 필요하면 Python fontTools를 설치한 환경에서 저장소 루트의 `python unity/Tools/subset-unity-font.py <NotoSansKR.ttf 경로>`로 HUD 글꼴을 갱신한다. [폰트 이용 조건](unity/Assets/Archive/Art/NotoSansKR-OFL.txt)

## Babylon.js 플레이판

Babylon.js로 만든 탐험 게임으로, 키보드·마우스와 모바일 가로 터치 조작을 지원한다. 열람실의 사진을 조사하고, 무너진 회랑의 벽화와 봉인을 관찰해 보관실로 들어간다. 잉크 그림자를 피하거나 마법으로 묶고, 서명 원부에서 이름을 찾아 지름길로 돌아와 사진을 복원한다.

일반 시작 메뉴에서 제1장을 시작하면 별을 보던 서기관의 독백이 흐른다. 자막을 직접 넘기거나 자동 넘김을 멈출 수 있고, Esc로 열람실에 바로 들어갈 수 있다. 체크포인트에서 이어갈 때는 저장한 장소에서 시작한다.

시작 화면에서 제1장 또는 AI와 겨루는 전투 모드를 고른다. 전투 모드에서 맵을 선택하고 **입장**을 누른다.

- **데스매치·폭탄 설치·인질 구출·섬멸전**은 고딕 투기장에서 진행한다. 권총으로 시작해 출발 지점의 상점에서 소총과 예비탄을 구매할 수 있다. [모드별 승리 조건](docs/DEVELOPMENT.md#총기-전투-모드) · [고딕 투기장 에셋 원본](https://3dassets.dev/assets/arena-shooter-map-kit-two-level-arena-fef9e774-starter-scene)
- **전장 처치전**은 90초 안에 적 6명을 처치한다. 쓰러지면 체력과 탄약을 보급받고 재출전한다.
- **봉인 방어전**은 라운드마다 65초와 한 번의 생명이 주어진다. 서쪽 또는 동쪽 봉인 가까이에서 활성화하고 적이 근처에 없는 시간을 8초 누적하면 라운드에서 이긴다. 먼저 2승을 거두면 전투에서 승리한다.
- **런앤레이드**는 전용 추격 코스에서 플레이어 1명과 봇 3명이 벌이는 2대2 경기다. 마차를 먼저 파괴하면 즉시 승리하고, 3분이 지나면 마차에 더 많은 피해를 준 팀이 이긴다. 감속해 아군의 재출전을 기다리거나, 앞으로 붙어 마차를 자동 공격할 수 있다. [당시 플레이 기록](https://m.hungryapp.co.kr/bbs/bbs_view.php?bcode=review&pid=46682) · [경기 시간과 조작](https://ittong.kr/2638)

  2014년 공개 자료에서 확인한 경기 규칙을 재현했다. 원작 화면의 양 팀 게이지는 각 팀이 같은 마차에 누적한 피해로 해석했다. 정확한 마차 내구도, 기술 계수·재사용 시간, 재출전 시간은 이 버전의 조정값이다. 동률 또는 같은 틱에 두 팀 모두 파괴 기준을 넘으면 무승부로 처리한다. 캐릭터 외형과 코스는 프로젝트 자산을 사용한다. [출시사 설명](https://www.newswire.co.kr/newsRead.php?no=747678) · [기술과 분노 게이지](https://www.hungryapp.co.kr/bbs/bbs_view.php?bcode=review&pid=47238)

전장 처치전과 봉인 방어전은 고딕 투기장과 잉크 채석장 중에서 고를 수 있다. 전투 모드의 탄약과 보상은 해당 경기에서만 쓰인다. 일시정지 또는 결과 화면에서 **메인 화면**으로 돌아간다.

## Babylon.js 실행

코드의 현재 소유 범위와 검증 방법은 개발 가이드에서, 멀티플레이·다국어·Unreal 이식을 위한 변경 순서는 구조 설계에서 확인할 수 있다. [개발 가이드](docs/DEVELOPMENT.md) · [구조 설계](docs/ARCHITECTURE-PLAN.md)

Node.js 22.12 이상을 사용한다. Windows에서 재설치할 때는 해당 디렉터리의 Vite 서버를 먼저 종료한다.

```powershell
cd babylon
npm ci
npm run dev
```

개발 주소: **http://127.0.0.1:5186/**

```powershell
npm test
npm run build
npm run preview
```

빌드 검토 주소: **http://127.0.0.1:4186/**, 출력: `babylon/dist/`. 기존 ROOM_OF_DARK의 4173·4174·4175 및 충돌 비교판 60931과 별개다. 실행에 외부 CDN·계정은 필요 없다.

## 챕터 1 미술

캐릭터 삼면도, 챕터 평면도, 회전 가능한 3D 모델과 게임 캡처는 [챕터 1 미술 자료](http://127.0.0.1:4186/docs/art/chapter-1/index.html)에서 볼 수 있다. [모델·텍스처 다운로드](docs/art/chapter-1/chapter-art-pack.zip)

## 조작

언어는 **설정 → 언어(Language)**에서 바꾼다. 타이틀에서는 바로 적용되고, 플레이 중 고른 언어는 다음 레벨이나 메인 화면을 열 때 적용된다.

모바일 가로에서는 실제 게임 영역이 **480 × 216 CSS 픽셀** 이상이면 플레이할 수 있다. 일반 창의 기준은 **568 × 320 CSS 픽셀**이다. 주소창과 분할 화면은 게임에 쓸 수 있는 높이를 줄인다. 공간이 부족하면 안내에 현재 크기가 표시되고, 플레이 중이었다면 화면을 넓힌 뒤 현재 위치에서 이어갈 수 있다.

휴대폰을 세로로 열면 지원하는 브라우저에서 가로 전환을 시도한다. 전체화면 권한이 필요한 경우 **가로 화면으로 전환**을 누른다. 메뉴와 경기 사이를 이동해도 같은 전체화면을 유지하고, 다른 앱에서 돌아오면 가로 고정을 다시 시도한다. 브라우저가 회전을 허용하지 않으면 전체화면에서 기기를 옆으로 돌려 플레이할 수 있다. 홈 화면에 설치해 실행할 때의 기본 방향도 가로로 지정한다.

- 서재와 전장에서는 왼쪽 패드로 이동하고 오른쪽 화면을 끌어 시점을 돌린다. 왼쪽 패드를 끝까지 앞으로 밀면 달린다. 사용 버튼을 누른 채 끌면 활을 당기면서 조준할 수 있다.
- 런앤레이드에서는 손을 떼면 최고속도로 자동 전진한다. 왼쪽 반달 패드의 윗변을 따라 좌우로 이동하고 아래로 당겨 감속한다. **집중타**나 **지면 강타**를 탭하면 오른쪽 아래에 금색 테두리의 사각 트랙패드가 나타난다. 패드를 다시 터치해 밀면 화면 중앙에서 시작한 조준점이 움직인다. 집중타는 적이나 마차에, 지면 강타는 원하는 지면에 조준한 뒤 그 손가락을 떼면 시전한다. 패드 위의 **조준 취소**로 손가락을 옮겨 떼면 스킬을 소모하지 않는다. [당시 대전 영상의 양손 배치](https://www.youtube.com/watch?v=JWcj5IDepiU&t=85s) · [지면 범위 표시](https://www.youtube.com/watch?v=JWcj5IDepiU&t=275s)

| 입력                          | 동작                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------- |
| WASD / Shift                  | 이동 / 누르는 동안 달리기                                                     |
| Space                         | 점프. 낮은 자세에서는 일어서기                                                |
| C / Z                         | 앉기 / 엎드리기 전환. 같은 키를 다시 누르면 일어서기                          |
| 마우스 / 우클릭 유지 / 좌클릭 | 둘러보기 / 완드 집중 또는 활 조준 / 주문 시전 또는 활 쏘기                    |
| V                             | 1·3인칭 전환. 위치·진행·도구·에너지 유지                                      |
| E                             | 가까이 다가가 화면 중앙의 점으로 바라본 사진·벽화·봉인 받침·문·기록 조사      |
| Tab                           | 가방·장부 열기와 닫기. 이전에 지정한 장부 키도 사용할 수 있다.                |
| 1 / 2 / 3 / R                 | 완드 / 활 / 횃불 선택, 완드 충전 또는 다음 화살 걸기                          |
| Esc                           | 일시정지 메뉴 열기와 닫기. 가방이나 설정을 보고 있을 때는 해당 화면을 닫는다. |

오른손으로 완드를 들고 활시위를 당기는 것이 기본이다. **설정 → 왼손잡이 동작**을 켜면 1·3인칭 모두 왼손으로 바뀐다. 완드는 한 번 클릭하면 짧은 획을 끝까지 긋고, 누르고 있으면 방향을 바꿔 다음 획을 잇는다.

**소지품 장부**를 펼치면 탐험과 잉크 그림자가 멈춘다. 사진 사본, 벽화 탁본, 원부의 필사본은 직접 조사한 뒤 장부에 남으며 체크포인트를 이어도 다시 읽을 수 있다. 사진을 복원하면 장부 속 사본도 바뀐다. 일시정지·엔딩 메뉴에서도 장부를 열 수 있다.

룬 활을 꺼내거나 한 발 쏘면 서기관이 등 뒤의 화살통에서 다음 화살을 꺼내 시위에 건다. 준비되면 마우스 왼쪽 버튼을 눌러 당기고 놓아서 쏜다. 1.1초까지 당길수록 화살이 빠르게 날아가고 같은 거리에서 덜 떨어지며, 잉크 그림자를 더 오래 묶는다. 끝까지 당긴 채로 발사할 순간을 고를 수 있다.

횃불은 장부에서 장착하거나 `3`으로 꺼낸다. 들고 있을 때 좌클릭으로 불을 켜고 끌 수 있다. 불꽃 가까이의 벽과 바닥이 따뜻하게 밝아지고, 광원은 1·3인칭에서 손에 든 횃불을 따라 움직인다.

시위를 당기면 음이 높아지며 화살촉에 금빛 실이 모인다. 손을 떼면 시위가 짧게 울리고, 날아간 화살은 나무에 잠시 꽂힌다. 잔광 완드에서는 청록색 두 획이 뻗어 첫 표면에 봉인이 번진다. [활과 완드의 실제 소리·영상](http://127.0.0.1:4186/docs/art/chapter-1/index.html#spell-feedback)

시작·일시정지 메뉴의 **설정**에서 감도, 이동·달리기·점프 등 키, 잠금 요청 여부를 바꾼다. 키 중복은 거절하며 설정과 체크포인트는 해당 브라우저·주소에 저장한다. 처음부터 다시는 해당 주소의 챕터 진행을 초기화한다. 실패 화면이나 메뉴의 체크포인트 재도전, 새로고침 뒤 시작 메뉴의 이어하기를 사용할 수 있다.

**설정 → 화면과 소리 → 프레임 제한**에서 제한 없음 또는 30~300 FPS를 선택한다. 제한 없음이 기본이며, 실제 프레임 수는 브라우저의 화면 갱신 주기와 기기 성능에 따라 달라진다.

입장·재개 클릭에서 마우스 잠금을 요청한다. Orca가 잠금을 거절하면 **자유 시점 사용**을 선택해 중앙 점으로 조준한다. 캔버스 안에서 마우스를 움직여 둘러보고, 더 돌고 싶으면 마우스를 화면 가장자리 안쪽에 둔다. 안쪽으로 되돌리면 연속 회전이 멈춘다. Esc를 누르면 메뉴 커서로 돌아온다. 이 모드에서 실제 포인터는 게임 영역 밖으로 나갈 수 있다.

## 챕터의 흐름

중앙 기록대 → 북쪽 아치 → 회랑의 벽화 → 세 봉인 받침과 보관실 문 → 서명 원부 → 원본 서고 남쪽 빗장 → 서쪽 연결문 → 열람실 기록대. 낮은 잔해는 점프하거나 옆으로 돌아갈 수 있다. 회랑 봉인선의 불빛 아래는 그림자가 넘지 못하는 피난처다. 마법이 그림자에 닿으면 잠시 묶인다.

첫 메뉴에서 **성곽 도착섬에서 시작**을 누르면 굽은 석교 너머로 대서고가 보인다. 원형 쌍탑 사이를 지나면 천구의 광장이다. 광장 양편으로 제본 공방과 하역장이 열리고, 두 단의 계단 너머로 대서고 본관과 서쪽 열람동, 동쪽 원본 서고가 이어진다. 서쪽 성벽길 끝에는 천문대가 있다. 챕터를 진행하면 작업등과 장서, 하역 권양기, 대서고 별창이 차례로 돌아온다. **제1장 시작**으로 열람실에서 출발해 남문으로 내려가도 같은 성채를 걸을 수 있다. [새 성채 원화와 설계도](docs/art/chapter-1/index.html#fortress)

암흑 속 존재를 시험하려면 전망탑에서 서쪽 성운을 약 1초간 바라본다. 약 10초 동안 먼 하늘을 가로지르는 장면이 펼쳐진다. 장면이 끝난 뒤 전망탑을 나갔다 돌아오면 다시 볼 수 있다.

<details><summary>퍼즐 해답과 귀환 경로</summary>

벽화의 세 위치와 문장을 관찰해 왼쪽 **등불**, 가운데 **깃**, 오른쪽 **물결**로 맞춘다. E로 받침을 하나씩 회전시킨 뒤 문을 조사한다. 초기 상태에서는 왼쪽 한 번, 가운데 두 번이다. 원부의 이름은 **이안**. 원본 서고 남쪽 빗장을 풀고 서쪽 연결문으로 들어가 기록대에 돌아온다.

</details>

## 검증과 출처

- [챕터 구성과 완료 조건](docs/CHAPTER1.md) · [11월 24일 엔딩·채석장 통합 검증](docs/validation/2026-11-24/integrated/README.md) · [11월 22일 이관·조작 검증](docs/CHAPTER1-VALIDATION.md).
- [레벨 제작 원칙과 벽 개구부 작성법](docs/LEVEL-DESIGN.md).
- `tools/chapter-walkthrough.ps1 -PageId <Orca-page-id>`: 일반 시작 메뉴부터 실제 키·클릭 완주. 진행·위치 강제 설정 없음.
- `tools/controls-acceptance.ps1 -PageId <Orca-page-id>`: 조작·설정·충돌과 전신 이동 영상.
- `window.__ROOM_DEMO__`: 검증용 읽기 전용 상태·녹음 스트림. 게임 진행을 변경하는 API는 노출하지 않는다.

3인칭 플레이어, 안내 NPC 미라, 고딕 전장의 파수꾼은 Y Bot 리그를 사용한다. 앉기·포복 클립은 `node --experimental-strip-types tools/bake-humanoid-postures.mjs`로 재생성한다. 미술 갤러리의 남색 후드와 상아색 가면을 쓴 서기관은 KayKit 기반 모델이다. [플레이용 모델과 동작](asset-sources/Art/characters/BABYLON.md) · [갤러리 모델 출처](asset-sources/Art/ThirdParty/KayKit/SOURCES.md)

열람실 마루는 Poly Haven 재질을 사용한다. `npm run assets`는 마루 텍스처, Kenney 음원, 이용 조건을 배포 폴더에 복사한다. 갤러리 서기관과 챕터 가구는 `python tools/model-chapter-art.py`, 완드와 룬 활은 `python tools/model-archive-tools.py`로 재생성한다. [이관 에셋 출처](docs/provenance/original-reports/Oblivion-External-Environment.md)

이관 원본은 `ROOM_OF_DARK/game-scene-assets/web-demo`이며 원본은 수정하지 않았다. [이관 시점 목록·SHA-256](docs/provenance/migration-manifest.json), [수정 전 ZIP](docs/provenance/web-demo-baseline.zip)과 원본 미술 보고서를 보존했다. 기존 Unity 전체는 이식하지 않았다. Saltline의 설계 분석과 자체 충돌 패치는 `docs/provenance/`에 보존하며 그 게임의 코드나 에셋은 복사하지 않았다.
