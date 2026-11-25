"""Project the chapter's nebula artwork into a panorama and six cubemap faces."""

from pathlib import Path

import numpy as np
from PIL import Image


SKY = Path(__file__).resolve().parents[2] / "asset-sources" / "Art" / "Chapter1" / "skybox"
PANORAMA_WIDTH, PANORAMA_HEIGHT = 4096, 2048
FACE_SIZE = 1024
STAR_COUNT = 3300
SKY_BLACK = (2, 3, 7)


def smoothstep(values):
    t = np.clip(values, 0, 1)
    return t * t * (3 - 2 * t)


def add_nebula(panorama):
    # The artwork subtends 64° by 30°, leaving dark sky around it at the lookout.
    panel_size = (round(PANORAMA_WIDTH * 64 / 360), round(PANORAMA_HEIGHT * 30 / 180))
    with Image.open(SKY / "nebula-source.png") as image:
        source = np.asarray(image.convert("RGB").resize(panel_size, Image.Resampling.LANCZOS), dtype=np.float32)
    width, height = panel_size
    x = np.linspace(0, 1, width, dtype=np.float32)
    y = np.linspace(0, 1, height, dtype=np.float32)
    horizontal = smoothstep(np.minimum(x, 1 - x) / .16)
    vertical = smoothstep(np.minimum(y, 1 - y) / .20)
    # Keep the cloud below the sky shader's bright-star threshold.
    glow = (.72 * source / (1 + source / 210)) * (vertical[:, None] * horizontal)[..., None]
    center_x = round(PANORAMA_WIDTH * (.5 - 78 / 360))
    center_y = round(PANORAMA_HEIGHT * (.5 - 10 / 180))
    left, top = center_x - width // 2, center_y - height // 2
    panorama[top:top + height, left:left + width] += glow


def add_stars(panorama):
    rng = np.random.default_rng(62089)
    longitude = rng.uniform(-np.pi, np.pi, STAR_COUNT)
    vertical = rng.uniform(-1, 1, STAR_COUNT)
    latitude = np.arcsin(vertical)
    x = (.5 + longitude / (2 * np.pi)) * PANORAMA_WIDTH - .5
    y = (.5 - latitude / np.pi) * PANORAMA_HEIGHT - .5
    peaks = (43 + 174 * rng.random(STAR_COUNT) ** 2.5) * (.40 + .60 * smoothstep((vertical + .78) / .78))
    tints = np.array([(0.83, .91, 1), (.97, .98, 1), (1, .91, .79)])
    colors = tints[rng.choice(len(tints), STAR_COUNT, p=[.28, .59, .13])]
    for cx, cy, angle, peak, rgb in zip(x, y, latitude, peaks, colors):
        # Correct the longitude span so the projected stars stay round near the poles.
        radius_y = .56 + .48 * peak / 217
        radius_x = radius_y / max(.11, np.cos(angle))
        columns = np.arange(int(np.floor(cx - 2.7 * radius_x)), int(np.ceil(cx + 2.7 * radius_x)) + 1)
        rows = np.arange(max(0, int(np.floor(cy - 2.7 * radius_y))),
                         min(PANORAMA_HEIGHT, int(np.ceil(cy + 2.7 * radius_y)) + 1))
        distance = ((rows - cy) / radius_y)[:, None] ** 2 + ((columns - cx) / radius_x) ** 2
        point = np.exp(-.5 * distance)[..., None] * peak * rgb
        patch = np.ix_(rows, columns % PANORAMA_WIDTH)
        panorama[patch] = np.maximum(panorama[patch], point)


def make_panorama():
    panorama = np.empty((PANORAMA_HEIGHT, PANORAMA_WIDTH, 3), dtype=np.float32)
    panorama[:] = SKY_BLACK
    add_nebula(panorama)
    add_stars(panorama)
    return Image.fromarray(np.rint(panorama).clip(0, 255).astype(np.uint8))


def write_faces(panorama):
    source = np.asarray(panorama)
    axis = 2 * (np.arange(FACE_SIZE, dtype=np.float32) + .5) / FACE_SIZE - 1
    s, t = np.meshgrid(axis, axis)
    one = np.ones_like(s)
    # Match the OpenGL cube face orientation with image row 0 at the top.
    faces = {
        "px": (one, -t, -s), "nx": (-one, -t, s),
        "py": (s, one, t), "ny": (s, -one, -t),
        "pz": (s, -t, one), "nz": (-s, -t, -one),
    }
    for face, (x, y, z) in faces.items():
        yaw = np.arctan2(x, z)
        latitude = np.arctan2(y, np.hypot(x, z))
        u = (.5 + yaw / (2 * np.pi)) * PANORAMA_WIDTH - .5
        v = np.clip((.5 - latitude / np.pi) * PANORAMA_HEIGHT - .5, 0, PANORAMA_HEIGHT - 1)
        col = np.floor(u).astype(np.int32)
        row = np.floor(v).astype(np.int32)
        u_ratio = (u - col)[..., None]
        v_ratio = (v - row)[..., None]
        left = col % PANORAMA_WIDTH
        right = (col + 1) % PANORAMA_WIDTH
        bottom = np.minimum(row + 1, PANORAMA_HEIGHT - 1)
        top_colors = source[row, left] * (1 - u_ratio) + source[row, right] * u_ratio
        bottom_colors = source[bottom, left] * (1 - u_ratio) + source[bottom, right] * u_ratio
        pixels = np.rint(top_colors * (1 - v_ratio) + bottom_colors * v_ratio).astype(np.uint8)
        Image.fromarray(pixels).save(SKY / f"space_{face}.png", optimize=True)


if __name__ == "__main__":
    panorama = make_panorama()
    panorama.save(SKY / "space-panorama.png", optimize=True)
    write_faces(panorama)
