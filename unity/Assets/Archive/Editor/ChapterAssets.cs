using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace Archive.Editor
{
    internal static class ChapterAssets
    {
        const string Destination = "Assets/Archive/Generated/Source";

        // Keep one authored copy. Unity manages import settings and GUIDs in its own workspace.
        internal static void Sync()
        {
            string source = Path.GetFullPath(Path.Combine(Application.dataPath, "../../public/assets"));
            string[] models = { "chapter-art/folio-bookcase.glb", "chapter-art/reading-counter.glb",
                                "chapter-art/seal-gate.glb",      "chapter-art/fallen-stone.glb",
                                "chapter-art/corridor-pier.glb",  "chapter-art/rune-plinth.glb",
                                "chapter-art/vault-lectern.glb",  "arenas/gothic-arena.glb",
                                "chapter-art/outer-leviathan.glb" };
            string[] textures = { "chapter-art/reading-runner.jpg",
                                  "chapter-art/slate.jpg",
                                  "chapter-art/walnut.jpg",
                                  "chapter-art/slate-normal.png",
                                  "chapter-art/walnut-normal.png",
                                  "chapter-art/leather.jpg",
                                  "chapter-art/linen.jpg",
                                  "citadel/flagstone.jpg",
                                  "polyhaven/old_wooden_floor_01_diff_1k.jpg" };
            Directory.CreateDirectory(Destination);
            // glTFast resolves the images relative to the model during its own importer pass.
            bool imagesChanged = false;
            foreach (string relative in textures)
                imagesChanged |= Stage(source, relative);
            string repo = Path.GetFullPath(Path.Combine(Application.dataPath, "../.."));
            string blasters = Path.Combine(repo, "asset-sources/Art/ThirdParty/Kenney/BlasterSelection");
            Directory.CreateDirectory(Destination + "/Textures");
            CopyBytes(Path.Combine(blasters, "Textures/colormap.png"), Destination + ("/Textures/" +
                                                                                      "colormap.png"));
            string materialPath = Path.Combine(repo, "shared/levels/citadel-materials.json");
            var slots = JObject.Parse(File.ReadAllText(materialPath));
            foreach (string file in slots.Properties()
                         .SelectMany(p => ((JObject)p.Value).Properties())
                         .Where(p => p.Value.Type == JTokenType.String)
                         .Select(p => (string)p.Value)
                         .Distinct())
                imagesChanged |= Stage(source, file);
            CopyText(materialPath, Destination + "/citadel-materials.json");
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            foreach (string file in Directory.GetFiles(Destination, "*-normal.png"))
            {
                var importer = AssetImporter.GetAtPath(file.Replace('\\', '/')) as TextureImporter;
                if (importer && importer.textureType != TextureImporterType.NormalMap)
                {
                    importer.textureType = TextureImporterType.NormalMap;
                    importer.SaveAndReimport();
                }
            }
            foreach (string relative in models)
                if (Stage(source, relative) || imagesChanged)
                    AssetDatabase.ImportAsset(Destination + "/" + Path.GetFileName(relative),
                                              ImportAssetOptions.ForceUpdate |
                                                  ImportAssetOptions.ForceSynchronousImport);
            foreach (string model in new[] { "blaster-a.glb", "blaster-j.glb" })
                if (Stage(blasters, model))
                    AssetDatabase.ImportAsset(Destination + "/" + model,
                                              ImportAssetOptions.ForceSynchronousImport);
            string localeSource = Path.GetFullPath(Path.Combine(Application.dataPath, "../Localization"));
            string localeTarget = "Assets/Archive/Generated/Resources/ArchiveText";
            Directory.CreateDirectory(localeTarget);
            foreach (string language in new[] { "en", "ko" })
                MergeLocale(Path.Combine(repo, "shared/locales", language, "chapter-story.json"),
                            Path.Combine(localeSource, language), Path.Combine(localeTarget, language + ".json"));
            string modes = "Assets/Archive/Generated/Resources/ArchiveModes";
            Directory.CreateDirectory(modes);
            CopyText(Path.Combine(repo, "asset-sources/Art/arenas/experience-layouts.json"),
                     modes + "/catalog.json");
            string bake = Path.Combine(repo, "asset-sources/Art/Chapter1/unity-citadel.json.gz");
            string imported = Destination + "/fortress.archivecitadel";
            if (!File.Exists(imported) || !File.ReadAllBytes(bake).SequenceEqual(File.ReadAllBytes(imported)))
                File.Copy(bake, imported, true);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            PlayerAssets.Sync();
        }

        static bool Stage(string source, string relative)
        {
            string original = Path.Combine(source, relative);
            string target = Path.Combine(Destination, Path.GetFileName(relative));
            return CopyBytes(original, target);
        }

        static bool CopyBytes(string original, string target)
        {
            if (File.Exists(target) && File.ReadAllBytes(original).SequenceEqual(File.ReadAllBytes(target)))
                return false;
            File.Copy(original, target, true);
            return true;
        }

        static void MergeLocale(string sharedStory, string source, string target)
        {
            var catalog = new JObject();
            var localFiles = Directory.GetFiles(source, "unity-*.json");
            if (localFiles.Length == 0)
                throw new InvalidDataException("No Unity localization catalogs in " + source);
            foreach (string file in localFiles.OrderBy(f => f, System.StringComparer.Ordinal).Prepend(sharedStory))
                foreach (var entry in JObject.Parse(File.ReadAllText(file)).Properties())
                    catalog.Add(entry.Name, entry.Value.DeepClone());
            string serialized = catalog.ToString(Formatting.Indented);
            if (!File.Exists(target) || File.ReadAllText(target) != serialized)
                File.WriteAllText(target, serialized);
        }

        static void CopyText(string source, string target)
        {
            if (!File.Exists(target) || File.ReadAllText(source) != File.ReadAllText(target))
                File.Copy(source, target, true);
        }
    }
}
