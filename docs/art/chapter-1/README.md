# 사진에서 지워진 사람 · 미술 시트

## 서기관

뒤에서 플레이할 때 짧은 남색 망토의 황동 깃과 두 줄의 금사 테두리로 서기관을 알아볼 수 있다. 붉은 가죽 장부는 왼쪽 허리 뒤에 매달고, 양팔은 활시위와 완드 동작에 쓸 수 있게 비운다. 상아색 가면과 좁은 눈구멍은 후드 안쪽의 어둠에서 드러난다. [초기 콘셉트 시트](scribe-concept.webp)

## 충전 동작

오버워치의 1인칭 애니메이터 매슈 뵘은 짧은 재장전 시간 안에서 영웅의 성격을 표현하는 문제를 다뤘다. 라이프위버의 치유의 꽃 영상에서는 손바닥이 펴지면서 꽃이 자라고 손이 풀릴 때 빛이 떨어져 나간다. 서기관에게는 책을 복원하는 사람의 손짓을 주고, 손이 에너지를 받아 도구에 옮기는 순간이 보이도록 했다. [개발자 발표](https://gdcvault.com/play/1024319/Animation-Bootcamp-The-First-Person) · [블리자드의 치유의 꽃 시연](https://blz-contentstack-assets.akamaized.net/v3/assets/blt2477dcaf4ebd440c/blt4b8a04ec51744c85/64234d662d91476d41e46570/Lifeweaver-Ability_Heal_1P_V2.webm)

잔광 완드는 수정을 내보이고 빈손으로 청록색 인장을 닫는다. 여명 룬 활은 시위를 놓고 손에 금빛 깃을 모아 화살받이에 얹는다. 각각 0.95초와 1.35초에 도구가 빛나고 완료음이 울리면 에너지가 찬다. [두 시점의 충전 영상](index.html#recharge)

## 맵

열람실의 사진 액자와 기록대, 회랑의 벽화와 세 돌받침, 보관실의 서명 원부를 각 방의 중심에 둔다. 돌아오는 동쪽 통로는 열람실 옆문에 닿는다. 평면도는 현재 게임의 바닥 치수와 상호작용 위치를 기준으로 그렸다. [공간 설계 시트](floor-plan.webp)

사진이 놓인 기록대에는 호두나무 몰딩과 적갈색 가죽 패널, 마름모 잠금판을 쓴다. 회랑의 청회색 석재와 황동 봉인문 뒤에서 따뜻한 빛이 비치는 원부와 해 모양 인장이 드러난다. [열람실·회랑·보관실 컨셉아트](archive-concept.webp)

## 모델과 텍스처

[미술 자료와 3D 뷰어](index.html) · [모델·텍스처 ZIP](chapter-art-pack.zip) · [챕터 전체 맵 GLB](chapter-map.glb)

ZIP의 `skybox/`에 심우주 큐브맵 여섯 면, 4096×2048 파노라마, 면 방향표가 있다.

서기관은 KayKit Adventurers의 팔다리와 리그를 사용한다. 현재 모델은 뾰족한 남색 후드 안에 좁은 눈구멍과 낡은 황동 장식이 있는 상아색 가면을 쓴다. 가면은 머리 관절을 따라 움직인다. 아래 시트와 얼굴 원판은 초기 콘셉트 자료다. 원본 리그의 동작 중 게임이 쓰는 클립은 런타임에서 선택한다. [KayKit 원본과 라이선스](../../../asset-sources/Art/ThirdParty/KayKit/SOURCES.md)

열람실 기록대·서가, 회랑 기둥·잔해·봉인 받침·봉인문, 보관실 원부 기록대를 개별 GLB로 제공한다. 전체 맵은 게임 시작 시점의 3D 장면을 미터 단위로 내보낸 파일이다. 두 봉인문과 지름길이 닫힌 상태이며 사진과 벽화·퍼즐 표지의 텍스처를 포함한다. 게임에서는 진행 상황에 따라 문과 표지가 변한다. 마루의 원본은 Poly Haven이다. [마루 출처와 이용 조건](../../../asset-sources/Assets/_Oblivion/Art/PolyHaven/SOURCES.md)

내장 ImageGen으로 그린 직물·가죽·나무·석재 원판을 UV 텍스처로 분리했다. 리넨과 러그는 직물의 올을 바탕으로 염색하고 러그 테두리 무늬를 더했다. 초기 모델에는 시트 속 서기관을 바탕으로 그린 얼굴 원판을 사용했다. 개별 GLB를 다른 도구에서 열 때에는 ZIP 안의 JPG와 노멀 맵 PNG를 GLB와 같은 폴더에 둔다. 전체 맵의 텍스처는 GLB에 내장되어 있다.

모델과 텍스처는 Python과 Pillow가 설치된 환경에서 `python tools/model-chapter-art.py`로 재생성할 수 있다. 전체 맵 내보내기는 Vite의 게임 시작 메뉴에서 `tools/export-chapter-map.js`의 `exportChapterMap()`이 반환하는 GLB Blob을 사용한다.

게임은 등불과 창의 색이 들어간 실내 반사광과 성운 쪽을 향한 차가운 성곽 반사광을 별도로 사용한다. 기록대의 밀랍 촛불은 사진과 원고를 비추고, 가구 밑 접촉 음영은 열람실 마루의 오클루전 맵에 담는다. 황동의 광택, 무광 석재, 젖은 회랑 바닥은 각 재질의 거칠기로 조절한다. Pillow와 NumPy가 설치된 환경에서 `python tools/build-chapter-lighting.py`를 실행하면 노멀 맵과 Babylon.js용 `.env`를 다시 굽는다. 다른 엔진에서는 GLB의 재질 값을 사용하고 구역별 반사광은 해당 엔진의 프로브로 설정한다.

## 게임에서 확인한 결과

Orca 내장 브라우저에서 시작 메뉴로 들어가 세 봉인 받침을 맞추고, 체크포인트에서 재도전한 뒤 원부의 이름을 지름길로 가져와 사진을 복원했다. 배포 빌드의 미술 자료에서도 서기관, 환경 모델 일곱 개, 전체 맵을 각각 열어 확인했다. [플레이 캡처](index.html#ingame) · [빌드 해시와 엔딩 상태](validation.json)

## 괴물

내장 ImageGen으로 회랑의 잉크 그림자와 전망탑 바깥에서 마주치는 존재의 콘셉트 시트를 만들었다. 두 GLB는 시트의 형태를 바탕으로 곡면, 덧대는 갑각, 관절을 만들어 제작했다. 잉크 그림자의 가면과 팔은 회랑에서 활이나 완드에 적중한다. 우주 존재의 날개와 촉수는 하늘을 건너는 동안 따로 움직인다.

[잉크 그림자 콘셉트](ink-apparition-concept.webp) · [우주 존재 콘셉트](outer-leviathan-concept.webp) · [두 모델 미리보기](index.html#models)

두 모델은 `python tools/model-chapter-creatures.py`로 다시 생성한다. 잉크 그림자 GLB에는 부유·추격·공격 준비·회수·경직 클립이, 우주 존재 GLB에는 지느러미와 여덟 촉수의 유영 클립이 들어 있다. 갤러리에서 모델과 동작을 골라 볼 수 있다. 게임은 실제 이동량과 공격 진행률에 맞춰 같은 클립을 재생한다. 다른 엔진에서도 이동은 캐릭터 컨트롤러가 맡고, 타격 시점에 `Windup`의 마지막 포즈에서 `Recover`로 이어 붙인다.

### 잉크 그림자 생성 프롬프트

Use case: stylized-concept. Full-bleed 3D monster production concept for an original ink apparition in a gothic archive castle. Create ONE creature, a lanky fountain of living coal-black archival ink bearing a split chalk-colored funerary mask. The creature has no lower legs: its tall ragged lower torso tapers to a hovering, uneven throat of spilled ink, with a few heavy melted tassels. Give it dramatically humped shoulders resembling overlapping torn book boards, an evocative smooth spine, and two asymmetrical arms with rich claw-like tapering ink fingers. One hand hangs close to the floor, the other is folded close to the ribcage. A bone-white broken mask is the small eerie focal point, with fine cold-cyan light leaking from its broken eye sockets and a split seam, leaving most of the body rich in charcoal-black and blue-black. Art-directed line and sculptural form, wet ridged ink surfaces, cracked parchment edges, layered and plausible 3D volumes, silhouette legible in warm torchlight. Front three-quarter full-body hero view on the left; matching full-body side silhouette and rear three-quarter on the right with space between views, arranged as a continuous muted charcoal studio backdrop. Showing the full silhouette clearly helps a modeller. Restrained warm key and cool grazing rim. Keep the body thin enough for a narrow stone corridor. No generic human face, no weapons, blood, writing, labels, logo or typography. A serious original dark fantasy creature for a stylized ink-rendered game.

### 우주 존재 생성 프롬프트

Use case: stylized-concept. Real 3D sculpting design sheet for an original cosmic deep-space leviathan. A colossal eyeless creature glimpsed as it occludes a distant nebula over a medieval castle. The overall form is a long horizontal asymmetric ebon body, like a split elongated manta with a deeply curved dorsal ridge, dark overlapping ridged carapace and pronounced tapered lateral fins. Its massive front descends to a recessed ribbed underside, with several long irregular trailing sensory tendrils and two thick jointed filaments, some nearer and some farther from the viewer. Its outline should look ancient and organic, recognizable by its huge silhouette. Restrained pale slate highlights reveal dense layers of charcoal obsidian, subtle pearl blue and faint mineral lines; most of the body is dark. No forward eyes, teeth, windows, hull panels, guns, blood, gore or glowing logos. Show the same one creature from side, top and front three-quarter views, full visible silhouette in each, arranged in distinct zones with generous negative space. Muted black-blue studio environment with gentle off-axis rim and soft ambient light for a readable sculpture reference. The central hero angle looks slightly upwards from under it. No text, labels, numerals, watermark, frames, planets, foreground, buildings, or rendered sky overlay. This is a polished game creature design sheet, with the depth and form of a physically sculpted original creature.

## 내장 ImageGen 제작 프롬프트

### 얼굴 텍스처

Produce a purpose-built square game character face albedo projection based on the SAME adult scribe in the supplied painted character sheet. Single straight-on orthographic face, eyes open looking directly forward, calm inquisitive expression, warm olive brown skin and dark brown eyes, strong brows, a little dark wavy hair across temples. Tight symmetrical square crop: hairline touches the top edge, cheeks nearly touch the left and right edges and chin touches the bottom edge; face fills the canvas. Nose center at x50%, eyes at y40%, mouth at y70%. Ears and hood outside frame. Broad restrained painterly cel values, handsome hand-inked eyes and brows, quiet shadow under the nose, no perspective, no dramatic directional shadows, flat diffuse lighting. Straight print equivalent for projecting onto a purpose-modeled face mesh, opaque, muted natural colors, fill corners with dark hair. No sheet, no border, labels, letters or additional features.

### 서기관 시트

Stylized-concept. Create a high-end videogame character concept and construction sheet on warm vellum, wide landscape, full bleed. Original dark-fantasy archive explorer, the player character, a compact adult wandering scribe, about four heads tall, a distinctive deep petrol-blue peaked hood framing a readable shadowed human face, short split indigo shoulder mantle with dull gold double piping and a single prominent stylized brass quill insignia between the shoulder blades, smoked teal cuffs, russet boots and gloves, a diagonally strapped worn oxblood red leather field ledger at the back-left hip, thick ivory page edges, brass corner protectors and a single brass diamond closure. Leave forearms and legs free for running and drawing a bow. Left half is one large, painterly, intimate three-quarter rear character key illustration in a pool of amber lamplight, the scribe raising a luminous quill wand in the right hand, expressive ink outlines and three deliberately designed cel-shadow masses. Right half is a strictly legible aligned front, side and back full-body orthographic turnaround of the SAME costume in neutral stance, with two bottom detail insets of the feather and bound ledger. Confident gouache, matte brushwork, ink woodcut hatching, subdued petrol/midnight/oxblood/antique gold, polished art direction. Differentiate the indigo cloak from the leather accessory. Professional model reference. No typography, words, labels, numbers, arrows, watermarks, modern tech, extra weapons or masks.

### 환경 컨셉

Stylized-concept. A wide landscape painted production keyframe sheet for an original cozy but uncanny dark fantasy exploratory game inside a forgotten archive. Left two thirds: eye-level interior of a small rectangular timber reading room with two rows of old bookshelves, framed sepia photograph and amber desk light on a CENTRAL dark walnut archivist's counter; bookbinder-furniture design, recessed oxblood panels, muted antique-brass diamond lockplate, brass corner details, moulded wood rails and a scalloped plinth. Beyond the desk a single carved north stone arch. Strong composition, readable restrained cel-shadows and hand-inked forms, dusty blue-green stone, blackened timber, oxblood carpet, buttery warm gold light on the photo, melancholy stillness. Right upper panel: a narrow collapsed north corridor, native blue-grey slate masonry, low broken blocks, three small rune plinths, a brass-trimmed sealed door. Right lower panel: small sealed records vault, dark shelves, warm illuminated ledger lectern, bronze sunburst seal medallion on dark red panel, an east-side shortcut. Thin vellum gutters, illustrations fill the canvas, stylized dramatic gouache and woodcut texture, coherent set in all three scenes. Rooms at modest human scale, dark value shapes but readable midtones and material construction. No words, labels, arrows, writing, typography, logos, modern items, gothic cathedral-scale space or figures. This is a practical environment concept for making the 3D game assets.

### 텍스처 원판 제작 사양

남색 직물, 적갈색 제본 가죽, 호두나무, 청회색 석재를 한 장의 2×2 재질 시트에 담았다. 각 칸은 이음매에 거울 반복을 적용할 수 있게 같은 배율로 잘라 사용한다. [재질 시트](../../../asset-sources/Art/Chapter1/material-study.webp)

시트와 GLB·텍스처 배포본은 `python tools/package-chapter-art.py`로 묶는다.
