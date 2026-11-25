using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Archive.Editor
{
    public static class ChapterWebBuild
    {
        public const string ScenePath = "Assets/Archive/Generated/ChapterOne.unity";

        // A fresh checkout opens the same generated scene that goes into the Web player.
        [InitializeOnLoadMethod]
        static void OpenFirstScene()
        {
            if (Application.isBatchMode) return;
            EditorApplication.delayCall += () =>
            {
                if (File.Exists(ScenePath) || EditorApplication.isPlayingOrWillChangePlaymode) return;
                if (UnityEngine.SceneManagement.SceneManager.GetActiveScene().isDirty) return;
                ChapterSceneBuilder.Create();
            };
        }

        [MenuItem("Archive/Build Chapter One for Web")]
        public static void Build()
        {
            if (!ChapterSceneBuilder.TryCreate()) return;
            PlayerSettings.companyName = "NewChoBo";
            PlayerSettings.productName = "Oblivion Archive";
            PlayerSettings.runInBackground = false;
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
            PlayerSettings.WebGL.template = "PROJECT:Archive";
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = "Builds/ChapterOne",
                target = BuildTarget.WebGL,
                options = BuildOptions.None
            };
            BuildReport result = BuildPipeline.BuildPlayer(options);
            if (result.summary.result != BuildResult.Succeeded)
                throw new InvalidOperationException($"Chapter One Web build: {result.summary.result}, {result.summary.totalErrors} errors.");
            File.Copy("Assets/Archive/Art/NotoSansKR-OFL.txt", Path.Combine(options.locationPathName, "NotoSansKR-OFL.txt"), true);
            string credits = Path.Combine(options.locationPathName,"licenses");
            Directory.CreateDirectory(credits);
            foreach (string file in Directory.GetFiles("../public/assets/licenses"))
                File.Copy(file,Path.Combine(credits,Path.GetFileName(file)),true);
            File.Copy("../public/assets/characters/ATTRIBUTION.md",Path.Combine(credits,"characters.md"),true);
            Debug.Log($"Chapter One Web build completed: {result.summary.totalSize} bytes.");
        }
    }
}
