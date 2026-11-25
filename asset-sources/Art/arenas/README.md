# 고딕 투기장

3D Assets의 *Two-level gothic industrial arena* 원본을 `public/assets/arenas/gothic-arena.glb`로 배포한다. 제작자는 CC0 1.0으로 사용·수정·재배포를 허용한다. [원본 에셋](https://3dassets.dev/assets/arena-shooter-map-kit-two-level-arena-fef9e774-starter-scene) · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

- 원본 파일은 [GLB v1](https://cdn.3dassets.dev/assets/23158/v1/model.glb)이다. SHA-256은 `4972ca27baeae72020136b606b5c13f4bc900c25b20c1394466517d9d45e9f15`다.
- 배포 GLB는 원본과 바이트가 같다. `src/content/catalogs/experiences.ts`에서 X·Z 배율을 1.5로 적용하고 하층 충돌, 엄폐물, 스폰 및 봉인 위치를 정의한다. 미니맵은 같은 충돌 배치를 읽는다.
- 상층 통로는 배경으로 남기고 원본의 무기·보급품·이동 패드는 런타임에서 숨긴다. 하층에서 게임의 기존 완드와 활을 사용한다.
