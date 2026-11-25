# 서재 환경 에셋 · Poly Haven

선정·다운로드: 2026-11-22. 라이선스: **CC0 1.0 Universal**.

- Wooden Bookshelf Worn — Ulan Cabanilla. https://polyhaven.com/a/wooden_bookshelf_worn
- Old Wooden Floor 01 — Charlotte Baglioni (Scanning), Dario Barresi (Processing). https://polyhaven.com/a/old_wooden_floor_01
- 배포처의 이용 조건: https://polyhaven.com/license
- CC0 요약: https://creativecommons.org/publicdomain/zero/1.0/
- CC0 법률 원문: 이 폴더의 `CC0-1.0.txt`.

Poly Haven은 해당 모델·텍스처의 수정, 상업적 사용, 재배포 및 프로젝트 포함 배포를 허용한다. 출처 표기는 의무가 아니지만 추적을 위해 기록한다. 사이트 로고·프로필 이미지·미리보기 렌더는 게임 에셋으로 포함하지 않았다.

`downloads.json`에 공식 파일 URL, 실제 프로젝트 경로, 바이트 수, MD5 및 SHA-256을 기록했다. 원본 glTF·BIN·FBX는 `Art/ThirdParty/PolyHaven/`, 선택한 원본 JPG 3개와 변환 메시·재질은 이 폴더에 있다. glTF는 기하 변환의 입력이며, 원본 glTF가 참조하는 모든 PBR 맵을 함께 받은 패키지는 아니다. 셰이더에 사용하는 텍스처는 이 폴더의 JPG 3개뿐이다.

변형: glTF의 기하를 Unity의 좌표계·UV 원점으로 변환하고 바닥 기준 단위 크기로 정규화한 `WornBookshelf.asset`을 생성했다. 책장에는 512px 가져오기 제한과 무광의 따뜻한 색조를 사용하고, 마루는 1K 색상·512px 약한 노멀을 사용한다. 원본 이미지 바이트는 수정하지 않았다. 금속·거칠기·변위·8K 맵은 사용하지 않는다. 변환 도구는 `Tools/Prepare-LibraryEnvironment.mjs`다.

Unity 씬의 기존 가구 앵커를 사용하며, 서가·바닥 충돌과 상호작용은 기존 오브젝트가 담당한다. 기존 Kenney 가구·책·캐릭터의 출처는 해당 팩의 `License.txt`에 별도로 보존한다. 이 문서는 Poly Haven 파일과 그 파생물에 대한 기록이다.
