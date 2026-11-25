"""Import two locally licensed Stylized Village props into an ignored UE content folder.

Run with Python and Pillow: python ImportFabProps.py <unitypackage> <UE root>.
The editor runs headless in a fresh temporary project. Only the selected Unreal
assets are copied to the game; the original package is always read-only.
"""

import gzip
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile


DEST = "/Game/LocalVendor/Archive"
MODELS = {"SM_Shelf_01": "ShelvesAndLadders", "SM_Crate_01": "CrateAndBarrel"}
# Polygon counts from the two named LOD0 nodes in the publisher's original FBX.
LOD0_TRIANGLES = {"SM_Shelf_01": 4994, "SM_Crate_01": 3998}
SOURCES = {
    "abc00000000009007511665371142078": "SM_Shelf_01.fbx",
    "abc00000000008573338266930555984": "SM_Crate_01.fbx",
    "abc00000000004109872905015918482": "T_ShelvesAndLadders_01_BC.png",
    "abc00000000005366004152945441447": "T_ShelvesAndLadders_01_N.png",
    "abc00000000001199110618688557273": "T_ShelvesAndLadders_01_MRO.png",
    "abc00000000004786981843273597362": "T_CrateAndBarrel_01_BC.png",
    "abc00000000001475654202559634695": "T_CrateAndBarrel_01_N.png",
    "abc00000000005155768102642709433": "T_CrateAndBarrel_01_MRO.png",
}


def extract(package, directory):
    from PIL import Image

    resolved = set()
    with gzip.open(package, "rb") as stream, tarfile.open(
        fileobj=stream, mode="r|", bufsize=1024 * 1024
    ) as archive:
        for entry in archive:
            guid, _, kind = entry.name.strip("./").partition("/")
            if guid not in SOURCES:
                continue
            target = directory / SOURCES[guid]
            if kind == "asset":
                with target.open("wb") as output:
                    shutil.copyfileobj(archive.extractfile(entry), output)
            elif kind == "pathname":
                original = archive.extractfile(entry).read().decode("utf-8-sig")
                if Path(original).name != target.name:
                    raise ValueError(f"Unexpected source for {target.name}: {original}")
                resolved.add(guid)
    if resolved != SOURCES.keys():
        raise ValueError("The selected files are missing from this edition of the package.")
    for texture in directory.glob("*.png"):
        with Image.open(texture) as image:
            image = image.convert("RGB")
            image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        image.save(texture)


def run_local(package, engine_root, root):
    source = root / "source"
    source.mkdir()
    print(f"Private import workspace: {root}", flush=True)
    extract(package, source)
    project = root / "FabImport.uproject"
    project.write_text(json.dumps({
        "FileVersion": 3,
        "Plugins": [
            {"Name": "PythonScriptPlugin", "Enabled": True},
            {"Name": "EditorScriptingUtilities", "Enabled": True},
        ],
    }), encoding="utf-8")
    config = root / "Config"
    config.mkdir()
    (config / "DefaultEngine.ini").write_text(
        "[ConsoleVariables]\nInterchange.FeatureFlags.Import.FBX=0\n",
        encoding="utf-8",
    )
    editor = engine_root / "Engine/Binaries/Win64/UnrealEditor-Cmd.exe"
    log = root / "import.log"
    env = {**os.environ, "ARCHIVE_FAB_IMPORT_ROOT": str(root)}
    result = subprocess.run([
        str(editor), str(project), "-run=pythonscript",
        f"-script={Path(__file__).resolve()}", f"-abslog={log}", "-NullRHI",
        "-unattended", "-nosplash", "-nosound", "-NoShaderCompile", "-NoP4", "-multiprocess",
    ], env=env, cwd=root,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if result.returncode or not (root / "report.json").is_file():
        lines = log.read_text(encoding="utf-8", errors="replace").splitlines() if log.is_file() else []
        details = "\n".join(line for line in lines if "LogPython:" in line or "Error:" in line)
        raise RuntimeError(f"Fab prop import failed ({result.returncode}).\n{details[-5000:]}")
    report = json.loads((root / "report.json").read_text(encoding="utf-8"))
    output = Path(__file__).resolve().parents[1] / "Content/LocalVendor/Archive"
    output.mkdir(parents=True, exist_ok=True)
    generated = root / "Content/LocalVendor/Archive"
    for name in report["packages"]:
        if not (generated / f"{name}.uasset").is_file():
            raise RuntimeError(f"Missing generated package {name}")
    for name in report["packages"]:
        for file in generated.glob(f"{name}.*"):
            if file.suffix in {".uasset", ".uexp", ".ubulk"}:
                shutil.copy2(file, output / file.name)
    print(json.dumps(report, indent=2))


def editor_import(root):
    import unreal as ue

    tools = ue.AssetToolsHelpers.get_asset_tools()
    lib = ue.EditorAssetLibrary
    materials = ue.MaterialEditingLibrary
    package_names = []
    report = {"meshes": {}, "packages": package_names}

    def import_file(file, path, options=None):
        task = ue.AssetImportTask()
        task.filename = str(root / "source" / file)
        task.destination_path = path
        task.automated = True
        task.save = True
        if options is not None:
            task.factory = ue.FbxFactory()
            task.options = options
        tools.import_asset_tasks([task])
        return [lib.load_asset(p) for p in task.imported_object_paths]

    for name, family in MODELS.items():
        mat_name = f"M_{family}"
        mat = tools.create_asset(mat_name, DEST, ue.Material, ue.MaterialFactoryNew())
        package_names.append(mat_name)
        for suffix, sampler, compression, links in [
            ("BC", ue.MaterialSamplerType.SAMPLERTYPE_COLOR,
             ue.TextureCompressionSettings.TC_DEFAULT, [("RGB", "MP_BASE_COLOR")]),
            ("N", ue.MaterialSamplerType.SAMPLERTYPE_NORMAL,
             ue.TextureCompressionSettings.TC_NORMALMAP, [("RGB", "MP_NORMAL")]),
            ("MRO", ue.MaterialSamplerType.SAMPLERTYPE_MASKS,
             ue.TextureCompressionSettings.TC_MASKS,
             [("R", "MP_METALLIC"), ("G", "MP_ROUGHNESS"), ("B", "MP_AMBIENT_OCCLUSION")]),
        ]:
            texture_name = f"T_{family}_01_{suffix}"
            texture, = import_file(texture_name + ".png", DEST)
            if not isinstance(texture, ue.Texture2D):
                raise RuntimeError(f"Texture import failed: {texture_name}")
            texture.set_editor_property("compression_settings", compression)
            texture.set_editor_property("srgb", suffix == "BC")
            lib.save_loaded_asset(texture, False)
            node = materials.create_material_expression(mat, ue.MaterialExpressionTextureSample)
            node.set_editor_property("texture", texture)
            node.set_editor_property("sampler_type", sampler)
            for output, prop in links:
                if not materials.connect_material_property(node, output, getattr(ue.MaterialProperty, prop)):
                    raise RuntimeError(f"Could not connect {texture_name}.{output} to {prop}")
            package_names.append(texture_name)
        materials.layout_material_expressions(mat)
        # The cooker compiles the saved expression graph for the selected RHI.
        lib.save_loaded_asset(mat, False)
        options = ue.FbxImportUI()
        options.set_editor_property("import_mesh", True)
        options.set_editor_property("import_as_skeletal", False)
        options.set_editor_property("import_materials", False)
        options.set_editor_property("import_textures", False)
        options.set_editor_property("automated_import_should_detect_type", False)
        options.set_editor_property("mesh_type_to_import", ue.FBXImportType.FBXIT_STATIC_MESH)
        settings = options.get_editor_property("static_mesh_import_data")
        settings.set_editor_property("combine_meshes", False)
        settings.set_editor_property("auto_generate_collision", False)
        settings.set_editor_property("import_mesh_lo_ds", False)
        stage = "/Game/ArchiveImportStaging/" + name
        objects = import_file(name + ".fbx", stage, options)
        imported = [m for m in objects if isinstance(m, ue.StaticMesh)]
        ue.log("Archive Fab import: " + ", ".join(m.get_name() for m in imported))
        visible = [m for m in imported if m.get_name().upper().endswith("_LOD0")]
        if not visible:
            visible = [m for m in imported if m.get_name() == name]
        if len(visible) != 1:
            raise RuntimeError(f"Unrecognized LOD0 for {name}: {[m.get_name() for m in imported]}")
        mesh = visible[0]
        if not lib.rename_loaded_asset(mesh, f"{DEST}/{name}"):
            raise RuntimeError(f"Cannot move {name}")
        for slot in range(len(mesh.get_editor_property("static_materials"))):
            mesh.set_material(slot, mat)
        lib.save_loaded_asset(mesh, False)
        box = mesh.get_bounding_box()
        vector = lambda vec: [round(vec.x, 3), round(vec.y, 3), round(vec.z, 3)]
        report["meshes"][name] = {
            "path": mesh.get_path_name(),
            "nativeMinCm": vector(box.min),
            "nativeMaxCm": vector(box.max),
            "vertices": mesh.get_num_vertices(0),
            "triangles": mesh.get_num_triangles(0),
            "lods": mesh.get_num_lods(),
            "simpleHulls": len(mesh.get_editor_property("body_setup")
                               .get_editor_property("agg_geom").get_editor_property("convex_elems")),
            "materials": [slot.material_interface.get_path_name()
                          for slot in mesh.get_editor_property("static_materials")],
            "sourceNodes": [obj.get_name() for obj in imported if obj != mesh] + [name],
        }
        proof = report["meshes"][name]
        if proof["lods"] != 1 or proof["triangles"] != LOD0_TRIANGLES[name] or proof["simpleHulls"]:
            raise RuntimeError(f"The imported mesh does not match the original visible LOD0: {proof}")
        package_names.append(name)
    (root / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if os.environ.get("ARCHIVE_FAB_IMPORT_ROOT") and "unreal" in sys.modules:
    editor_import(Path(os.environ["ARCHIVE_FAB_IMPORT_ROOT"]))
elif __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    with tempfile.TemporaryDirectory(prefix="archive-fab-") as directory:
        run_local(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), Path(directory))
