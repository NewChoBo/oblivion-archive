using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace Archive.Editor
{
    internal static class StoryAssets
    {
        const string Source = "Assets/Archive/Generated/Source/";
        internal const string Art = "Assets/Archive/Runtime/Story/Art/";
        internal static void Sync()
        {
            string root = Path.GetFullPath(Path.Combine(Application.dataPath, "../../public/assets/chapter-art"));
            Directory.CreateDirectory(Source);
            foreach (string name in new[] { "cloth.jpg", "linen.jpg", "leather.jpg", "walnut.jpg", "archive-scribe.glb", "ink-apparition.glb" })
            {
                string dest = Source + name, from = Path.Combine(root, name);
                if (File.Exists(dest) && File.ReadAllBytes(from).SequenceEqual(File.ReadAllBytes(dest))) continue;
                File.Copy(from, dest, true);
                AssetDatabase.ImportAsset(dest, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
            }
        }

        internal static void AddInkModel(ChapterInk ink)
        {
            string path = Source + "ink-apparition.glb";
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (!model) throw new InvalidDataException("Could not import " + path);
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(model, ink.transform);
            ink.visual = instance.transform;
            ink.visual.localRotation = Quaternion.Euler(0, 180, 0);
            ink.legacy = instance.GetComponentInChildren<Animation>(true);
            if (ink.legacy)
            {
                ink.legacy.playAutomatically = false;
                foreach (AnimationState state in ink.legacy)
                    state.wrapMode = state.name == "Glide" || state.name == "Hover" || state.name == "Stagger" ? WrapMode.Loop : WrapMode.ClampForever;
                return;
            }
            var clips = AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().Where(c => !c.legacy).ToArray();
            if (clips.Length == 0) throw new InvalidDataException("Apparition GLB has no imported animation clips.");
            var animator = instance.GetComponentInChildren<Animator>(true);
            if (!animator) animator = instance.AddComponent<Animator>();
            string controllerPath = "Assets/Archive/Generated/ChapterInk.controller";
            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
            if (!controller) controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            var stateMachine = controller.layers[0].stateMachine;
            foreach (var clip in clips)
            {
                var state = stateMachine.states.Select(x => x.state).FirstOrDefault(s => s.name == clip.name);
                if (!state) state = stateMachine.AddState(clip.name);
                state.motion = clip;
                if (clip.name == "Hover") stateMachine.defaultState = state;
            }
            animator.runtimeAnimatorController = controller;
            animator.applyRootMotion = false;
            ink.animator = animator;
        }
    }
}
