# 망각의 서재 구조 설계

Babylon 코드와 테스트의 상대 경로는 `babylon/`를 기준으로 읽는다. 세 엔진이 사용하는 미터 단위 도면은 `shared/levels/`에 있다.

## 목표와 순서

- 오프라인 게임을 계속 플레이할 수 있게 하면서, 세션과 플레이어를 분리해 이후 멀티플레이에서도 같은 게임 규칙을 사용한다.
- 한국어와 기존 세이브를 유지한다. 문장, 콘텐츠, 저장 데이터가 독립적으로 바뀔 수 있게 하고 DOM과 월드 표기를 같은 번역 키 체계로 관리한다.
- Unreal이나 다른 엔진에서도 다시 사용할 수 있는 레벨·프리팹·장비·진행 데이터와 동작 기준을 남긴다. Babylon의 씬, 조명, 카메라, 메시, 브라우저 입력과 저장은 대상 플랫폼에서 교체할 수 있게 한다.
- 오래된 데모와 현재 게임이 사용하는 경로를 확인해 잉여 구현을 제거한다. 테스트는 계속 보장할 동작과 제작 데이터 계약을 검증한다.

기준 커밋은 `881bb7e`다. 게임·갤러리 빌드와 테스트 101개를 통과했고, 빌드된 브라우저에서 시작·이동·미니맵·활 발사와 다음 화살 걸기·장부·횃불·568×320 HUD를 확인했다. 이번 설계의 멀티플레이, 현지화, 검증 담당이 서로의 제안을 검토해 세션 권위, 결과 코드와 번역 키의 구분, 플레이 상태 격리와 엔진 이식 기준을 합의했다.

| 단계                     | 작업                                                                                                        | 완료 조건                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 0. 기준점                | 현재 변경 검증 후 한국어 커밋                                                                               | 자동 테스트와 게임·갤러리 빌드, 주요 플레이 경로 확인                                                      |
| 1. 규칙과 정리           | 디렉터리 표준 및 `AGENTS.md` 도입, 테스트 분류, 구형 단일 방 데모·시점 검사 제거                            | 현재 씬 충돌과 이동, 탄 수량 보존, 도면과 자산 검증. 데모 이관본 접근 가능                                 |
| 2. 세션과 저장           | 보관함 장비 이동부터 의도·조회 모델·저장 책임을 분리하고 TypeScript 도입. 연결되는 파일을 기능 단위로 이동  | 타입 검사, 브라우저 없는 두 플레이어의 장비와 가시성 격리, 기존 싱글 입력, 실패 시 무변경, 세이브 왕복     |
| 3. 게임 시간과 월드 질의 | 이동·발사·탄도·피격에서 렌더 시간과 모델을 분리. 배치 및 충돌·광선 질의 경계 정의                           | 같은 조준 의도의 탄 소모·피격 결과가 1·3인칭, 렌더링 속도에 의존하지 않음. 계단·문·개구부 등 기준 씬 통과  |
| 4. 현지화                | 장부·퀘스트·설정부터 영어 원문·한국어 알파 카탈로그와 로캘 해석기 적용. 월드 텍스처·서막·접근성 순서로 추가 | 저장 ID 유지, 누락 키와 인자 감지, 폴백과 가상 로캘 검증. 최소 해상도에서 자막·HUD·명패 확인               |
| 5. 검증 도구와 배포 자산 | 현행 Orca 경로를 격리하고 중복 플로우 통합. 과거 무기·음향 산출물과 갤러리 의존 추적                        | 주요 플로우를 서로 독립적으로 실행하고 증거 덮어쓰기 방지. 현재 배포의 직접·간접 자산 참조와 라이선스 확인 |
| 6. 온라인 기능           | 플레이 정책을 확정한 뒤 같은 세션에 서버·전송 구현을 연결                                                   | 두 클라이언트에서 소유권, 중복 명령, 지연·끊김·재접속, 상태 수렴과 비공개 데이터 검증                      |

2~5단계는 관련 기능을 변경하는 커밋 단위로 진행할 수 있다. 단계별로 기존 시작 경로를 유지하고 의존성 변경을 검증한다.

## 현재 구조 개선의 완료 기준

1. 레벨 하나에 플레이어 바인딩과 명령 라우터를 하나만 둔다. 장비와 레벨별 기능은 같은 세션을 사용한다. 재경기는 같은 바인딩으로 초기 점수와 시간부터 시작한다.
2. 이 경계를 적용한 뒤 챕터의 진행과 상호작용을 분리한다. 규칙은 대상 ID와 권위 측 위치·시야를 사용하며 결과를 코드로 반환한다. 브라우저는 v1 체크포인트와 영구 설정집, 탭 내 이동 기록을 각 수명에 맞게 저장한다. 한국어 표시는 결과를 읽는다.
3. 월드는 적 생존 여부, 궤짝 개봉, 플레이어 체력 등 필요한 값만 조회한다. 타이틀·본편·전장의 실제 진입, 세이브 호환과 재경기 명령을 확인한다.

인간형의 리그·클립·캐릭터 컨트롤러를 비교할 때에는 공식 데모의 Animation Retargeting과 Havok Character Controller를 참고한다. Babylon에서 선택한 리그, 물리 객체와 애니메이션은 플랫폼 계층이 소유한다. [Babylon.js Feature Demos](https://www.babylonjs.com/featureDemos/)

### 계단 보행·애니메이션·눈높이

- **계단 접지.** Godot의 `floor_snap_length`는 내려가는 경사에서 지면을 따라가고 점프로 상승하는 순간에는 풀린다. 성채 계단의 한 단은 약 18cm다. 우리 컨트롤러는 직전에 접지한 상태로 수평 이동했을 때만 최대 20cm 아래의 걸을 수 있는 바닥을 탐색한다. 낙하와 착지는 기존의 짧은 접촉 거리로 판정한다. 이식할 때에는 두 계단의 중간에서 점프할 수 있고, 실제 낭떠러지에서는 떨어지는지 확인한다. [Godot CharacterBody3D](https://docs.godotengine.org/en/stable/classes/class_characterbody3d.html#class-characterbody3d-property-floor-snap-length)
- **발의 타이밍.** Unreal의 Sync Groups는 길이가 다른 클립끼리 보행 주기를 맞추며 공통 마커가 있으면 마커 사이의 진행률도 맞춘다. Unity의 Blend Tree에서도 좌우 발이 닿는 시점을 정규화한 시간에 맞춰 클립을 제작한다. 새 리그는 한 발을 디딘 상태에서 전진·옆걸음·후진으로 전환해 같은 발이 연속해서 두 번 디디거나 순간이동하는지 확인한다. [Unreal Animation Sync Groups](https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-sync-groups-in-unreal-engine) · [Unity Blend Trees](https://docs.unity3d.com/2022.3/Documentation/Manual/class-BlendTree.html)
- **카메라와 키.** Unreal의 1인칭 제작 예제는 충돌 캡슐과 스켈레탈 메시를 따로 두고 머리 위치를 기준으로 카메라 오프셋을 조정한다. 이 프로젝트에서는 배포 리그를 미터 단위로 배치한 뒤, 각 자세에서 발바닥·눈 위치·정수리를 측정한다. 1인칭 카메라는 자세별 눈높이를 사용하고, 3인칭 머리 애니메이션은 독립적으로 재생해 조준 시 보행 흔들림이 전달되지 않게 한다. [Unreal의 1인칭 카메라와 캐릭터 구성](https://dev.epicgames.com/documentation/en-us/unreal-engine/coder-04-adding-a-firstperson-camera-mesh-and-animation)

## 코드와 데이터 소유권

| 경로                                | 책임과 첫 이주 대상                                                                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`                          | 시작·종료, 모듈 조립, 입력과 상태 갱신 연결. `src/bootstrap.ts`에서 진입해 `src/app/startup.ts`와 `src/app/main.ts`에서 타이틀과 레벨을 조립                                                               |
| `src/game/`                         | `session`, `player`, `combat`, `expedition`, `chapter`의 규칙과 상태. `expedition/state.ts`, `game/chapter/chapter-progress.ts`, `weapons.ts`의 규칙을 현재 기능에서 떼어냄                                |
| `src/content/`                      | `levels`, `catalogs`, `locales`에 배치·프리팹·무기 설정·서사 원문. 엔진이나 브라우저 없이 읽을 수 있는 데이터                                                                                              |
| `src/platform/`                     | `babylon`에서 씬·광원·충돌과 연출, `browser`에서 입력·저장·오디오, 온라인 도입 시 전송. `chapter-world.ts`와 `expedition/world.ts`의 씬 조립, `collider-contact.ts`, `spell-effects.ts`의 표시와 엔진 접근 |
| `src/ui/`                           | DOM 메뉴·장부·HUD, 화면별 표시 모델. 상태를 구독하고 입력 의도를 전달                                                                                                                                      |
| `asset-sources/` · `public/assets/` | 제작 원본·출처·라이선스와 배포 선택본. 현재 원본을 직접 가져오는 스카이박스·도면·이미지는 호출 경로 확인 후 이동                                                                                           |
| `tests/` · `tools/` · `docs/`       | 자동 검사 및 공유 fixture, 에셋·빌드 자동화, 설계와 채택한 검증 증거. 아트 갤러리는 별도 빌드 진입점 유지                                                                                                  |

`app`이 나머지 모듈을 조립한다. `game`은 원시 데이터와 주입된 시계·공간 질의를 읽는다. `platform`과 `ui`는 읽기 모델과 이벤트를 소비하며, 서로의 내부를 호출해야 할 때는 `app`에서 필요한 함수를 연결한다. 자산 경로, 장비 규칙과 화면 문구가 함께 들어 있는 `weapon-types.ts`의 경우 시뮬레이션 값, 모델 선택, 표현을 해당 소유자에게 각각 배치한다. 신규 폴더는 첫 파일이 생길 때 만든다. 규칙으로 옮긴 모듈은 Node 환경에서 렌더러·브라우저 없이 불러와 검증한다.

## 런타임 TypeScript 전환

게임 진입점과 `src/`의 모든 런타임 모듈을 strict TypeScript로 전환했다. `npm run typecheck`는 DOM과 Babylon 타입을 제공하지 않는 게임 규칙 프로젝트를 검사한 뒤 전체 클라이언트를 검사한다. 전환은 다음 순서로 진행했다.

1. 브라우저 진입·저장 경계와 엔진 독립 수치 계산을 먼저 전환한다.
2. 전장·장비·입력·HUD와 레벨 제작·렌더링 모듈은 소유하는 상태와 주입받는 인터페이스를 명시한다. 제작 데이터는 실제 배열의 좌표·구간·식별자 계약을 따른다.
3. 기능별 단위·통합 검사, 전체 타입 검사, 게임·갤러리 빌드와 실제 브라우저 진입을 확인한다. 기존 검증에서 문자열로 주입하는 브라우저 스크립트와 노드 제작 도구는 각 실행 환경에 맞게 관리한다.

## TypeScript와 클래스

- 첫 전환 범위는 보관함 이동 명령, 권위 세션, 플레이어별 장비 상태와 저장 입출력이다. `GameSession`이 플레이어의 등록·상태 변경·종료를 소유하고, `WorldQuery`와 `SaveStore` 인터페이스를 통해 필요한 공간 질의와 저장을 받는다. `inventory.move` 명령과 성공·거부 결과는 타입에 명시한다.
- 무기는 `kind`로 구분하는 타입을 사용한다. 활은 화살통과 시위 상태, 완드는 수정과 충전 상태, 횃불은 점화 상태를 표현한다. 상태를 가진 당기기·충전 동작은 기능별 객체로 구성한다. 장비 정의와 세이브에는 원시 데이터와 ID를 담고, 손 자세·음향·광원은 표시 계층에서 연결한다. 이 책임 분리는 Unreal의 `ActorComponent`와 비교해 이식할 수 있다. [TypeScript Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions) · [Unreal Components](https://dev.epicgames.com/documentation/en-us/unreal-engine/components-in-unreal-engine)
- 런타임 모듈은 ESM과 명시적인 `.ts` 상대 경로를 사용한다. `tsc --noEmit`과 Node의 타입 제거 실행을 통해 같은 소스를 검사하고 테스트한다. 파일·세이브·네트워크 메시지는 진입점에서 구조와 버전을 검증한다. [Vite TypeScript](https://vite.dev/guide/features.html#typescript)

## 게임 기능 모듈

`GameFeature`는 기능 ID와 명령 처리기 목록을 정의한다. `GameSession`은 기능을 세션별로 등록하고, 호출자가 연결한 플레이어의 상태를 처리기에 전달한다. 모듈 추가 시 `src/game/<기능>/`에 규칙을 두고 `src/app/`에서 필요한 상태와 조회를 연결한다. 기능 코드가 독립적으로 유지되도록 하는 Unreal Game Features의 책임 분리를 참고했다. [Unreal Game Features and Modular Gameplay](https://dev.epicgames.com/documentation/unreal-engine/game-features-and-modular-gameplay-in-unreal-engine)

`inventory.move`는 장비 ID와 목적지를 받아 소유 상태와 위치를 검증한다. 보관함 위치는 레벨의 `reading-chest-east` 배치에서 읽는다. `inventory.equip`은 장착과 활성 슬롯을 한 번에 저장하고, `inventory.select`는 장부·HUD·단축키에서 사용하는 활성 슬롯을 바꾼다. `progression.spend-skill`은 실제 스킬 ID와 포인트를 확인한다. 기존 탐사 장부 v1로 저장한다.

로컬 조립은 `src/app/local-session.ts`가 맡는다. 장비와 성장, 선택한 레벨의 챕터 또는 전투 명령이 한 플레이어와 한 라우터를 사용한다. 장부는 세션에 등록한 플레이어의 장비·스킬·탄약과 보관함 접근 가능 여부를 조회한다. 무기 화면은 확정된 활성 슬롯을 반영한다. 온라인 접속 인증, 전송 및 재접속 처리는 서버 진입점과 함께 도입한다.

전투 모드는 `src/content/catalogs/experiences.ts`의 모드 ID, 허용 레벨 ID, 규칙 ID를 조합한다. 레벨은 충돌과 스폰·봉인 좌표를, `ExperienceMatch`는 시간·점수·라운드 결과를 소유한다. 로컬 세션의 `experience.activate-ward`는 등록 플레이어의 도달 가능 여부를 확인한 뒤 규칙을 적용한다. 전투의 장비와 탄약은 브라우저 저장소를 연결하지 않은 임시 장부에 보관한다. [Lyra Sample Game](https://dev.epicgames.com/documentation/en-us/unreal-engine/lyra-sample-game-in-unreal-engine)

시작 화면은 게임 씬을 생성하지 않는다. `src/app/play-entry.ts`가 검증한 레벨 진입 정보로 씬을 구성하며, 챕터와 채석장 사이의 전이문도 같은 진입 경로를 사용한다. 이전 페이지가 내려갈 때 Babylon 엔진과 씬을 해제한다. 각 전장은 자신의 원점을 기준으로 좌표를 기록한다. 인간형의 역할과 애니메이션 ID는 `src/content/catalogs/humanoids.ts`에 두고 Babylon 연결부에서 모델과 리그를 조립한다.

| 소스 검토에서 확인한 결합                                                                                         | 반영 순서                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 장부 전체 복제, 장부의 직접 스킬 변경, 무기 화면 갱신 중 선택 재저장                                              | 1차 반영. 개인 장부 조회, 세션 명령, 조회 기반 무기 표현                                                                                                                 |
| 본편 조사와 탐사 보상의 월드 결합                                                                                 | 본편은 `chapter.interact`로 대상 ID를 요청한다. 플레이어의 현재 시야와 도면상의 거리를 확인하고 `ChapterEvent`를 한국어로 표시한다. 탐사 보상·피해 명령 분리가 남아 있다 |
| `chapter-world.ts`의 체력 조회와 `expedition/world.ts`의 보상·적 조회에서 장부 전체 복제. 접촉 피해에서 즉시 저장 | 씬은 체력과 획득 여부를 원시 값으로 조회한다. HUD는 장부 리비전이 바뀌면 표시할 필드만 읽는다. 피해 저장 시점은 기존 체크포인트 복원 기준을 유지한다                     |
| `weapons.ts`의 렌더 시간과 모델 자세가 발사 계산과 연결                                                           | 세션 시간과 권위 공간 질의로 이동한다. 같은 조준과 발사 의도를 다른 FPS와 시점에서 비교한다                                                                              |

## 멀티플레이와 저장

Unreal의 `GameMode` 책임을 권위 세션에, `GameState` 책임을 월드 조회에, `PlayerState` 책임을 플레이어별 런타임 상태에 대응시킨다. `PlayerController`·`Pawn`에 대응하는 입력 소유권과 아바타 상태도 분리한다. 플레이어별 상태에는 필요한 공개 필드와 소유자 전용 필드를 명시한다. 서버가 상태를 확정하는 Unreal의 클라이언트·서버 모델을 기준으로 한다. [Gameplay Framework](https://dev.epicgames.com/documentation/en-us/unreal-engine/gameplay-framework-in-unreal-engine) · [Game Mode and Game State](https://dev.epicgames.com/documentation/en-us/unreal-engine/game-mode-and-game-state-in-unreal-engine) · [Networking Overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/networking-overview-for-unreal-engine)

- `src/ui/inventory.ts`는 개인 조회 모델과 발신 명령으로 연결한다. 세션은 보관함 접근 거리·보유 장비·용량을 확인하고, 결과 코드에 대응하는 문구는 화면에서 고른다. 로컬 실행과 서버에서 같은 명령을 처리한다.
- 세션과 플레이어 ID는 연결에서 확인한다. 명령은 행위, 대상, 제한된 조준 값, 입력 순번을 사용한다. 소모, 장력, 유효 거리, 피격·보상은 권위가 계산한다. 재전송 가능한 명령은 중복 적용을 막고, 연관된 상태 갱신은 같은 리비전으로 표시한다. [Actor Ownership](https://dev.epicgames.com/documentation/en-us/unreal-engine/actor-owner-and-owning-connection-in-unreal-engine) · [Replicated Object Execution Order](https://dev.epicgames.com/documentation/en-us/unreal-engine/replicated-object-execution-order-in-unreal-engine)
- 문과 적, 보여줄 장비·자세는 관련 참가자에게 공개한다. 장부·탄·스킬 등의 세부 데이터는 소유자에게만 전달한다. 참가와 재접속은 현재 조회를 다시 받는다. 화면·소리의 일회 이벤트는 현재 상태와 별도로 관리한다. 인벤토리나 메뉴를 열 때 싱글플레이에서는 현재처럼 정지하고, 온라인에서는 해당 사용자의 입력만 전환한다.
- 현재 `weapons.ts`는 렌더 시간과 카메라·손 모델을 발사에 사용하고, `spell-effects.ts`가 표면 적중을 판정한다. 이를 옮길 때 시뮬레이션 시간과 권위 공간 질의가 발사·공격 결과를 확정하고, 손·카메라·사운드는 결과를 표현한다. Babylon과 이식 후 물리 결과는 비교 가능한 플레이 기준으로 확인한다.
- 경쟁 보상, 퍼즐의 공동·개인 범위, 플레이어 수와 서버 배치는 온라인 규칙을 정할 때 결정한다. 1차 두 플레이어 검증은 명령 소유권, 장비 상태 격리, 보상 중복 적용 방지, 타인의 비공개 상태 차단을 다룬다.

| 기존 저장 키                     | 호환 조건                                                                |
| -------------------------------- | ------------------------------------------------------------------------ |
| `oblivion-archive.chapter1.v1`   | `phase`·`runes`·`clue`를 읽고 이어하기와 마지막 체크포인트 재도전을 보존 |
| `oblivion-archive.codex.v1.<id>` | 설정집 ID별 발견과 새 게임에서의 수집 보존                               |
| `oblivion-archive.expedition.v1` | v1 장부의 장비·탄·보상·생명과 방문 상태. 재도전에서 탄·보상·방어구 보존  |
| `room-of-dark.controls.v1`       | 키의 접미사와 별도로 현재 payload 버전 9. 과거 키 할당과 기기 설정 호환  |

### 런앤레이드의 경기 판정과 동기화

솔로·온라인 방장·참가자의 재생은 같은 [RaidSimulation](../babylon/src/game/raid/raid-simulation.ts)에서 명령을 검증하고 봇 입력과 전투를 순서대로 진행한다. 솔로는 기기의 화면비를 주입하고 온라인 경기는 모든 기기에서 같은 기준 화면비를 사용한다. 현재 2대2 온라인 경기에서는 방장의 브라우저가 경기 시간을 진행한다. `RaidRound.advance`가 참가자 입력을 검증해 적용하고 봇과 전투를 한 틱씩 진행한다. `RaidRoom`은 Photon으로 틱별 승인 입력을 전달하고, 다른 참가자는 `RaidRound.replay`로 같은 경기를 재현한다. [경기 규칙](../babylon/src/game/raid/raid-round.ts) · [Photon 연결](../babylon/src/platform/photon/raid-room.ts) · [브라우저 조립](../babylon/src/app/run-and-raid.ts)

공식 서버를 도입할 때는 경기 시계, 참가자와 조작 슬롯의 연결, 입력 검증과 승패 확정을 서버가 맡는다. 새 전투 규칙은 `src/game/raid/`에서 브라우저와 Photon 없이 실행할 수 있게 작성한다. 어떤 입력과 결과를 어느 틱에 동기화할지는 메시지 계약에 두고, Photon 이벤트 번호와 송수신 처리는 전송 구현에 둔다.

전환 여부는 같은 참가자 구성과 입력 기록으로 검증한다. 브라우저 방장과 화면 없이 실행한 서버에서 같은 틱의 체력·마차 피해·승패가 일치하고, 두 클라이언트에도 그 결과가 반영되어야 한다.

형식은 기존 키를 읽는 변환 계층으로 유지한다. 저장 형식과 네트워크 버전은 별개로 관리하고, 세션 리비전과 소유자 조회 일부를 저장 형식으로 그대로 사용하지 않는다.

## 현지화

- Babylon.js 플레이판은 최초 실행 시 한국어(`ko`)를 표시한다. 영어(`en`)를 원본 카탈로그로 두고 한국어 알파 번역을 제공한다. 지역 태그는 지원 언어로 해석하고, 지원하지 않는 언어와 한국어 미번역 키는 영어로 표시한다. 원본 누락, 중복 키와 인자 불일치는 콘텐츠 검증에서 실패시킨다. 설정은 기기에서 저장하고 `html.lang`과 접근성 표기를 함께 갱신한다.
- 타이틀과 플레이 중 설정 상단에서 `English` 또는 `한국어 (Alpha)`를 선택한다. 타이틀에서는 즉시 적용한다. 플레이 중에는 선택을 저장하고 다음 레벨이나 메인 화면을 열 때 적용해 현재 위치와 경기 상태를 보존한다. 기기별 언어는 `oblivion-archive.language`에 저장하며, 공유 링크의 `lang`은 그 주소에서 우선한다. 설정에서 언어를 바꾸면 현재 주소의 `lang`도 갱신한다. 각 화면을 열 때 문서·접근성 속성과 월드 텍스처에 같은 언어를 사용한다.
- 키는 `chapter.01.codex.folio-first-catalog.title`, `ui.menu.start`처럼 역할과 안정 ID에 붙인다. `quest-progress` 같은 행위 결과는 코드와 수치를 사용하고 문구는 화면·월드 표시 계층이 선택한다. 이름 있는 인자와 문장 단위 패턴을 사용하며 수량·숫자·날짜는 로캘에 맞춰 포맷한다. 고유 사용자 값과 퀘스트의 고정 식별자는 그대로 유지한다. Unreal 가져오기에서는 키를 `FText`와 String Table의 이름공간·키로 매핑한다. [Text Localization](https://dev.epicgames.com/documentation/en-us/unreal-engine/text-localization-in-unreal-engine) · [String Tables](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-string-tables-for-text-in-unreal-engine)
- 장부·본문·에러와 함께 메뉴·로딩·aria/alt·서막 자막·튜토리얼 입력 안내를 수집한다. `chapter-world.ts`와 `expedition/world.ts`의 명패는 실제 글리프를 준비한 뒤 길이를 측정하고 언어·인자 변경 시 바뀐 텍스처만 다시 그린다. 텍스트가 합쳐진 SVG·이미지는 분리하거나 로캘별 에셋으로 관리한다. 가상 로캘에서 568×320 HUD, 긴 줄과 글꼴 대체, 자막 시간, 키보드 탐색을 확인한다. [Asset Localization](https://dev.epicgames.com/documentation/en-us/unreal-engine/asset-localization-in-unreal-engine) · [Managing the Active Culture](https://dev.epicgames.com/documentation/en-us/unreal-engine/managing-the-active-culture-at-runtime)

## 사용자 모딩 지원 계획

첫 목표는 제작자가 **게임을 다시 빌드하지 않고 자신이 만든 전장에서 기존 데스매치 한 판을 끝내는 것**이다. 예시 팩 ‘버려진 천문대’에는 바닥·벽·엄폐물, 플레이어와 봇의 시작 위치, 지도에 쓸 이름을 담는다. 제작자가 파일을 가져와 활성화하면 타이틀의 데스매치 맵 목록에 천문대가 나타난다. 선택한 뒤에만 그 맵의 자산을 준비한다. 아래 내용은 향후 공개할 제작 형식의 초안이다.

| 단계           | 제작자가 할 수 있는 일                                                                                                                                                  | 공개 전 확인할 동작                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 맵 팩       | 공용 프리팹과 기존 경기 규칙으로 전장 하나를 만들고 로컬 ZIP으로 공유한다. 배포물에 예시 팩, 편집할 JSON 스키마, 파일·필드 단위 오류를 알려주는 검증기를 함께 제공한다. | 게임 소스가 없는 환경에서 예시 팩을 수정·설치하고, 시작 화면에서 선택해 스폰·미니맵·봇 이동·라운드 종료까지 확인한다. 잘못된 팩을 가져와도 기존 맵을 시작할 수 있어야 한다. |
| 2. 탐사 콘텐츠 | 기존 동작을 조합해 조명화살 변형, 수집 기록, ‘기록 발견 후 미라에게 보고’ 같은 의뢰를 만든다. 장부와 층별 지도는 팩이 등록한 물건·목표·장소 ID를 읽는다.                | 한 팩의 아이템과 기록이 인벤토리·지도·퀘스트에 연결되고, 이어하기에서 수집·완료 상태가 복원된다. 한국어 알파 번역이 생략된 항목은 팩의 영어 원문을 표시한다.                |
| 3. 게임 규칙   | 검증된 스폰·점수·시간·목표 조건을 조합해 새 경기 방식을 만든다. 사용자 스크립트 실행, 전용 서버 운영, 온라인 배포 채널은 이 단계에서 각각 별도로 검토한다.              | 같은 팩과 입력으로 로컬 세션과 서버가 같은 승패를 판정한다.                                                                                                                 |

**현재 코드에서 먼저 풀 결합.** [전장 카탈로그](../babylon/src/content/catalogs/experiences.ts)의 `LevelId`는 빌드에 포함된 맵 이름으로 정해지고, [게임 진입점](../babylon/src/app/play-entry.ts)과 [경기 조립](../babylon/src/app/experience.ts)은 그 목록에서 맵을 확인한다. 첫 단계에서는 기본 맵 하나를 공개 스키마로 표현하고 외부 팩과 같은 검증·조회 경로로 읽는다. 타이틀, 직접 진입 URL, 월드, 미니맵이 모두 같은 맵 정의를 쓰고 기존 맵 ID와 주소도 계속 해석해야 한다. `GameFeature`의 세션 명령 처리기는 게임이 등록하고 제작자는 팩에서 지원되는 규칙 ID를 참조한다.

**팩 형식과 수명.** 제안하는 `manifest.json`에는 팩 ID·버전, 콘텐츠 형식 버전, 의존 팩과 필요한 버전, 콘텐츠 진입 파일, 제작자·자산 출처와 라이선스를 기록한다. 새 리소스에는 `astralworks.observatory:maps/courtyard`처럼 팩에 귀속된 ASCII ID를 쓴다. JSON·GLB·이미지의 참조는 팩 안의 상대 경로나 공개 콘텐츠 ID로 해석한다. 최초 형식은 선언형 데이터만 읽는다. 등록 전에 필드·참조·의존성·경로·리소스 크기를 검사하고, 중복 ID나 누락된 의존성이 있으면 해당 팩과 원인을 표시한다. 검증을 마친 팩 전체를 타이틀에서 활성화하며 플레이 중에는 세션이 선택한 구성을 고정한다. 엔진 이식 시에는 아래의 미터 좌표와 프리팹 ID를 유지하고 자산을 여는 부분을 교체한다.

**세이브와 멀티플레이.** 기존 세이브는 기본 콘텐츠만 사용하는 것으로 읽는다. 모딩 세이브에는 필요한 팩의 ID·버전·내용 해시와 해당 팩의 진행 상태를 보관한다. 필요한 팩이 빠졌다면 이어하기 전에 복원할 팩을 보여주고 원본 슬롯을 보존한다. 장차 서버가 경기 규칙·맵·충돌에 영향을 주는 팩 목록과 해시를 결정하고 클라이언트는 입장 전에 대조한다. 표시 문구만 바꾸는 번역은 기기별로 선택할 수 있다.

기능을 독립적으로 활성화하는 단위는 Unreal Game Features에서, 팩의 고유 ID·버전·의존성을 명시하는 방식은 Minecraft의 팩 매니페스트에서 참고했다. [Epic Game Features](https://dev.epicgames.com/documentation/en-us/unreal-engine/game-features-and-modular-gameplay-in-unreal-engine) · [Minecraft 팩 매니페스트](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/addonsreference/packmanifest?view=minecraft-bedrock-stable)

## 저장소 경계와 Git 서브모듈

현재는 게임과 제작 도구를 한 저장소에서 관리한다. `src/game`은 별도 TypeScript 설정으로 엔진 없이 검사하며, 기능은 `GameFeature` 단위로 조립한다. 레벨 JSON과 이를 해석하는 코드·테스트는 함께 변경한다. 성채 배치 해석기는 `asset-sources/Art/Chapter1/work-layout.json`을 직접 읽고 씬도 원본 이미지 일부를 가져오므로, 지금 제작 자산 전체를 분리하면 일반 게임 빌드에도 추가 체크아웃이 필요하다.

- **멀티플레이 서버**가 같은 저장소에 생기면 먼저 `src/game`의 규칙과 명령 계약을 공유한다. 서버와 클라이언트에 별도 패키지 진입점이 필요해지면 npm 워크스페이스로 나눌 수 있다.
- **Unity·Unreal 이식 또는 두 번째 게임**이 같은 레벨·프리팹 원본이나 캐릭터 리그를 사용하고, 각 프로젝트가 채택할 버전을 따로 정해야 할 때 해당 자산 묶음을 서브모듈 후보로 삼는다. 포트 간 공유 대상은 콘텐츠 ID, 도면, 원본 자산과 기준 장면이다. 각 엔진의 가져오기 코드는 해당 프로젝트가 소유한다.
- 서브모듈을 도입할 때는 원본 저장소와 라이선스를 기록하고 상위 저장소에서 사용할 커밋을 고정한다. CI와 새 클론에서 서브모듈을 초기화한 뒤 게임 빌드와 해당 콘텐츠 검사를 실행해 같은 버전을 재현할 수 있게 한다. [Git 서브모듈 문서](https://git-scm.com/docs/gitsubmodules)

## 엔진 이식과 제작 자산

- 척도는 미터, 배치 기준은 좌수 좌표의 +X 오른쪽·+Y 위·+Z 앞을 유지한다. Unreal의 +X 앞·+Y 오른쪽·+Z 위와 cm에는 배치 좌표 `(x,y,z) → (z,x,y) × 100`으로 옮긴다. 회전과 모델 원점, 메시의 가져오기 변환은 별도 fixture로 검증한다. 축 변환을 이미 처리한 GLB에는 같은 변환을 다시 적용하지 않는다. [Coordinate System and Spaces](https://dev.epicgames.com/documentation/en-us/unreal-engine/coordinate-system-and-spaces-in-unreal-engine) · [Units of Measurement](https://dev.epicgames.com/documentation/en-us/unreal-engine/units-of-measurement-in-unreal-engine)
- 벽 개구부, 고정·이동 충돌, 바닥과 계단, 상호작용 기준점, 재질 슬롯을 콘텐츠 데이터에서 기술한다. GLB나 이미지의 파일명과 엔진 메시 이름은 저장 ID로 쓰지 않는다. 가져올 때 정면·상단을 확인하고 개구부 통과, 조준, 이동하는 문과 화물 충돌을 확인한다.
- 공유 자산은 카탈로그가 식별한다. 재생성 가능한 형식, 텍스처 크기와 의미, 출처를 기록한다. Unreal로 옮길 때 에셋 종류별 접두사와 용도를 적용한다. [Recommended Asset Naming Conventions](https://dev.epicgames.com/documentation/en-us/unreal-engine/recommended-asset-naming-conventions-in-unreal-engine-projects)

## 테스트 감사 기준

| 종류                | 검증 방법                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `tests/unit`        | 규칙·저장 마이그레이션·입력 계산. 주입된 상태와 시간으로 검증                                         |
| `tests/integration` | Babylon 씬, 충돌, 발사·광원 반응과 연결부. 테스트가 실제 구현 경로를 호출                             |
| `tests/content`     | 개구부, 부품 명세와 접합, GLB 의존 자산과 파일 완전성. `npm run check:level`이 배포 전 필수 항목 실행 |
| 브라우저 E2E        | 현재 `tools`의 실제 입력 시나리오를 사용. 격리 도구를 갖춘 뒤 `tests/e2e`로 이동                      |

- 유지할 수치의 근거는 사용자 요구(±90°·30~300 FPS·568×320), 레벨 명세나 저장 호환 등 추적 가능한 계약에서 찾는다. 튜닝값, 메시 이름, 내부 풀 슬롯, 프레임 수는 사용자 결과나 문서화된 예산으로 확인한다. 장부에서의 한국어 검증은 표현 테스트에 둔다.
- 이번 정리는 단일 방 세션·데이터·전용 검증 제거, 현재 충돌 경로에 대한 양방향 개구부·선반·횃불 확인, 발사와 준비 시 탄 보존, 권양기 회전·착지, 렌더 부하와 회복, 잔류 효과의 소멸과 반복 발사 후 자원 정리를 확인한다. 구형 데모 구현은 이관 보관본에서 확인할 수 있다. [원본 데모 보관본](provenance/web-demo-baseline.zip)
- 다음 감사는 `architectural-surfaces.test.mjs`의 메시 이름 조건, `tools/rpg-*-acceptance.ps1` 공통 진입·대기와 선행 상태에 집중한다. 의미 있는 기대값을 바꿀 때에는 해당 설계 기준과 대체 검증을 기록한다.
- E2E는 깨끗한 저장 공간과 독립 주소 또는 브라우저 컨텍스트에서 시작한다. 입력으로 시작·설정·프롤로그·전투·체크포인트 복구를 확인하고 기능 조건을 기다린다. 캡처 비교는 같은 렌더 설정·카메라·자산 로드 상태에서 기록한다. 온라인 검증은 서버와 두 개의 독립 클라이언트가 같은 상태로 수렴하는지 확인한다. [Automation Test Framework](https://dev.epicgames.com/documentation/en-us/unreal-engine/automation-test-framework-in-unreal-engine) · [Gauntlet](https://dev.epicgames.com/documentation/en-us/unreal-engine/gauntlet-automation-framework-overview-in-unreal-engine)
