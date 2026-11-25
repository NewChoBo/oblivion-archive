# Ante Apocalypse 인간형

배포 파일 `public/assets/characters/dummy3.babylon`은 Ante Apocalypse의 적과 원격 플레이어에 쓰인 Y Bot 원본이다. Babylon 공식 배포본과 SHA-256이 같다. 원본 바이트와 모델 안의 클립 범위를 유지한다. [Ante Apocalypse 에셋 등록](https://github.com/NewChoBo/ante_apocalypse/blob/cdbc52412a759615083d2bd9a23a3d14146a84ad/apps/client/src/core/GameAssets.ts#L61) · [원본 모델](https://github.com/NewChoBo/ante_apocalypse/blob/cdbc52412a759615083d2bd9a23a3d14146a84ad/packages/assets/assets/models/dummy3.babylon) · [Babylon 원본](https://github.com/BabylonJS/Assets/blob/6946e9be89e0d471d5caba0d2338b4c1ada250d0/meshes/dummy3.babylon)

- SHA-256 `cb2d22ec87f7498cb1b221cfa0b21406b351fc230fef3df8a6e991b5257bc0bf`
- 클립은 대기, 전진, 달리기, 좌우 평행이동 다섯 가지다. 후진에서는 걷기 클립을 역재생한다.
- 게임에서 추가로 불러오는 `public/assets/characters/ybot-postures.glb`는 이 리그용으로 제작한 앉기·포복 동작 파일이다. Y Bot의 관절 이름과 중립 자세를 기준으로 골반 높이, 접지 위치, 보폭을 작성했다. `babylon/`에서 `node --experimental-strip-types tools/bake-humanoid-postures.mjs`로 동작을 다시 생성할 수 있다. [상태와 클립 연결](../../../docs/SCRIBE-LOCOMOTION.md)
- 3인칭 플레이어, 안내 NPC 미라, 고딕 전장 파수꾼은 씬마다 한 번 내려받은 원본의 메시를 공유하고 독립된 스켈레톤을 사용한다. 몸통의 색과 플레이어 손 자세는 런타임에서 조정한다. [배포 저작자 표시](../../../public/assets/characters/ATTRIBUTION.md)
