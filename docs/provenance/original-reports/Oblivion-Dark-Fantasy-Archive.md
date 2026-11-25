# 심야의 봉인 서고 — 로컬 적용 및 검증

2026-11-22. 작업공간 `ROOM_OF_DARK/game-scene-assets`, 브랜치 `NewChoBo/game-scene-assets`, 기준 HEAD `2fae727b4c3c925ff2bbb795a2a99c885dcf0143`. 바로 전 작업의 실제 Babylon.js `web-demo`를 수정했다. Unity 장면이나 엔진을 교체하지 않았다. 커밋·푸시·외부 게시를 수행하지 않았다.

## 장면에서 바뀐 것

- 입구와 서가를 청회색 간접광·달빛·안개로 묶고, 천장을 닫았다. 1024 PCF 그림자는 정적 가구에서 생성하며 사진 복원/초기화 때 갱신한다. 서가 6개의 원본 기하·충돌은 유지했다.
- 국소 호박색 스포트라이트와 기록대에만 적용하는 반사광이 사진·원고·금속 인장을 비춘다. 입구 오른쪽 이야기 조각의 불빛은 수집 뒤 꺼진다. 모든 가구를 균일하게 밝히지 않고 중앙 책상이 시선의 목적지가 된다.
- 마루의 원본 색상/노멀 맵을 유지한 PBR 재질, 높은 거칠기의 서가, 무딘 황동, 빛바랜 포도주색 러그로 바꿨다. 노멀 강도와 채도를 낮춰 밝은 주황/빨강을 억제했다.
- 귀환문에 11개 쐐기돌과 석주로 구성한 아치를 세웠다. 책상의 금속 인장, 세 바닥 인장, 다섯 아치 봉인, 문 중앙 봉인이 같은 기하 문양을 공유한다. 문양은 텍스트나 평면 이미지가 아니라 **CSG로 홈을 파낸 메시와 홈 안의 얇은 발광 재질**이다. 새 장식에는 충돌/목표 판정을 추가하지 않았다.
- 사진 복원 후 책상 인장(0초) → 바닥(0.45/0.80/1.15초) → 아치(1.45/1.81/2.17초) → 문 중앙과 냉광(2.65초)으로 깨어난다. 약 3.3초 뒤 정착하며, 문 표면도 마지막 냉광과 함께 밝아진다. 재시작에서 모두 잠든 상태로 돌아온다.
- 단발 도구에는 육각 수정, 연사 도구에는 별도의 거친 황동 음각 배지를 추가했다. 원본 보라/황색을 탈색한 철과 황동으로 조정하고 카메라 공간의 작은 키/가장자리 광원을 적용했다. 충전 때 수정/음각의 빛이 증가하고 준비 상태로 감쇠한다. 발사광·반동·소리·교체·충전 수치와 진행 규칙은 유지했다. HUD에는 작은 어두운 받침을 보강했고 새 문구를 추가하지 않았다.

적용 파일: `web-demo/src/main.js`, `src/weapons.js`, `src/style.css`, 새 `src/arcane-art.js`. 검증 도구 `tools/browser-acceptance.ps1`에는 별도 증거 폴더, 실제 충전 프레임, 고정 시점 복원 순서 캡처를 추가했다.

## 실제 화면

아래는 모두 일반 배포용 `dist`를 `npm run preview`로 실행한 실제 화면이다. 입구 전후는 1280×720, 플레이어 위치 `[0, 0.8483999857, -4.5]`, 눈높이 0.72m, 회전 `[0.06, 0, 0]`, FOV 1.12로 동일하다. 변경 전의 본체 위치 기록과 보존한 소스의 시점 설정, 변경 후 진단 및 PNG 크기를 대조했다. 사진 복원 전후와 7프레임의 시점도 고정했다. 총기 대기 흔들림의 애니메이션 프레임은 서로 다르다.

| 화면 | 프로젝트 내 경로 |
| --- | --- |
| 변경 전 단발/연사 입구 | `Docs/Validation/2026-11-22/DarkStyle/before/arrival-a-fresh.png`, `arrival-j-fresh.png` |
| 변경 후 단발/연사 입구, HUD 포함 | `Docs/Validation/2026-11-22/DarkStyle/after/01-arrival-blaster-a.png`, `03-blaster-j.png` |
| 단발 수정 / 연사 각인 충전 | 같은 `after/02-blaster-a-charge.png`, `04-blaster-j-charge.png` |
| 고정 시점 사진 복원 전/후, HUD 포함 | 같은 `after/05a-desk-before-restoration.png`, `05-photo-restored.png` |
| 복원 연출 7프레임과 실제 시각/봉인 상태 | 같은 `after/05-restoration-0.png`~`05-restoration-6.png`, `restoration-timeline.json` |
| 깨어난 아치와 두 도구 | 같은 `after/07-awakened-arch.png`, `08-awakened-arch-tool-j.png` |
| 재시작 | 같은 `after/09-restarted.png` |

충전·사격·복원 연속 프레임은 실제 게임 캔버스에서 읽었으므로 DOM HUD가 없다. 입구·사진 전후·아치·재시작 스크린샷에는 HUD가 있다. 기존 `Docs/Validation/2026-11-22/Web/` 캡처를 보존했고, 복사한 대표 3개의 SHA-256이 동일함을 확인했다.

대표 PNG 절대경로:

```text
Docs/Validation/2026-11-22/DarkStyle/before/arrival-a-fresh.png
Docs/Validation/2026-11-22/DarkStyle/after/01-arrival-blaster-a.png
Docs/Validation/2026-11-22/DarkStyle/after/03-blaster-j.png
Docs/Validation/2026-11-22/DarkStyle/after/02-blaster-a-charge.png
Docs/Validation/2026-11-22/DarkStyle/after/04-blaster-j-charge.png
Docs/Validation/2026-11-22/DarkStyle/after/05a-desk-before-restoration.png
Docs/Validation/2026-11-22/DarkStyle/after/05-photo-restored.png
Docs/Validation/2026-11-22/DarkStyle/after/07-awakened-arch.png
```

[Saltline 공개 미러](https://realcodebear.github.io/saltline-fable-5.2/)의 DEPLOY 뒤 첫 장면을 직접 열어 시각 참고로 비교했다. 전경 금속의 모서리, 바닥의 방향성, 중경 너머 원경 실루엣을 읽을 수 있는 점을 참고했다. 이 데모에서는 전경 마도구의 키/가장자리 빛, 호박색 기록대, 청회색 아치로 세 깊이를 구분했다. 금속은 국소적으로 반응하고 마루는 거칠고 어둡게 남는다. 기존 서재의 간단한 도형 표현을 유지했으므로 Saltline의 표면 디테일·복잡도를 재현한 것은 아니다. 참고 화면에서 코드·모델·텍스처를 복사하지 않았다.

## 수행한 검증

- 최종 `npm run build` 종료 코드 0. 기존 Babylon 번들의 큰 청크 경고는 남는다. `npm test`는 기존 순서/근접/중복 상호작용 테스트 1/1 통과했다.
- 일반 진입에서 실제 키와 마우스로 두 GLB를 교체하고 8회 발사, 2회 충전, 2회 교체, 효과음 Promise 성공 10회/실패 0회를 확인했다. 각 도구에서 실제 충전 중 4프레임을 읽었으며 수정/각인 충전값의 최대치는 각각 약 0.983/0.979, 대기값은 0.06이었다. 준비 자세·최대 탄약으로 복귀했다.
- 약 18.02m 실제 이동으로 조각 수집 → 사진 복원 → 귀환 기록 3개 완료. 책상 정면 이동은 z≈0.9975에서 막혔고 오른쪽으로 돌아 통과했다. 순간이동이나 진행 상태 설정 함수를 사용하지 않았다. 자동 입력이 과도하게 유지되지 않도록 일반 키/포인터 release 이벤트를 사용했다.
- 복원 7프레임에서 같은 카메라의 봉인 순차 점등과 문광 0→0.72를 확인했다. 최종 봉인 10개가 모두 켜졌다. 렌더 목록은 421개 메시, 그림자 캐스터 375개였다.
- Esc 일시정지에서 W를 750ms 유지해도 위치가 변하지 않았다. 메뉴의 재시작으로 진행 0, 기록 0, 단발 도구/6발, 봉인 0, 문광 비활성, 조각광 활성으로 돌아왔다.
- 저장한 브라우저 콘솔 전체 기록에 error 0, warning 0. 마지막 200개 네트워크 영수증에서 선택한 모델/텍스처는 200, 소리는 206이었다. 네트워크 영수증은 앞부분이 잘렸으므로 모든 과거 요청을 증명하는 자료로 해석하지 않는다.
- 매니페스트의 원본 에셋/라이선스 16개 SHA-256을 소스와 `dist` 양쪽에서 확인했으며 모두 일치했다. 원본 체크아웃 `E:/work/newchobo/github/ROOM_OF_DARK`는 읽기 전용으로 재확인했고 `main`이 깨끗했다.

기계 판독 기록: `Docs/Validation/2026-11-22/DarkStyle/validation.json`, `camera-comparison.json`, `asset-integrity.json`, `gameplay-source-checks.json`, `build.log`, `after/browser-acceptance.json`, `after/pause-restart.json`, `after/console.json`, 도구별 `*-frames.json`/`*-charge-frames.json`.

## 실행과 이용 조건

```powershell
cd web-demo
npm ci
npm run dev
# http://127.0.0.1:5173/ → 서재 들어가기

# 배포 빌드 재현
npm test
npm run build
npm run preview
# http://127.0.0.1:4173/
```

WASD 이동, 마우스 드래그 시점, E 상호작용, 1/2 도구 교체, 좌클릭 발사, R 충전, Esc 멈춤. 입구 오른쪽 조각 → 중앙 책상 사진 → 책상 오른쪽 우회 → 귀환문 순서다. 테스트용 preview 서버는 검증 후 종료했다.

사용 중인 [Poly Haven 서가](https://polyhaven.com/a/wooden_bookshelf_worn)·[마루](https://polyhaven.com/a/old_wooden_floor_01), [Kenney Blaster Kit](https://kenney.nl/assets/blaster-kit)·[Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds)의 CC0 원본과 출처/조건은 `Art/ThirdParty/` 및 `web-demo/public/assets/licenses/`에 보존하며 빌드에도 들어간다. Babylon의 Apache 2.0도 유지했다. 이번 추가 아치·문양·수정은 프로젝트 코드로 생성한 기하이며 추가 외부 에셋/런타임 다운로드가 없다. 후보 비교와 기존 에셋 수급 내역은 [외부 에셋 보고서](Oblivion-External-Environment.md)를 참조한다.

실제 GLB 두 개의 원본 애니메이션 클립은 0개이며 기존 절차적 뷰모델 동작을 유지했다. 장면은 저폴리곤 데스크톱 데모다. 휴대폰/게임패드, 대표 기기 FPS·발열, 장기 메모리, 연속 수동 완주는 이번 검증 범위 밖이다. 도킹/배경 브라우저 FPS가 크게 변해 성능 보장값으로 사용하지 않았다. 로컬 빌드는 약 10 MiB이며 번들 추가 최적화는 남아 있다.
