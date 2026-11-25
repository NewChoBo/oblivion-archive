using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace Archive.Editor
{
    public sealed partial class ChapterSceneBuilder
    {
        const string Generated = "Assets/Archive/Generated";
        const string ScenePath = Generated + "/ChapterOne.unity";
        readonly Dictionary<string, Material> materials = new();
        readonly HashSet<Material> metricMaterials = new();
        readonly Dictionary<Vector3, Mesh> boxMeshes = new();
        readonly Dictionary<string, GameObject> placed = new();
        readonly JObject plan = Read("shared/levels/chapter-1.json");
        readonly JObject catalog = Read("shared/levels/environment-prefabs.json");
        readonly float plinthShift = (float)Read("asset-sources/Art/Chapter1/work-layout.json")["corridor"]["plinthShiftZ"];

        static JObject Read(string path) => JObject.Parse(File.ReadAllText(Path.Combine(Application.dataPath, "../..", path)));
        static Vector3 V(JToken values) => values == null ? Vector3.zero :
            new Vector3((float)values[0], (float)values[1], (float)values[2]);

        [MenuItem("Archive/Rebuild Chapter One")]
        public static void Create() => TryCreate();

        internal static bool TryCreate()
        {
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return false;
            ChapterAssets.Sync();
            StoryAssets.Sync();
            Directory.CreateDirectory(Generated);
            AssetDatabase.Refresh();
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var chapter = new ChapterSceneBuilder();
            chapter.Populate();
            chapter.CheckPassage();
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
                throw new IOException("Could not save " + ScenePath);
            var others = EditorBuildSettings.scenes.Where(s => s.path != ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) }.Concat(others).ToArray();
            AssetDatabase.SaveAssets();
            return true;
        }

        void CheckPassage()
        {
            // Test the built colliders. A convex hull can close the arch even with correct mesh bounds.
            Physics.SyncTransforms();
            var wall = placed["reading-arch-wall"].GetComponent<MeshCollider>();
            JToken frame = plan["doorFrames"]["north-arch"];
            float center = (float)frame["center"], width = (float)frame["width"];
            float z = wall.bounds.min.z - 0.5f, depth = wall.bounds.size.z + 1;
            var body = Object.FindAnyObjectByType<ChapterPlayer>().GetComponent<CharacterController>();
            var start = new Vector3(center, body.skinWidth, z);
            if (Physics.CapsuleCastAll(start + Vector3.up * body.radius,
                    start + Vector3.up * (body.height - body.radius), body.radius,
                    Vector3.forward, depth, ~0, QueryTriggerInteraction.Ignore)
                .Any(hit => !hit.transform.IsChildOf(placed["north-door"].transform)))
                throw new InvalidDataException("Standing clearance is blocked in the reading room arch.");
            var pier = start + Vector3.up + Vector3.right * (width * 0.5f + 0.1f);
            if (!wall.Raycast(new Ray(pier, Vector3.forward), out _, depth))
                throw new InvalidDataException("The right pier of the reading room arch lacks collision.");
            foreach (var probe in new[] { new Vector2(11, 10.3f), new Vector2(13, 10),
                         new Vector2(15.4f, 7.12f), new Vector2(15.4f, 5.45f), new Vector2(11, 5.45f),
                         new Vector2(9.45f, 5.45f), new Vector2(8.375f, 5.4f) })
                if (!Physics.Raycast(new Vector3(probe.x, .15f, probe.y), Vector3.down, .36f, ~0,
                        QueryTriggerInteraction.Ignore))
                    throw new InvalidDataException("No floor under the authored chapter route at " + probe);
        }

        void Populate()
        {
            foreach (JProperty item in ((JObject)catalog["materials"]).Properties())
            {
                JToken definition = item.Value;
                string textureName = Path.GetFileName((string)definition["albedo"]?["path"]);
                var finish = NewMaterial(item.Name, (string)definition["color"], textureName);
                finish.SetFloat("_Glossiness", 1 - (float)definition["roughness"]);
                finish.SetFloat("_Metallic", (float?)definition["metallic"] ?? 0);
                if (definition["albedo"]?["repeat"] is JArray repeat)
                    finish.mainTextureScale = new Vector2((float)repeat[0], (float)repeat[1]);
            }
            foreach (JToken surface in catalog["tiledSurfaces"])
            foreach (string key in surface["materials"].Values<string>())
            {
                if (!materials.TryGetValue(key, out Material finish)) continue;
                var texture = SourceTexture(Path.GetFileName((string)surface["path"]));
                if (!texture) continue;
                finish.mainTexture = texture;
                finish.mainTextureScale = Vector2.one / (float)surface["tileMeters"];
                metricMaterials.Add(finish);
                if (ColorUtility.TryParseHtmlString((string)surface["tint"], out Color tint)) finish.color = tint;
            }

            foreach (string zone in new[] { "readingRoom", "readingShelves", "corridor", "vault", "shortcut" })
            {
                Transform group = new GameObject(zone).transform;
                foreach (JObject placement in plan["zones"][zone]) Place(placement, group);
            }
            Physics.SyncTransforms();
            // In the full citadel, the archive district supplies the floor past the corridor tile.
            // Fill only the uncovered extent bounded by the same floor and authored vault walls.
            Bounds corridor = placed["corridor-floor"].GetComponentInChildren<BoxCollider>().bounds;
            Bounds gateWall = placed["corridor-vault-wall"].GetComponentInChildren<MeshCollider>().bounds;
            Bounds vaultNorth = placed["vault-wall-north"].GetComponentInChildren<BoxCollider>().bounds;
            Bounds westWall = placed["vault-wall-west"].GetComponentInChildren<BoxCollider>().bounds;
            Bounds eastWall = placed["vault-wall-east"].GetComponentInChildren<MeshCollider>().bounds;
            BlockFromEdges("corridor-archive-floor", corridor.max.x, gateWall.max.x, corridor.min.z, corridor.max.z);
            BlockFromEdges("vault-floor", gateWall.max.x, vaultNorth.min.x, eastWall.max.z, westWall.min.z);
            BlockFromEdges("return-passage-floor", 9.5f, 16.7f, 4.35f, eastWall.max.z);
            CreatePlayerAndTargets();
            SetLights();
        }

        static Texture2D SourceTexture(string name) => string.IsNullOrEmpty(name) ? null :
            AssetDatabase.LoadAssetAtPath<Texture2D>(Generated + "/Source/" + name);

        Material NewMaterial(string id, string html, string textureName = null)
        {
            string path = Generated + "/" + id + ".mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (!mat)
            {
                mat = new Material(Shader.Find("Standard"));
                AssetDatabase.CreateAsset(mat, path);
            }
            if (!ColorUtility.TryParseHtmlString(html, out Color color))
                throw new InvalidDataException("Invalid color for " + id);
            mat.color = color;
            mat.mainTexture = SourceTexture(textureName);
            mat.mainTextureScale = Vector2.one;
            EditorUtility.SetDirty(mat);
            materials.Add(id, mat);
            return mat;
        }

        static Bounds BoundsOf(JToken data)
        {
            var min = new Vector3((float)data[0][0], (float)data[1][0], (float)data[2][0]);
            var max = new Vector3((float)data[0][1], (float)data[1][1], (float)data[2][1]);
            var bounds = new Bounds();
            bounds.SetMinMax(min, max);
            return bounds;
        }

        GameObject Box(string name, Transform parent, Vector3 position, Vector3 size, Material material, bool solid)
        {
            var obj = GameObject.CreatePrimitive(PrimitiveType.Cube);
            obj.name = name;
            obj.transform.SetParent(parent, false);
            obj.transform.localPosition = position;
            obj.transform.localScale = size;
            if (!solid) Object.DestroyImmediate(obj.GetComponent<BoxCollider>());
            obj.GetComponent<MeshRenderer>().sharedMaterial = material;
            if (metricMaterials.Contains(material))
            {
                MeshFilter filter = obj.GetComponent<MeshFilter>();
                if (!boxMeshes.TryGetValue(size, out Mesh mesh))
                {
                    string dimension(float value) => value.ToString("0.######", CultureInfo.InvariantCulture);
                    string key = $"box-{dimension(size.x)}x{dimension(size.y)}x{dimension(size.z)}";
                    string path = Generated + "/" + key + ".asset";
                    mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
                    if (!mesh)
                    {
                        mesh = Object.Instantiate(filter.sharedMesh);
                        mesh.name = key;
                        Vector3[] vertices = mesh.vertices, normals = mesh.normals;
                        var uvs = new Vector2[vertices.Length];
                        for (int i = 0; i < uvs.Length; i++)
                        {
                            Vector3 p = Vector3.Scale(vertices[i], size);
                            uvs[i] = Mathf.Abs(normals[i].x) > 0.5f ? new Vector2(p.z, p.y) :
                                Mathf.Abs(normals[i].y) > 0.5f ? new Vector2(p.x, p.z) : new Vector2(p.x, p.y);
                        }
                        mesh.uv = uvs;
                        AssetDatabase.CreateAsset(mesh, path);
                    }
                    boxMeshes.Add(size, mesh);
                }
                filter.sharedMesh = mesh;
            }
            return obj;
        }

        void BlockFromEdges(string id, float left, float right, float near, float far)
        {
            Box(id, null, new Vector3((left + right) / 2, -0.1f, (near + far) / 2),
                new Vector3(right - left, 0.2f, far - near), materials["chapterFloor"], true);
        }

        void Place(JObject placement, Transform group)
        {
            string id = (string)placement["id"], kind = (string)placement["prefab"];
            JToken definition = catalog["prefabs"][kind];
            var root = new GameObject(id).transform;
            root.SetParent(group, false);
            root.position = V(placement["position"]);
            if (kind == "rune-plinth") root.position += Vector3.forward * plinthShift;
            root.localRotation = Quaternion.Euler(0, (float?)placement["heading"] ?? 0, 0);
            placed.Add(id, root.gameObject);
            foreach (JToken part in definition["parts"])
            {
                var material = materials[(string)part["material"] ?? "wood"];
                if (placement["bounds"] != null)
                {
                    BuildWallOrSlab(root, placement, BoundsOf(placement["bounds"]), material);
                    continue;
                }
                var size = V(placement["size"] ?? part["size"]);
                Vector3 offset = V(part["offset"]);
                if ((string)part["shape"] == "ground")
                {
                    size.y = 0.2f;
                    offset.y -= size.y / 2;
                }
                if (definition["model"] != null)
                {
                    var collider = root.gameObject.AddComponent<BoxCollider>();
                    collider.size = size;
                    string file = Path.GetFileName((string)definition["model"]["path"]);
                    var model = AssetDatabase.LoadAssetAtPath<GameObject>(Generated + "/Source/" + file);
                    if (model)
                    {
                        Transform visual = ((GameObject)PrefabUtility.InstantiatePrefab(model, root)).transform;
                        visual.localPosition = Vector3.down * (size.y / 2);
                        visual.localRotation = Quaternion.Euler(0, (float?)placement["model"]?["yawDegrees"] ?? 0, 0);
                        visual.localScale = (bool?)definition["model"]["fitToBox"] == true ? size :
                            placement["model"]?["scale"] is JArray scale ? V(scale) : Vector3.one;
                    }
                    else
                    {
                        Debug.LogWarning("Using the plan dimensions for missing model: " + file);
                        Box("Blockout", root, Vector3.zero, size, material, false);
                    }
                }
                else Box((string)part["name"] ?? kind, root, offset, size, material, (bool?)part["collision"] == true);
            }
        }

        void BuildWallOrSlab(Transform root, JObject placement, Bounds bounds, Material material)
        {
            bool alongX = (string)placement["openingAxis"] == "x";
            if (placement["frame"] != null)
            {
                JToken frame = plan["doorFrames"][(string)placement["frame"]];
                Mesh mesh = ChapterGeometry.FramedWall(bounds, alongX, (float)frame["center"], (float)frame["width"],
                    (float)frame["spring"], (float?)frame["rise"] ?? 0, (string)frame["shape"]);
                string path = Generated + "/" + root.name + ".asset";
                mesh.name = root.name;
                var previous = AssetDatabase.LoadAssetAtPath<Mesh>(path);
                if (previous)
                {
                    EditorUtility.CopySerialized(mesh, previous);
                    Object.DestroyImmediate(mesh);
                    EditorUtility.SetDirty(previous);
                    mesh = previous;
                }
                else AssetDatabase.CreateAsset(mesh, path);
                root.gameObject.AddComponent<MeshFilter>().sharedMesh = mesh;
                root.gameObject.AddComponent<MeshRenderer>().sharedMaterial = material;
                root.gameObject.AddComponent<MeshCollider>().sharedMesh = mesh;
                return;
            }
            var sections = new List<Bounds> { bounds };
            if (placement["openings"] is JArray openings)
            {
                int axis = alongX ? 0 : 2;
                foreach (JToken opening in openings)
                {
                    var next = new List<Bounds>();
                    foreach (var section in sections)
                    {
                        Vector3 min = section.min, max = section.max;
                        float left = Mathf.Max(min[axis], (float)opening["span"][0]);
                        float right = Mathf.Min(max[axis], (float)opening["span"][1]);
                        float bottom = Mathf.Max(min.y, (float)opening["height"][0]);
                        float top = Mathf.Min(max.y, (float)opening["height"][1]);
                        if (left >= right || bottom >= top) { next.Add(section); continue; }
                        void Add(float a, float b, float low, float high)
                        {
                            if (a >= b || low >= high) return;
                            Vector3 v = min, w = max;
                            v[axis] = a; w[axis] = b; v.y = low; w.y = high;
                            next.Add(new Bounds((v + w) / 2, w - v));
                        }
                        Add(min[axis], left, min.y, max.y);
                        Add(right, max[axis], min.y, max.y);
                        Add(left, right, min.y, bottom);
                        Add(left, right, top, max.y);
                    }
                    sections = next;
                }
            }
            foreach (Bounds section in sections)
                Box("Surface", root, section.center, section.size, material, true);
        }

        void CreatePlayerAndTargets()
        {
            var desk = placed["reading-counter"].transform;
            var frame = Box("Faded photograph", desk, new Vector3(0.1f, 1f, 0),
                new Vector3(0.75f, 0.58f, 0.06f), materials["chestHardware"], true);
            Texture photo = AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Archive/Art/archive-photo-erased.png");
            if (!photo) throw new FileNotFoundException("The faded photograph must be available to build Chapter One.");
            var print = NewMaterial("erased-print", "#ffffff");
            print.mainTexture = photo;
            var face = GameObject.CreatePrimitive(PrimitiveType.Quad);
            face.name = "Photographic print";
            face.transform.SetParent(desk, false);
            face.transform.localPosition = new Vector3(0.1f, 1, -0.032f);
            face.transform.localScale = new Vector3(0.66f, 0.495f, 1);
            Object.DestroyImmediate(face.GetComponent<MeshCollider>());
            face.GetComponent<MeshRenderer>().sharedMaterial = print;
            var gate = placed["vault-gate"];
            Box("Vault seal", gate.transform, new Vector3(0, 0.06f, -0.17f),
                new Vector3(0.31f, 0.33f, 0.065f), NewMaterial("seal-bronze", "#a8864f"), true);

            var root = new GameObject("Player");
            root.transform.position = new Vector3(0.5f, 0.025f, -1.95f);
            var controller = root.AddComponent<CharacterController>();
            controller.height = 1.68f;
            controller.radius = 0.25f;
            controller.center = Vector3.up * 0.84f;
            controller.stepOffset = 0.32f;
            controller.skinWidth = 0.025f;
            var camera = new GameObject("Main Camera");
            camera.tag = "MainCamera";
            camera.transform.SetParent(root.transform, false);
            camera.transform.localPosition = Vector3.up * 1.56f;
            var lens = camera.AddComponent<Camera>();
            lens.clearFlags = CameraClearFlags.SolidColor;
            lens.backgroundColor = new Color(0.018f, 0.025f, 0.043f);
            lens.nearClipPlane = 0.05f;
            lens.farClipPlane = 75;
            lens.fieldOfView = 66;
            camera.AddComponent<AudioListener>();
            var player = root.AddComponent<ChapterPlayer>();
            BuildStory(player, frame, face.GetComponent<Renderer>(), print, gate);
            ArchiveWorlds.Build(player);
            ExpeditionSceneBuilder.Attach(player);
        }

        void SetLights()
        {
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.085f, 0.10f, 0.12f);
            var flame = NewMaterial("lantern-glass", "#ffdda8");
            flame.EnableKeyword("_EMISSION");
            flame.SetColor("_EmissionColor", new Color(1.6f, 0.88f, 0.35f));
            void Lamp(string name, Vector3 position, bool desk = false)
            {
                var fixture = new GameObject(name);
                fixture.transform.position = position;
                Box("Foot", fixture.transform, new Vector3(0, -0.09f, 0), new Vector3(0.16f, 0.045f, 0.16f), materials["chestHardware"], false);
                Box("Light", fixture.transform, Vector3.zero, new Vector3(0.09f, 0.15f, 0.09f), flame, false);
                var light = fixture.AddComponent<Light>();
                light.type = LightType.Point;
                light.color = new Color(1, 0.80f, 0.56f);
                light.range = desk ? 7.5f : 6f;
                light.intensity = desk ? 1.8f : 2.2f;
            }
            Lamp("Desk lamp", new Vector3(1.23f, 1.39f, 1.42f), true);
            foreach (JToken pier in plan["zones"]["corridor"].Where(p => p["lampYaw"] != null))
            {
                Vector3 at = V(pier["position"]);
                float side = Mathf.Sign(at.z - placed["vault-gate"].transform.position.z);
                Lamp("Passage lantern", at + new Vector3(0, 0.32f, -side * 0.22f));
            }
            Lamp("Register lamp", placed["vault-lectern"].transform.position + new Vector3(0.57f, 0.73f, 0));
        }
    }
}
