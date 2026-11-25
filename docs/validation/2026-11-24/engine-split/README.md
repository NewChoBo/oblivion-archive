# 엔진 디렉터리 분리 후 웹 빌드 확인

분리 커밋 `76160d3`의 추적 파일만 새 디렉터리에 풀고 `babylon/`에서 `npm ci`, `npm run assets:shared:check`, `npm run build`를 실행했다. 게임과 갤러리가 생성됐고, 공유 도면과 성채 메시 708개·충돌면 478개·전투 모드 6개의 데이터가 일치했다. 개발 저장소에서도 `npm run check`와 테스트 161개를 통과했다.

| 빌드 | Orca 내장 브라우저에서 확인한 경로 | 증거 |
| --- | --- | --- |
| Babylon.js | 일반 메뉴 → 제1장 시작 → 입장 → 서막 건너뛰기 → 열람실. 사진 조사 목표가 표시된 상태에서 W 입력으로 2.287m 전진했다. | [열람실](babylon-reading-room.png) · [입력 전후 위치와 배포 파일 해시](babylon-movement.json) |
| Unity 6000.6.0f1 | 공용 파일 위치에서 씬을 다시 빌드하고, 한국어 시작 화면에서 이어하기로 들어가 가방을 열었다. | [가방 화면](unity-inventory-ko.png) |

이때 사용한 Unity Web 빌드의 `ChapterOne.wasm` SHA-256은 `4b33de0f2a7f545f6117aa32222753fc33f73cc1e57c79fdcdc5f25b0aaf0d75`다. 이전 Unity 빌드의 실제 엔딩·전투·원정 검증은 [당시 기록](../unity-parity/)에 있다.
