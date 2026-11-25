using System.IO;
using System.Collections.Generic;
using EpicGames.Core;
using UnrealBuildTool;

public class OblivionArchive : ModuleRules
{
    public OblivionArchive(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "InputCore", "Json", "ProceduralMeshComponent", "ImageWrapper" });
        string root = Path.GetFullPath(Path.Combine(ModuleDirectory, "../../.."));
        foreach (string name in new[] { "chapter-1.json", "environment-prefabs.json" })
        {
            RuntimeDependencies.Add("$(ProjectDir)/Content/ArchiveData/" + name,
                Path.Combine(root, "shared", "levels", name), StagedFileType.UFS);
        }
        void Stage(string name, string file) =>
            RuntimeDependencies.Add("$(ProjectDir)/Content/ArchiveData/" + name, Path.Combine(root, file), StagedFileType.UFS);
        foreach (string language in new[] { "en", "ko" })
        {
            Stage("story-" + language + ".json", "shared/locales/" + language + "/chapter-story.json");
            Stage("menu-" + language + ".json", "unreal/Localization/" + language + ".json");
        }
        Stage("citadel.json.gz", "asset-sources/Art/Chapter1/unity-citadel.json.gz");
        Stage("work-layout.json", "asset-sources/Art/Chapter1/work-layout.json");
        const string materials = "shared/levels/citadel-materials.json";
        Stage("citadel-materials.json", materials);
        var catalog = JsonObject.Read(new FileReference(Path.Combine(root, materials)));
        var images = new HashSet<string>();
        foreach (string surfaceId in catalog.KeyNames)
        {
            var surface = catalog.GetObjectField(surfaceId);
            foreach (string field in surface.KeyNames)
                if (surface.TryGetStringField(field, out var image) && (image.EndsWith(".jpg") || image.EndsWith(".png")))
                    images.Add(image);
        }
        foreach (string image in images)
            Stage("textures/" + image, "public/assets/" + image);
        Stage("erased.jpg", "unreal/Media/erased.jpg");
        Stage("restored.jpg", "unreal/Media/restored.jpg");
    }
}
