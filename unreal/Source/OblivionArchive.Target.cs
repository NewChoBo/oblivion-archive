using UnrealBuildTool;

public class OblivionArchiveTarget : TargetRules
{
    public OblivionArchiveTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V8;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_9;
        ExtraModuleNames.Add("OblivionArchive");
    }
}
