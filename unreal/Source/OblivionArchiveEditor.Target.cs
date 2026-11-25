using UnrealBuildTool;

public class OblivionArchiveEditorTarget : TargetRules
{
    public OblivionArchiveEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V8;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_9;
        ExtraModuleNames.Add("OblivionArchive");
    }
}
