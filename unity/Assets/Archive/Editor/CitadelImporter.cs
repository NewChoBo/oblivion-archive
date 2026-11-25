using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using Archive.World;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.Rendering;

namespace Archive.Editor
{
    [ScriptedImporter(1, "archivecitadel")]
    public class CitadelImporter : ScriptedImporter
    {
        const string Source = "Assets/Archive/Generated/Source/";
        static Vector3 V(float[] a, int i) => new(a[i], a[i + 1], a[i + 2]);
        static FreightPose Pose(JToken token)
        {
            var a = token.Values<float>().ToArray();
            return new FreightPose { position = V(a, 0), rotation = new Quaternion(a[3], a[4], a[5], a[6]),
                                     scale = V(a, 7) };
        }
        static readonly Dictionary<string, int> WindowPhases = new() { { "gateLight", 1 },
                                                                       { "binderyLight", 2 },
                                                                       { "libraryLight", 3 },
                                                                       { "dockLight", 4 },
                                                                       { "roseLight", 5 } };
        public override void OnImportAsset(AssetImportContext ctx)
        {
            using var source = File.OpenRead(ctx.assetPath);
            using var gzip = new GZipStream(source, CompressionMode.Decompress);
            using var reader = new StreamReader(gzip);
            var data = JObject.Parse(reader.ReadToEnd());
            if ((int)data["version"] != 1)
                throw new InvalidDataException("Unknown citadel mesh format");
            var root = new GameObject("The Star-Crossing Citadel");
            var restoration = root.AddComponent<CitadelRestoration>();
            root.layer = 8;
            var bounds = data["lookout"];
            // On editor upgrade Unity may import the previous local bake once before Sync replaces it.
            if (bounds != null)
                restoration.lookout =
                    new Vector3(((float)bounds[0][0] + (float)bounds[0][1]) * .5f, (float)bounds[1][0],
                                ((float)bounds[2][0] + (float)bounds[2][1]) * .5f);
            foreach (var lamp in data["lamps"] ?? new JArray())
            {
                var light = new GameObject("Beacon light").AddComponent<Light>();
                light.transform.SetParent(root.transform, false);
                light.transform.localPosition = V(lamp["position"].Values<float>().ToArray(), 0);
                light.range = (float)lamp["range"];
                light.intensity = (float)lamp["intensity"] * .55f;
                light.color = new Color(1, .81f, .59f);
                light.type = LightType.Point;
            }
            var reveals = new List<RestorationPart>();
            var windows = new List<RestorationWindow>();
            var freight = new List<FreightTrack>();
            var materials = new Dictionary<string, Material>();
            var slots = JObject.Parse(File.ReadAllText(Source + "citadel-materials.json"));
            ctx.DependsOnSourceAsset(Source + "citadel-materials.json");
            Texture2D Texture(JToken path)
            {
                if (path == null)
                    return null;
                string staged = Source + Path.GetFileName((string)path);
                ctx.DependsOnArtifact(staged);
                return AssetDatabase.LoadAssetAtPath<Texture2D>(staged);
            }
            foreach (var item in ((JObject)data["colors"]).Properties())
            {
                string id = item.Name;
                var mat = new Material(Shader.Find("Standard")) { name = "Citadel " + id };
                var slot = slots[id];
                ColorUtility.TryParseHtmlString((string)item.Value, out Color baseColor);
                mat.color =
                    slot == null ? baseColor : Color.Lerp(baseColor, Color.white, id == "cloth" ? .1f : .6f);
                mat.mainTexture = Texture(slot?["albedo"]);
                if (slot?["normal"] != null)
                {
                    mat.EnableKeyword("_NORMALMAP");
                    mat.SetTexture("_BumpMap", Texture(slot["normal"]));
                    mat.SetFloat("_BumpScale", .5f);
                }
                mat.SetFloat("_Metallic", id == "gold" ? .53f : 0);
                mat.SetFloat("_Glossiness", id == "gold" ? .54f : .16f);
                if (slot?["emissive"] != null || id == "glass")
                {
                    mat.EnableKeyword("_EMISSION");
                    mat.SetTexture("_EmissionMap", Texture(slot?["emissive"]));
                    mat.SetColor("_EmissionColor", new Color(.5f, .21f, .044f));
                }
                ctx.AddObjectToAsset("material-" + id, mat);
                materials.Add(id, mat);
            }
            int index = 0;
            foreach (var part in data["parts"])
            {
                var obj = new GameObject((string)part["name"]);
                obj.layer = 8;
                obj.transform.SetParent(root.transform, false);
                var start = Pose(part["pose"]);
                obj.transform.SetLocalPositionAndRotation(start.position, start.rotation);
                obj.transform.localScale = start.scale;
                var mesh = ReadMesh(part);
                ctx.AddObjectToAsset("surface-" + index++, mesh);
                if ((bool)part["visible"])
                {
                    obj.AddComponent<MeshFilter>().sharedMesh = mesh;
                    var renderer = obj.AddComponent<MeshRenderer>();
                    string id = (string)part["material"];
                    renderer.sharedMaterial = materials[id];
                    if (WindowPhases.TryGetValue(id, out int at))
                        windows.Add(new RestorationWindow { target = renderer, phase = at,
                                                            tint = materials[id].color });
                }
                if ((bool)part["collision"])
                    obj.AddComponent<MeshCollider>().sharedMesh = mesh;
                if ((int)part["phase"] > 0)
                    reveals.Add(new RestorationPart { target = obj, phase = (int)part["phase"] });
                if (part["motion"] is JArray keys)
                    freight.Add(new FreightTrack { part = obj.transform, keys = keys.Select(Pose).ToArray() });
            }
            restoration.duration = (float)data["duration"];
            restoration.reveals = reveals.ToArray();
            restoration.windows = windows.ToArray();
            restoration.freight = freight.ToArray();
            ctx.AddObjectToAsset("citadel", root);
            ctx.SetMainObject(root);
        }
        static Mesh ReadMesh(JToken part)
        {
            var positions = part["positions"].Values<float>().ToArray();
            var n = part["normals"].Values<float>().ToArray();
            var t = part["uv"].Values<float>().ToArray();
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uv = new List<Vector2>();
            for (int i = 0; i < positions.Length / 3; i++)
            {
                vertices.Add(V(positions, 3 * i));
                normals.Add(V(n, 3 * i));
                uv.Add(t.Length == 0 ? Vector2.zero : new Vector2(t[2 * i], t[2 * i + 1]));
            }
            var indices = part["indices"].Values<int>().ToList();
            // Match Unity front faces to the authored outward normals, including reversed arch reveals.
            for (int i = 0; i < indices.Count; i += 3)
            {
                int a = indices[i], b = indices[i + 1], c = indices[i + 2];
                if (Vector3.Dot(Vector3.Cross(vertices[b] - vertices[a], vertices[c] - vertices[a]),
                                normals[a] + normals[b] + normals[c]) < 0)
                {
                    indices[i + 1] = c;
                    indices[i + 2] = b;
                }
            }
            if ((bool)part["doubleSided"])
            {
                int count = vertices.Count, sides = indices.Count;
                vertices.AddRange(vertices.ToArray());
                normals.AddRange(normals.Select(v => -v).ToArray());
                uv.AddRange(uv.ToArray());
                for (int i = 0; i < sides; i += 3)
                {
                    indices.Add(indices[i] + count);
                    indices.Add(indices[i + 2] + count);
                    indices.Add(indices[i + 1] + count);
                }
            }
            var mesh =
                new Mesh { name = (string)part["name"],
                           indexFormat = vertices.Count > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uv);
            mesh.SetTriangles(indices, 0);
            mesh.RecalculateTangents();
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
