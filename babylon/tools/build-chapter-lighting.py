"""Bake the chapter's directional light probes and surface relief."""
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ASSETS = Path(__file__).resolve().parents[2] / 'public/assets/chapter-art'

# Each lobe represents light that reaches a surface from that direction.
# Intensities are linear HDR. Narrow sources catch polished metal, while broad
# lobes represent the light reflected from the walls and the floor.
INDOOR = (
    (.020, .024, .032),
    [
        ((-1, .63, .18), 19, (.49, .66, .92)),    # window
        ((-1, .12, .06), 2.9, (.072, .12, .21)),  # blue stone bounce
        ((1, .36, .40), 48, (2.8, 1.36, .51)),   # east gallery lamps
        ((-.68, .52, -1), 72, (1.66, .75, .30)), # nearer lamps
        ((.18, -.84, .58), 4, (.29, .14, .064)),  # desk and wood floor
        ((.07, .97, .43), 1.8, (.074, .085, .11)),
    ],
)

OUTDOOR = (
    (.010, .014, .021),
    [
        ((-.80, .76, .33), 10, (.38, .53, .82)),  # nebula
        ((-.61, .86, .23), 77, (.96, 1.24, 1.79)),
        ((.21, .12, .82), 2.2, (.041, .065, .115)),
        ((.61, -.21, -.37), 5, (.075, .060, .058)), # return off the castle
    ],
)


def unit(vectors):
    return vectors / np.linalg.norm(vectors, axis=-1, keepdims=True)


def cube_faces(size):
    axis = (np.arange(size) + .5) * (2 / size) - 1
    s, t = np.meshgrid(axis, axis)
    one = np.ones_like(s)
    for face in [(one,-t,-s),(-one,-t,s),(s,one,t),(s,-one,-t),(s,-t,one),(-s,-t,-one)]:
        yield unit(np.stack(face, axis=-1))


def radiance(directions, probe):
    ambient, lobes = probe
    light = np.broadcast_to(ambient, directions.shape).copy()
    for direction, concentration, rgb in lobes:
        alignment = directions @ unit(np.asarray(direction))
        light += np.exp(concentration * (alignment - 1))[..., None] * rgb
    return light


def filtered(directions, probe, roughness=None):
    # A low-discrepancy sequence samples the hemisphere about each cube texel.
    i = np.arange(192)
    u = (i + .5) / len(i)
    angle = i * np.pi * (3 - np.sqrt(5))
    diffuse = roughness is None
    if diffuse:
        cosine = np.sqrt(1 - u)
    else:
        alpha = roughness ** 2
        cosine = np.sqrt((1-u) / (1 + (alpha**2-1)*u))
    sine = np.sqrt(1 - cosine**2)
    reference = np.where(np.abs(directions[..., 1:2]) < .99, (0, 1, 0), (1, 0, 0))
    tangent = unit(np.cross(reference, directions))
    bitangent = np.cross(directions, tangent)
    sample = (directions[..., None, :] * cosine[:, None]
              + tangent[..., None, :] * (sine*np.cos(angle))[:, None]
              + bitangent[..., None, :] * (sine*np.sin(angle))[:, None])
    if diffuse:
        return radiance(sample, probe).mean(axis=-2)
    weight = np.maximum(2*cosine**2 - 1, 0)
    ray = 2*cosine[:, None]*sample - directions[..., None, :]
    return np.sum(radiance(ray, probe) * weight[:, None], axis=-2) / weight.sum()


def rgbd_png(linear):
    divisor = np.minimum(1, np.floor(255 / np.maximum(1, linear.max(axis=-1))) / 255)
    gamma = (linear * divisor[..., None]) ** (1/2.2)
    rgba = np.dstack((gamma, divisor)).clip(0, 1)
    out = io.BytesIO()
    Image.fromarray(np.rint(rgba*255).astype(np.uint8)).save(out, format='PNG', optimize=True)
    return out.getvalue()


def diffuse_polynomial(probe):
    # Fit the engine's quadratic irradiance basis to the filtered radiance.
    # The renderer can evaluate it at the vertices instead of sampling another cube.
    faces = list(cube_faces(12))
    x, y, z = np.concatenate([f.reshape(-1, 3) for f in faces]).T
    radiance = np.concatenate([filtered(f, probe).reshape(-1, 3) for f in faces])
    basis = np.stack((x, y, z, x*x, y*y, z*z, y*z, z*x, x*y), axis=-1)
    coeffs = np.linalg.lstsq(basis, radiance, rcond=None)[0]
    return dict(zip(('x', 'y', 'z', 'xx', 'yy', 'zz', 'yz', 'zx', 'xy'), coeffs.round(7).tolist()))


def bake_probe(name, probe):
    width = 64
    payload = bytearray()

    def face_entry(colors):
        data = rgbd_png(colors)
        entry = {'position': len(payload), 'length': len(data)}
        payload.extend(data)
        return entry

    mip_count = width.bit_length() - 1
    mips = []
    for level in range(mip_count + 1):
        for directions in cube_faces(width >> level):
            colors = filtered(directions, probe, level / mip_count) if level else radiance(directions, probe)
            mips.append(face_entry(colors))
    manifest = {
        'version': 2, 'width': width, 'imageType': 'image/png',
        'specular': {'lodGenerationScale': 1, 'mipmaps': mips},
        'irradiance': diffuse_polynomial(probe),
    }
    magic = bytes.fromhex('86 16 87 96 f6 d6 96 36')
    (ASSETS / f'{name}.env').write_bytes(magic + json.dumps(manifest).encode() + b'\0' + payload)


def bake_relief(name, depth, grain, size):
    with Image.open(ASSETS / f'{name}.jpg') as source:
        pixels = np.asarray(source.convert('RGB').resize((size, size))) / 255
        mono = source.convert('L').resize((size, size))
    soft = np.asarray(mono.filter(ImageFilter.GaussianBlur(.85))) / 255
    broad = np.asarray(mono.filter(ImageFilter.GaussianBlur(6))) / 255
    height = depth*soft + grain*(soft - broad)
    if name == 'slate':
        # The warm mortar sits below the blue-green faces of the blocks.
        height -= 2.5 * np.maximum(0, pixels[..., 0] - pixels[..., 1])
    dy, dx = np.gradient(height)
    edge = np.minimum(np.arange(size), np.arange(size)[::-1])
    fade = np.minimum(1, np.minimum.outer(edge, edge) / 7)
    normals = unit(np.dstack((-dx*fade, dy*fade, np.ones_like(dx))))
    Image.fromarray(np.rint((normals+1)*127.5).astype(np.uint8)).save(
        ASSETS / f'{name}-normal.png', optimize=True)


if __name__ == '__main__':
    bake_probe('archive-indirect', INDOOR)
    bake_probe('rampart-indirect', OUTDOOR)
    bake_relief('slate', 3.0, 3.0, 512)
    bake_relief('walnut', .9, 3.4, 256)
