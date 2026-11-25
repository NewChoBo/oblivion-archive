"""Build the bilingual game font from an OFL-licensed Noto Sans KR source."""
import json
from pathlib import Path
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[2]
catalogs = sorted((root / "unity/Localization").glob("*/unity-*.json"))
catalogs += sorted((root / "shared/locales").glob("*/chapter-story.json"))
text = "".join(chr(code) for code in range(32, 127)) + "←↑→↓·◉•×—–…"
for path in catalogs:
    text += path.read_text(encoding="utf-8")
arena = json.loads((root / "asset-sources/Art/arenas/experience-layouts.json").read_text(encoding="utf-8"))
text += "".join("".join(catalog.values()) for catalog in arena["text"].values())
font = TTFont(sys.argv[1], recalcTimestamp=False)
if "fvar" in font:
    font = instantiateVariableFont(font, {"wght": 400}, inplace=True)
subsetter = subset.Subsetter()
subsetter.populate(text=text)
subsetter.subset(font)
font.save(root / "unity/Assets/Archive/Resources/ArchiveHudFont.ttf")
