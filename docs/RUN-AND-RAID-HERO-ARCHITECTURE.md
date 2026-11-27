# 런앤레이드 영웅과 스킬 구조

영웅 하나의 공격이나 패시브를 바꿀 때는 해당 영웅의 네 슬롯과 이벤트 처리기를 수정한다. `RaidMatch`는 30Hz 경기 시계와 판정 순서를 소유한다. 솔로와 온라인 라운드는 동일한 영웅 카탈로그와 경기 구현을 사용한다. [경기](../babylon/src/game/raid/raid-match.ts) · [솔로·온라인 조립](../babylon/src/app/run-and-raid.ts)

## 구현 위치와 수명

| 위치 (`babylon/src/` 기준) | 책임 |
| --- | --- |
| `content/raid/heroes/<id>.ts` | 체력·평타 위력·사거리·공격 간격·반경, 해당 영웅의 투사체 프로필과 연계 수치 |
| `game/raid/heroes/hero-id.ts`, `hero-catalog.ts` | 안정 ID와 선택 순서, 열 영웅의 명시적 등록, 슬롯 및 능력치 조회 |
| `game/raid/heroes/hero-definition.ts`, `<id>.ts` | `RaidHeroDefinition`과 영웅별 구현. `defineHero`에 능력치, 이벤트 처리기 생성 함수, 네 슬롯을 전달한다. 경기는 참가자마다 `RaidHeroRuntime`을 만들고 쓰러진 참가자의 구현을 새로 생성한다. |
| `game/raid/skills/skill-rule.ts`, `skill-targeting.ts`, `skill-effects.ts` | 입력 종류별 시전 계약, 미리보기·시전의 공통 판정, 재사용하는 타격·발사·장판·회전 효과 |
| `game/raid/combat/hit-resolution.ts`, `active-fields.ts` | 한 경기의 피해 대기열·처치 기여 기록, 도로에 설치된 장판의 위치와 주기 효과 |
| `game/raid/runner-motion.ts`, `raid-projectiles.ts` | 주자 이동·도약 보간과 발사체 비행·접촉. 거리 단위는 미터, 위치는 마차 기준 X/Z, 전방은 +Z다. |
| `game/raid/raid-view.ts`, `ui/raid-hud.ts` | 현재 틱의 주자·조준·행동 표시 계약과 입력 버튼. `HeroView`로 연계·표식·강화 등 화면에 필요한 상태를 읽는다. |
| `platform/babylon/raid/hero-appearance.ts`, `raid-equipment.ts` | 영웅별 모형 크기·망토·무기·스킬 연출 프로필과 장비 제작 |

상태가 있는 릴딘·카이켄·스위프트는 각자 클래스 인스턴스를 만든다. 예를 들어 릴딘의 연속 베기와 보법 만료 틱은 릴딘 한 명의 생명에 속한다. 렌드의 흡혈처럼 자체 상태가 없는 패시브는 처리 함수를 공유한다. [영웅 계약](../babylon/src/game/raid/heroes/hero-definition.ts) · [릴딘](../babylon/src/game/raid/heroes/rildin.ts) · [렌드](../babylon/src/game/raid/heroes/rend.ts)

## 시전 입력과 판정

버튼은 **즉발 / 조준**으로 표시한다. 승인 명령에는 기존 슬롯 번호 0~3과 입력값을 담는다. 미리보기와 시전은 각각 현재 틱에서 같은 슬롯의 `resolveSkill`을 호출한다. 미리보기는 상태를 읽고, 승인된 시전은 슬롯의 `apply`를 한 번 실행한다. [명령 해석](../babylon/src/game/raid/raid-feature.ts) · [스킬 판정](../babylon/src/game/raid/skills/skill-targeting.ts)

| 슬롯 종류 | 조작 및 적중 시점 |
| --- | --- |
| `pulse` | 즉발 버튼. 릴딘의 전방 베기는 지상 전방 5m(강화 시 6.5m)를 검사한다. 카이켄의 만월은 현재 바라보는 방향으로 돌진하며, 도중에 한 번 더 누르면 그 자리에서 회전한다. |
| `direction` | 오른쪽을 누른 곳에서 조이스틱을 끌고 떼면 그 방향으로 시전한다. 투사체는 발사 당시 방향과 프로필을 유지하며, 비행 중 접촉으로 적중을 결정한다. |
| `field`, `leap` | 사각 트랙패드에서 지점을 정하고 떼면 시전한다. 사거리 안의 마차 너머나 주행로 밖도 선택할 수 있다. 장판은 도로와 함께 뒤로 흐르며, 도약 피해는 착지 시점에 판정한다. |
| `target`, `ward` | 사각 트랙패드에서 적 또는 아군을 지정한다. 시전 시 대상 생존·팀·시야·거리를 검사한다. 기본 공격에는 별도의 전방 각도가 적용된다. |

## 한 틱의 이벤트 순서

1. 사람과 봇이 같은 경기 명령으로 스킬을 사용한다. 슬롯은 타격을 예약하거나 돌진·도약·발사체·장판을 시작한다. 성공한 시전은 해당 영웅의 `onCast`를 호출한다.
2. 경기가 모든 주자의 위치와 타이머를 갱신한다. 해당 주자의 구현이 연계 만료, 착지, 돌진 종료, 평타, 회전 타격에 응답한다. 해머는 착지한 자리에서 충격파를 내고, 스위프트는 돌진이 끝난 틱에 대상이 칼끝에 닿는지 다시 검사한다. [해머](../babylon/src/game/raid/heroes/hammer.ts) · [스위프트](../babylon/src/game/raid/heroes/swift.ts)
3. 마차 반격, 비행 중인 투사체, 장판 주기 효과가 순서대로 타격을 예약한다. 장판은 시전 당시의 도로 위치에서 현재 중심을 계산하고, 해당 틱에 범위 안에 있는 대상을 찾는다. [장판](../babylon/src/game/raid/combat/active-fields.ts)
4. 피해 대기열은 삽입 순서대로 처리한다. 방어자의 `onIncomingHit`가 반격·무적으로 타격을 소모할 수 있다. 통과한 타격은 공격자의 `onOutgoingHit`, 보호막·남은 체력 계산, `onDamageDealt` 순서로 진행한다. 렌드는 실제로 깎은 체력으로 흡혈량을 계산한다. 반격이 예약한 타격은 같은 틱의 대기열 끝에서 처리한다. 적 사망자 한 명당 마차 피해 15% 보너스는 이 대기열을 처리하기 직전의 상태로 정한다. [피해 처리](../babylon/src/game/raid/combat/hit-resolution.ts)
5. 사망자는 연계·채널 상태를 초기화한다. 부활 틱에는 `onRespawn`, 피해 처리가 끝난 뒤에는 `onTickEnd`를 호출해 월광 충전 시점이나 표식 소멸을 반영한다. 마지막에 승패를 판정한다. [카이켄](../babylon/src/game/raid/heroes/kaiken.ts) · [경기 틱](../babylon/src/game/raid/raid-match.ts)

## 영웅 추가와 검증

1. 영웅 ID와 선택 순서를 등록하고 능력치 파일을 만든다. 영웅 구현에는 네 슬롯과 필요한 이벤트 처리기를 선언한다. 카탈로그는 ID 누락과 슬롯 개수를 타입 검사한다. [카탈로그](../babylon/src/game/raid/heroes/hero-catalog.ts) · [슬롯 계약](../babylon/src/game/raid/skills/skill-rule.ts)
2. 기존 입력 유형의 새 스킬은 해당 슬롯에 사거리·범위·피격 조건과 성공 동작을 등록한다. 장판 주기나 발사체 접촉 때의 피해도 해당 슬롯에서 정한다. 한국어·영어 문구와 초상화·모션·FX는 같은 영웅 ID를 사용한다. [공통 스킬 효과](../babylon/src/game/raid/skills/skill-effects.ts) · [연출 프로필](../babylon/src/platform/babylon/raid/hero-appearance.ts)
3. 명령을 통한 발동·거절, 사거리·높이 경계, 사망·부활 뒤 상태, 서로 다른 경기의 상태 격리를 검증한다. 판정 순서를 바꾸면 호스트·참가자 입력 재생도 확인한다. HUD 입력 변경은 실제 버튼에서 조준·해제·재입력까지 확인한다. [영웅 전투 테스트](../babylon/tests/unit/run-and-raid.test.mjs) · [피해 기여 테스트](../babylon/tests/unit/raid-hit-resolution.test.mjs) · [라운드 재생 테스트](../babylon/tests/unit/raid-round.test.mjs) · [브라우저 조작 검사](../babylon/tools/touch-acceptance.py)
