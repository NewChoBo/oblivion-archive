"""Package the model sheets and the complete set of glTF texture dependencies."""
from pathlib import Path
import re
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs/art/chapter-1"
ASSETS = ROOT / "public/assets/chapter-art"
SOURCES = ROOT / "asset-sources/Art"
LICENSES = ROOT / "public/assets/licenses"


def package():
    entries = {p.name: p for p in ASSETS.iterdir() if p.suffix in (".glb", ".jpg", ".png", ".env")}
    entries["chapter-map.glb"] = DOCS / "chapter-map.glb"
    for name in ('work-citadel.svg','freight-transfer.svg','bindery-sequence.svg','reading-posture.svg','seal-approach.svg','citadel-furnishings.svg','work-review.html','work-layout-checks.json','citadel-placement-schedule.json'):
        entries['sheets/'+name] = DOCS/name
    entries['citadel/work-layout.json'] = SOURCES/'Chapter1/work-layout.json'
    entries["sheets/library-route.svg"] = DOCS / "library-route.svg"
    entries["sheets/citadel-basalt.webp"] = SOURCES / "Chapter1/citadel-basalt.webp"
    for folder in ("citadel", "arcane", "effects"):
        for path in (ROOT / "public/assets" / folder).glob("*"):
            if path.is_file(): entries[f"{folder}/{path.name}"] = path
    for path in (SOURCES / "Chapter1/model-textures").rglob("*.png"):
        entries[path.relative_to(SOURCES / "Chapter1").as_posix()] = path
    entries["citadel/materials.json"] = ROOT / "shared/levels/citadel-materials.json"
    skybox_files = ["README.md", "space-panorama.png"]
    skybox_files.extend(f"space_{face}.png" for face in ("px", "nx", "py", "ny", "pz", "nz"))
    for name in skybox_files:
        entries[f"skybox/{name}"] = SOURCES / "Chapter1" / "skybox" / name
    entries["sheets/fortress-blueprint.svg"] = DOCS / "fortress-blueprint.svg"
    for name in ("citadel-stair-section.svg","citadel-elevations.svg","citadel-furnishings.svg"):
        entries[f"sheets/{name}"]=DOCS/name
    for name in ("work-review.html", "work-citadel.svg", "freight-transfer.svg", "bindery-sequence.svg",
                 "reading-posture.svg", "seal-approach.svg", "freight-receiving.webp", "bindery-work.webp", "photo-sightline.webp"):
        entries[f"sheets/{name}"] = DOCS / name
    for name in ("work-layout.json", "work-and-reading-brief.md"):
        entries[f"design/{name}"] = SOURCES / "Chapter1" / name
    for name in ("citadel-construction.json","fortress-exterior.json","chapter-1.json","environment-prefabs.json"):
        entries[f"design/{name}"]=ROOT/"shared/levels"/name
    # Resolve the website's asset and gallery paths relative to sheets/ in the download.
    html = (DOCS / "construction.html").read_text("utf8").replace(
        "../../../assets/chapter-art/", "../"
    ).replace("../../../assets/", "../")
    # The offline pack omits the web gallery; the link target is stable across translations.
    html = re.sub(r'<a href="\./#fortress">[^<]*</a>', '', html, count=1)
    for sheet in ("scribe-concept", "archive-concept", "floor-plan", "ink-apparition-concept", "outer-leviathan-concept", "floating-citadel"):
        entries[f"sheets/{sheet}.webp"] = DOCS / f"{sheet}.webp"
    for sheet in ("material-study", "scribe-face"):
        entries[f"sheets/{sheet}.webp"] = SOURCES / "Chapter1" / f"{sheet}.webp"
    for name in ("LICENSE.txt", "SOURCES.md"):
        entries[f"licenses/KayKit/{name}"] = SOURCES / "ThirdParty/KayKit" / name
    for name in ("CC0-1.0.txt", "PolyHaven-SOURCES.md"):
        entries[f"licenses/PolyHaven/{name}"] = LICENSES / name
    guide = (
        "망각의 서재 · 사진에서 지워진 사람\n\n"
        "sheets/에는 초기 서기관 삼면도, 환경 컨셉아트, 평면도와 텍스처 원판이 있습니다.\n"
        "floating-citadel.webp와 fortress-blueprint.svg는 성채 원화와 높이를 표시한 설계도입니다.\n"
        "sheets/work-review.html에서 현행 맵의 기물 배치 도면과 원화를 함께 볼 수 있습니다. 편집 원본은 design/work-layout.json, 게임과 같은 해석 결과는 sheets/citadel-placement-schedule.json에 있습니다.\n"
        "chapter-map.glb는 성채 도착섬에서 봉인 보관실까지의 전체 공간이며 텍스처를 내장합니다.\n"
        "library-route.svg는 지상층 동선입니다. citadel/에는 색과 노멀 맵, model-textures/에는 모델별 텍스처 원본이 있습니다.\n"
        "skybox/에는 6면 큐브맵, 2:1 파노라마, 면 방향표가 있습니다.\n"
        "ink-apparition.glb에는 Hover, Glide, Windup, Recover, Stagger가, outer-leviathan.glb에는 VoidSwim이 들어 있습니다. 콘셉트 시트는 sheets/에 있습니다.\n"
        "archive-indirect.env와 rampart-indirect.env는 Babylon.js에서 쓰는 실내·성곽 반사광입니다.\n"
        "archive-scribe.glb는 가면을 쓴 서기관입니다. 개별 GLB는 옆의 JPG 및 노멀 맵 PNG와 함께 두고 여세요.\n"
        "서기관은 KayKit의 CC0 리그와 동작을 사용합니다. 마루는 Poly Haven의 CC0 자료입니다.\n"
        "출처와 이용 조건 원문은 licenses/에 있습니다.\n"
    )
    with ZipFile(DOCS / "chapter-art-pack.zip", "w") as archive:
        inline={"README.txt":guide.encode("utf-8-sig"),"sheets/construction.html":html.encode("utf8")}
        for name in sorted([*entries,*inline]):
            data=inline[name] if name in inline else entries[name].read_bytes()
            # A fixed timestamp keeps repeated builds of the same asset pack identical.
            archive.writestr(ZipInfo(name), data, compress_type=ZIP_DEFLATED, compresslevel=6)


if __name__ == "__main__":
    package()
