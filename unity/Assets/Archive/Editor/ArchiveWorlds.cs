using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using Archive.Arena;
using Archive.World;
using UnityEditor;
using UnityEngine;

namespace Archive.Editor
{
    public static class ArchiveWorlds
    {
        const string Staged = "Assets/Archive/Generated/Source/";
        public static void Build(ChapterPlayer player)
        {
            var castle = AssetDatabase.LoadAssetAtPath<GameObject>(Staged + "fortress.archivecitadel");
            if (!castle)
                throw new InvalidDataException(
                    "Missing fortress prefab imported from asset-sources/Art/Chapter1/unity-citadel.json.gz");
            var fortress = (GameObject)PrefabUtility.InstantiatePrefab(castle);
            Physics.SyncTransforms();
            var survey = JObject.Parse(File.ReadAllText(
                Path.Combine(Application.dataPath, "../../shared/levels/fortress-exterior.json")));
            Vector3 Vec(JToken token) => new Vector3((float)token[0], (float)token[1], (float)token[2]);
            Vector3 offset = Vec(survey["chapterJoin"]["offset"]);
            void CheckGround(Vector3 expected)
            {
                var hits = Physics.RaycastAll(expected + Vector3.up * .65f, Vector3.down, 1.2f, 1 << 8);
                if (!hits.Any(hit => Mathf.Abs(hit.point.y - expected.y) < .11f && hit.normal.y > .66f))
                    throw new InvalidDataException("No walkable castle surface at " + expected);
            }
            CheckGround(offset + Vec(survey["arrival"]["spawn"]));
            foreach (JToken station in survey["bridge"]["stations"])
                CheckGround(offset + Vec(station));
            foreach (JToken station in survey["stairs"]["stations"])
                CheckGround(offset + Vec(station));
            Debug.Log("Archive: arrival, bridge and stair survey ground contacts passed.");
            var encounter = player.gameObject.AddComponent<LookoutEncounter>();
            encounter.lookout = fortress.GetComponent<CitadelRestoration>().lookout;
            encounter.creature = (GameObject)PrefabUtility.InstantiatePrefab(
                AssetDatabase.LoadAssetAtPath<GameObject>(Staged + "outer-leviathan.glb"));
            encounter.swim = AssetDatabase.LoadAllAssetsAtPath(Staged + "outer-leviathan.glb")
                                 .OfType<AnimationClip>()
                                 .FirstOrDefault(c => c.name.Contains("VoidSwim"));
            const string shellPath = "Assets/Archive/Generated/void-carapace.mat";
            var shell = AssetDatabase.LoadAssetAtPath<Material>(shellPath);
            if (!shell)
            {
                shell = new Material(Shader.Find("Archive/Void Carapace"));
                AssetDatabase.CreateAsset(shell, shellPath);
            }
            foreach (var r in encounter.creature.GetComponentsInChildren<Renderer>(true))
                r.sharedMaterials = r.sharedMaterials
                                        .Select(
                                            _ => shell)
                                        .ToArray();
            encounter.creature.SetActive(false);
            var sky = AssetDatabase.LoadAssetAtPath<Material>("Assets/Archive/Generated/stellar-night.mat");
            if (!sky)
            {
                sky = new Material(Shader.Find("Archive/Starry Night"));
                AssetDatabase.CreateAsset(sky, "Assets/Archive/Generated/stellar-night.mat");
            }
            RenderSettings.skybox = sky;
            var lens = player.GetComponentInChildren<Camera>(true);
            lens.clearFlags = CameraClearFlags.Skybox;
            lens.farClipPlane = 180;
            var starlight = new GameObject("Stellar light").AddComponent<Light>();
            starlight.type = LightType.Directional;
            starlight.color = new Color(.61f, .74f, 1);
            starlight.intensity = .19f;
            starlight.cullingMask = 1 << 8;
            starlight.transform.rotation = Quaternion.Euler(52, -37, 0);
            var arena = player.gameObject.AddComponent<ArchiveArena>();
            arena.gothic = AssetDatabase.LoadAssetAtPath<GameObject>(Staged + "gothic-arena.glb");
            arena.guard = AssetDatabase.LoadAssetAtPath<GameObject>(
                "Assets/Archive/Generated/Resources/ArchivePlayer/Scribe.prefab");
            arena.pistol = AssetDatabase.LoadAssetAtPath<GameObject>(Staged + "blaster-j.glb");
            arena.rifle = AssetDatabase.LoadAssetAtPath<GameObject>(Staged + "blaster-a.glb");
            arena.specter = AssetDatabase.LoadAssetAtPath<GameObject>(Staged + "ink-apparition.glb");
            arena.paving = AssetDatabase.LoadAssetAtPath<Texture2D>(Staged + "flagstone.jpg");
            arena.masonry = AssetDatabase.LoadAssetAtPath<Texture2D>(Staged + "ashlar.jpg");
            if (!arena.gothic || !arena.guard || !arena.specter || !arena.rifle || !arena.pistol)
                throw new InvalidDataException("Missing arena models");
            ArenaValidation.Check();
        }
    }
}
