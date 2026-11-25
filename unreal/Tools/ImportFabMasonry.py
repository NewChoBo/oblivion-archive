"""Import the licensed Stylized Village Fatpack's seamless masonry for the chapter.

python ImportFabMasonry.py <source.unitypackage or its extracted folder> <UE root>
Requires Pillow in system Python. Source maps and resulting uassets stay local.
"""

import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile


DEST = "/Game/LocalVendor/Archive"
MATERIAL = "M_ArchiveMasonry"
TILE_DIR = Path("Assets/MeshingunStudio/StylizedVillageFatpack/HDRP(Default)/Art/Assets/Textures/Tile/T_Tiling_Brick")
MAPS = {
    "BC": ("abc00000000010266184518363843482", "1b5d87f4d685801439cef6ddf6138846a2bf05f9dce10b1e1d91e0e3e9abd0dd"),
    "N": ("abc00000000003708724859368027951", "3024975c02478039ff63f49b4db40b6dd15c124bd594f6d7265e6b379b3691bb"),
    "MRO": ("abc00000000016530038848333097297", "6c80efa3270fbbfcc0f2ac868d6250df8ae9a478fb87e8cd1939a75b75f00e38"),
}


def prepare_maps(source, work):
    from PIL import Image

    if source.is_dir():
        images = {key: (source / TILE_DIR / f"T_Tiling_Brick_{key}.png").read_bytes() for key in MAPS}
    else:
        members = {guid + "/asset": key for key, (guid, _) in MAPS.items()}
        images = {}
        with tarfile.open(source, "r|gz", bufsize=1024 * 1024) as archive:
            for member in archive:
                key = members.get(member.name.removeprefix("./"))
                if key and member.isfile():
                    images[key] = archive.extractfile(member).read()
                    if len(images) == len(MAPS):
                        break
    for key, (_, digest) in MAPS.items():
        data = images.get(key, b"")
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f"Expected the publisher's T_Tiling_Brick_{key} from the 2021.3.30 edition.")
        with Image.open(io.BytesIO(data)) as raw:
            image = raw.convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS)
            image.save(work / f"T_ArchiveMasonry_{key}.png")


def generate(source, engine):
    with tempfile.TemporaryDirectory(prefix="archive-masonry-") as temp:
        work = Path(temp)
        prepare_maps(source, work)
        project = work / "MasonryImport.uproject"
        project.write_text(json.dumps({"FileVersion": 3, "Plugins": [
            {"Name": "PythonScriptPlugin", "Enabled": True},
            {"Name": "EditorScriptingUtilities", "Enabled": True},
        ]}), encoding="utf-8")
        editor = engine / "Engine/Binaries/Win64/UnrealEditor-Cmd.exe"
        command = [str(editor), str(project), "-run=pythonscript", f"-script={Path(__file__).resolve()}",
                   f"-abslog={work / 'import.log'}", "-NullRHI", "-unattended", "-nosplash", "-nosound", "-NoP4",
                   "-NoShaderCompile", "-Multiprocess"]
        result = subprocess.run(command, cwd=work, env={**os.environ, "ARCHIVE_MASONRY_WORK": temp},
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        receipt = work / "generated.json"
        if result.returncode or not receipt.is_file():
            lines = (work / "import.log").read_text(encoding="utf-8", errors="replace").splitlines()
            raise RuntimeError("\n".join(line for line in lines if "LogPython:" in line or "Error:" in line)[-5000:])
        names = json.loads(receipt.read_text(encoding="utf-8"))
        output = Path(__file__).resolve().parents[1] / "Content/LocalVendor/Archive"
        output.mkdir(parents=True, exist_ok=True)
        for name in names:
            package = work / "Content/LocalVendor/Archive" / (name + ".uasset")
            shutil.copy2(package, output / package.name)
        print(f"{DEST}/{MATERIAL}: imported {len(names) - 1} local 1024px maps.")


def build_material(work):
    import unreal as ue

    tools = ue.AssetToolsHelpers.get_asset_tools()
    edit = ue.MaterialEditingLibrary
    library = ue.EditorAssetLibrary
    material = tools.create_asset(MATERIAL, DEST, ue.Material, ue.MaterialFactoryNew())
    # WorldAlignedNormal projects in world coordinates, then its default WorldSpace=false
    # branch transforms the sampled result back into the receiving mesh's tangent basis.
    material.set_editor_property("tangent_space_normal", True)
    names = []

    def node(kind):
        return edit.create_material_expression(material, kind)

    def connect(source, output, target, pin):
        if not edit.connect_material_expressions(source, output, target, pin):
            raise RuntimeError(f"Cannot connect {source.get_name()}.{output} to {target.get_name()}.{pin}")

    def finish(source, output, prop):
        if not edit.connect_material_property(source, output, prop):
            raise RuntimeError(f"Cannot connect material input {prop}")

    def vector(r, g, b):
        value = node(ue.MaterialExpressionConstant3Vector)
        value.set_editor_property("constant", ue.LinearColor(r, g, b, 1))
        return value

    # About sixteen masonry courses per tile. A 3.2 m world repeat gives a 20 cm course
    # consistently on the cube walls, arch faces and reveal without stretching their UVs.
    repeat_cm = vector(320, 320, 320)

    def projected_map(key, compression, sampler, function):
        texture_name = "T_ArchiveMasonry_" + key
        task = ue.AssetImportTask()
        task.filename = str(work / (texture_name + ".png"))
        task.destination_path = DEST
        task.automated = True
        tools.import_asset_tasks([task])
        texture = library.load_asset(DEST + "/" + texture_name)
        if not isinstance(texture, ue.Texture2D):
            raise RuntimeError(f"Failed to import {texture_name}")
        texture.set_editor_property("compression_settings", compression)
        texture.set_editor_property("srgb", key == "BC")
        if key == "N":
            # The Unity package supplies a +Y tangent normal. Unreal samples DirectX normals.
            texture.set_editor_property("flip_green_channel", True)
        if not library.save_loaded_asset(texture, False):
            raise RuntimeError(f"Failed to save {texture_name}")
        names.append(texture_name)
        obj = node(ue.MaterialExpressionTextureObject)
        obj.set_editor_property("texture", texture)
        obj.set_editor_property("sampler_type", sampler)
        aligned = node(ue.MaterialExpressionMaterialFunctionCall)
        prefix = "/Engine/Functions/Engine_MaterialFunctions01/Texturing/"
        resource = ue.load_object(None, prefix + function + "." + function)
        if not resource or not aligned.set_material_function(resource):
            raise RuntimeError(f"Engine function {function} unavailable")
        connect(obj, "", aligned, "TextureObject")
        connect(repeat_cm, "", aligned, "TextureSize")
        return aligned

    compression = ue.TextureCompressionSettings
    sampler = ue.MaterialSamplerType
    prop = ue.MaterialProperty
    color = projected_map("BC", compression.TC_DEFAULT, sampler.SAMPLERTYPE_COLOR, "WorldAlignedTexture")
    normal = projected_map("N", compression.TC_NORMALMAP, sampler.SAMPLERTYPE_NORMAL, "WorldAlignedNormal")
    masks = projected_map("MRO", compression.TC_MASKS, sampler.SAMPLERTYPE_MASKS, "WorldAlignedTexture")

    # Retain the brick joints and edge wear, tinting their original terracotta toward cool slate.
    grey = node(ue.MaterialExpressionDesaturation)
    connect(color, "XYZ Texture", grey, "Input")
    amount = node(ue.MaterialExpressionConstant)
    amount.set_editor_property("r", .94)
    connect(amount, "", grey, "Fraction")
    finish_color = node(ue.MaterialExpressionMultiply)
    connect(grey, "", finish_color, "A")
    connect(vector(.55, .66, .73), "", finish_color, "B")
    finish(finish_color, "", prop.MP_BASE_COLOR)
    finish(normal, "XYZ Texture", prop.MP_NORMAL)
    for channel, slot in [("g", prop.MP_ROUGHNESS), ("b", prop.MP_AMBIENT_OCCLUSION)]:
        mask = node(ue.MaterialExpressionComponentMask)
        for field in ("r", "g", "b", "a"):
            mask.set_editor_property(field, field == channel)
        connect(masks, "XYZ Texture", mask, "Input")
        finish(mask, "", slot)
    edit.layout_material_expressions(material)
    if not library.save_loaded_asset(material, False):
        raise RuntimeError("Failed to save masonry material")
    names.append(MATERIAL)
    (work / "generated.json").write_text(json.dumps(names), encoding="utf-8")


if os.environ.get("ARCHIVE_MASONRY_WORK") and "unreal" in sys.modules:
    build_material(Path(os.environ["ARCHIVE_MASONRY_WORK"]))
elif __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    generate(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
