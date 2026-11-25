using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Archive.Editor
{
    internal static class PlayerAssets
    {
        const string ResourcesDir = "Assets/Archive/Generated/Resources/ArchivePlayer";
        const string RigDir = "Assets/Archive/Generated/PlayerRig";
        static string Source(string path) => Path.GetFullPath(Path.Combine(Application.dataPath,
                                                                           "../../public/assets", path));

        public static void Sync()
        {
            Directory.CreateDirectory(ResourcesDir);
            Directory.CreateDirectory(RigDir);
            foreach (string path in new[] { "arcane/vesper-quill.glb", "arcane/dawn-folio.glb",
                                            "sounds/forceField_000.ogg", "sounds/laserLarge_000.ogg",
                                            "sounds/laserSmall_000.ogg" })
            {
                string to = ResourcesDir + "/" + Path.GetFileName(path), source = Source(path);
                if (!File.Exists(to) || !File.ReadAllBytes(to).SequenceEqual(File.ReadAllBytes(source)))
                    File.Copy(source, to, true);
            }
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            Clothing("ScribeLeather", "leather", new Color(.875f, .71f, .592f), .34f);
            Clothing("ScribeLinen", "linen", new Color(.831f, .769f, .675f), .05f);
            foreach (string clip in new[] { "forceField_000", "laserLarge_000", "laserSmall_000" })
            {
                var importer = (AudioImporter)AssetImporter.GetAtPath(ResourcesDir + "/" + clip + ".ogg");
                var settings = importer.defaultSampleSettings;
                if (!settings.preloadAudioData)
                {
                    settings.preloadAudioData = true;
                    importer.defaultSampleSettings = settings;
                    importer.SaveAndReimport();
                }
            }
            string rigPath = ResourcesDir + "/Scribe.prefab";
            string stamp = RigDir + "/bake.version";
            // Include both source bytes and the importer revision; avoid rebaking the rig on every scene build.
            string version =
                "4:" +
                Hash128.Compute(
                    Convert.ToBase64String(File.ReadAllBytes(Source("characters/dummy3.babylon")))) +
                ":" +
                Hash128.Compute(
                    Convert.ToBase64String(File.ReadAllBytes(Source("characters/ybot-postures.glb"))));
            if (File.Exists(rigPath) && File.Exists(stamp) && File.ReadAllText(stamp) == version)
                return;
            var data = JObject.Parse(File.ReadAllText(Source("characters/dummy3.babylon")));
            var skin = data["meshes"].First(x => x["positions"]?.HasValues == true);
            var skeleton = data["skeletons"][0];
            var root = new GameObject("Scribe");
            try
            {
                var bones = (JArray)skeleton["bones"];
                var nodes = new Transform[bones.Count];
                for (int i = 0; i < nodes.Length; i++)
                {
                    var bone = bones[i];
                    var node = nodes[i] = new GameObject((string)bone["name"]).transform;
                    int parent = (int)bone["parentBoneIndex"];
                    node.SetParent(parent < 0 ? root.transform : nodes[parent], false);
                    Matrix4x4 bind = Matrix(bone["matrix"]);
                    node.localPosition = bind.GetColumn(3);
                    node.localRotation = bind.rotation;
                    node.localScale = bind.lossyScale;
                }
                var renderer = root.AddComponent<SkinnedMeshRenderer>();
                renderer.sharedMesh = SaveMesh(skin, nodes);
                renderer.bones = nodes;
                renderer.rootBone = nodes[0];
                renderer.localBounds = new Bounds(Vector3.up * 0.9f, new Vector3(3, 3, 3));
                renderer.sharedMaterials =
                    data["materials"]
                        .Select(m =>
                                {
                                    string path = RigDir + "/" + (string)m["name"] + ".mat";
                                    var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
                                    if (!mat)
                                    {
                                        mat = new Material(Shader.Find("Standard"));
                                        AssetDatabase.CreateAsset(mat, path);
                                    }
                                    var c = m["diffuse"];
                                    mat.color = new Color((float)c[0], (float)c[1], (float)c[2]);
                                    return mat;
                                })
                        .ToArray();
                var anim = root.AddComponent<Animation>();
                anim.playAutomatically = false;
                var clips = StandingClips(root, nodes, bones, skeleton["ranges"]);
                clips.AddRange(PostureClips(root, nodes));
                foreach (var clip in clips)
                    anim.AddClip(clip, clip.name);
                anim.clip = clips[0];
                PrefabUtility.SaveAsPrefabAsset(root, rigPath);
                AssetDatabase.SaveAssets();
                File.WriteAllText(stamp, version);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        // Use the same imported leather and linen textures as the world, without duplicating source images.
        static void Clothing(string name, string source, Color tint, float gloss)
        {
            string path = ResourcesDir + "/" + name + ".mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (!material)
            {
                material = new Material(Shader.Find("Standard"));
                AssetDatabase.CreateAsset(material, path);
            }
            var texture =
                AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Archive/Generated/Source/" + source + ".jpg");
            if (!texture)
                throw new FileNotFoundException("Missing clothing texture " + source);
            material.mainTexture = texture;
            material.color = tint;
            material.SetFloat("_Glossiness", gloss);
            EditorUtility.SetDirty(material);
        }

        static Matrix4x4 Matrix(JToken array)
        {
            var m = new Matrix4x4();
            for (int i = 0; i < 16; i++)
                m[i] = (float)array[i];
            return m;
        }

        static Mesh SaveMesh(JToken src, Transform[] bones)
        {
            string path = RigDir + "/skin.asset";
            var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (!mesh)
            {
                mesh = new Mesh { name = "Scribe skin" };
                AssetDatabase.CreateAsset(mesh, path);
            }
            else
                mesh.Clear();
            var p = src["positions"].ToObject<float[]>();
            var n = src["normals"].ToObject<float[]>();
            var uv = src["uvs"].ToObject<float[]>();
            var indices = src["indices"].ToObject<int[]>();
            var js = src["matricesIndices"].ToObject<uint[]>();
            var ws = src["matricesWeights"].ToObject<float[]>();
            var verts = new Vector3[p.Length / 3];
            var normals = new Vector3[verts.Length];
            var uvs = new Vector2[verts.Length];
            var weights = new BoneWeight[verts.Length];
            for (int i = 0; i < verts.Length; i++)
            {
                verts[i] = new Vector3(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
                normals[i] = new Vector3(n[3 * i], n[3 * i + 1], n[3 * i + 2]);
                uvs[i] = new Vector2(uv[2 * i], uv[2 * i + 1]);
                uint j = js[i];
                weights[i] = new BoneWeight { boneIndex0 = (int)(j & 255),
                                              boneIndex1 = (int)((j >> 8) & 255),
                                              boneIndex2 = (int)((j >> 16) & 255),
                                              boneIndex3 = (int)(j >> 24),
                                              weight0 = ws[4 * i],
                                              weight1 = ws[4 * i + 1],
                                              weight2 = ws[4 * i + 2],
                                              weight3 = ws[4 * i + 3] };
            }
            mesh.vertices = verts;
            mesh.normals = normals;
            mesh.uv = uvs;
            mesh.boneWeights = weights;
            mesh.bindposes = bones.Select(b => b.worldToLocalMatrix).ToArray();
            mesh.subMeshCount = src["subMeshes"].Count();
            // Exporter order in the Babylon source is opposite Unity's front-face winding.
            for (int i = 0; i < indices.Length; i += 3)
                (indices[i + 1], indices[i + 2]) = (indices[i + 2], indices[i + 1]);
            int sub = 0;
            foreach (var s in src["subMeshes"])
                mesh.SetTriangles(indices, (int)s["indexStart"], (int)s["indexCount"], sub++);
            mesh.RecalculateBounds();
            EditorUtility.SetDirty(mesh);
            return mesh;
        }

        static AnimationClip SaveClip(string name, List<EditorCurveBinding> bindings,
                                      List<AnimationCurve> curves)
        {
            string path = RigDir + "/" + name + ".anim";
            var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(path);
            if (!clip)
            {
                clip = new AnimationClip();
                AssetDatabase.CreateAsset(clip, path);
            }
            else
                clip.ClearCurves();
            clip.name = name;
            clip.legacy = true;
            clip.frameRate = 30;
            AnimationUtility.SetEditorCurves(clip, bindings.ToArray(), curves.ToArray());
            clip.EnsureQuaternionContinuity();
            EditorUtility.SetDirty(clip);
            return clip;
        }

        static void Tracks(string path, string property, int components, float[] times, float[][] values,
                           List<EditorCurveBinding> bindings, List<AnimationCurve> curves)
        {
            for (int axis = 0; axis < components; axis++)
            {
                var keys = new Keyframe[times.Length];
                for (int i = 0; i < keys.Length; i++)
                {
                    float before =
                        i == 0 ? 0 : (values[i][axis] - values[i - 1][axis]) / (times[i] - times[i - 1]);
                    float after = i + 1 == keys.Length
                                      ? 0
                                      : (values[i + 1][axis] - values[i][axis]) / (times[i + 1] - times[i]);
                    keys[i] = new Keyframe(times[i], values[i][axis], before, after);
                }
                bindings.Add(
                    EditorCurveBinding.FloatCurve(path, typeof(Transform), property + "." + "xyzw"[axis]));
                curves.Add(new AnimationCurve(keys));
            }
        }
        static List<AnimationClip> StandingClips(GameObject root, Transform[] nodes, JArray bones,
                                                 JToken ranges)
        {
            var clips = new List<AnimationClip>();
            foreach (var range in ranges)
            {
                int from = (int)range["from"], to = (int)range["to"], count = to - from + 1;
                var bindings = new List<EditorCurveBinding>();
                var curves = new List<AnimationCurve>();
                for (int j = 0; j < bones.Count; j++)
                {
                    string path = AnimationUtility.CalculateTransformPath(nodes[j], root.transform);
                    var animation = bones[j]["animation"];
                    var keys = animation["keys"];
                    float fps = (float)animation["framePerSecond"];
                    var times = new float[count];
                    var pos = new float [count][];
                    var rot = new float [count][];
                    for (int i = 0; i < count; i++)
                    {
                        var m = Matrix(keys[from + i]["values"]);
                        var v = m.GetColumn(3);
                        var q = m.rotation;
                        times[i] = i / fps;
                        pos[i] = new[] { v.x, v.y, v.z };
                        rot[i] = new[] { q.x, q.y, q.z, q.w };
                    }
                    Tracks(path, "m_LocalPosition", 3, times, pos, bindings, curves);
                    Tracks(path, "m_LocalRotation", 4, times, rot, bindings, curves);
                }
                clips.Add(SaveClip((string)range["name"], bindings, curves));
            }
            return clips;
        }

        static List<AnimationClip> PostureClips(GameObject root, Transform[] bones)
        {
            byte[] bytes = File.ReadAllBytes(Source("characters/ybot-postures.glb"));
            int jsonSize = BitConverter.ToInt32(bytes, 12), start = 28 + jsonSize;
            var doc = JObject.Parse(System.Text.Encoding.UTF8.GetString(bytes, 20, jsonSize));
            float[][] Values(int index, int components)
            {
                var a = doc["accessors"][index];
                var v = doc["bufferViews"][(int)a["bufferView"]];
                int offset=start+((int?)a["byteOffset"]??0)+((int?)v["byteOffset"]??0),count=(int)a["count"];
                var result = new float [count][];
                for (int i = 0; i < count; i++)
                {
                    result[i] = new float[components];
                    Buffer.BlockCopy(bytes, offset + i * 4 * components, result[i], 0, 4 * components);
                }
                return result;
            }
            var paths = bones.ToDictionary(b => b.name,
                                           b => AnimationUtility.CalculateTransformPath(b, root.transform));
            var clips = new List<AnimationClip>();
            foreach (var anim in doc["animations"])
            {
                var bindings = new List<EditorCurveBinding>();
                var curves = new List<AnimationCurve>();
                foreach (var ch in anim["channels"])
                {
                    var target = ch["target"];
                    bool rot = (string)target["path"] == "rotation";
                    string path = paths[(string)doc["nodes"][(int)target["node"]]["name"]];
                    var s = anim["samplers"][(int)ch["sampler"]];
                    var times = Values((int)s["input"], 1).Select(x => x[0]).ToArray();
                    var vals = Values((int)s["output"], rot ? 4 : 3);
                    foreach (var value in vals)
                    {
                        if (rot)
                        {
                            value[0] *= -1;
                            value[1] *= -1;
                        }
                        else
                            value[2] *= -1;
                    }
                    Tracks(path, rot ? "m_LocalRotation" : "m_LocalPosition", rot ? 4 : 3, times, vals,
                           bindings, curves);
                }
                clips.Add(SaveClip((string)anim["name"], bindings, curves));
            }
            return clips;
        }
    }
}
