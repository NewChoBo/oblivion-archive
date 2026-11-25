"""Read the same resolved work plan used by the game; no second placement table."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = json.loads(subprocess.check_output(['node', '--experimental-strip-types', 'babylon/tools/export-citadel-construction.mjs'], cwd=ROOT))

def data(name):
    resolved = {'citadel-construction.json': 'construction', 'fortress-exterior.json': 'plan', 'chapter-1.json': 'chapterLevel'}
    return SOURCES[resolved[name]] if name in resolved else json.loads((ROOT/'shared/levels'/name).read_text('utf8'))
