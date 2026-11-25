using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Archive.Arena
{
    internal sealed class ArenaBoard
    {
        internal readonly Transform Root;
        internal readonly JObject Level;
        internal readonly List<Bounds> Obstacles = new();
        internal readonly Dictionary<string, Vector3> Objectives = new();
        readonly List<Material> owned = new();
        readonly Bounds floor;
        internal Vector3 Spawn => Point(Level["spawn"]) - Vector3.up * .84f;
        internal Vector3 Point(JToken token) => Root.position + Vec(token);
        internal static Vector3 Vec(JToken token) => new((float)token[0], (float)token[1], (float)token[2]);
        internal ArenaBoard(JObject level, ArchiveArena source)
        {
            Level = level;
            Root = new GameObject("Practice ground").transform;
            Root.position = new Vector3(-220, 0, 0);
            var paving = Material("Quarry paving", new Color(.53f, .57f, .58f), source.paving);
            var masonry = Material("Cut stone", new Color(.38f, .46f, .51f), source.masonry);
            var cover = Material("Weathered cover", new Color(.48f, .41f, .35f), source.masonry);
            bool imported = level["model"] != null;
            var surface =
                Box("Floor", Point(level["floor"]["position"]), Vec(level["floor"]["size"]), paving, !imported);
            floor = surface.bounds;
            foreach (var wall in level["walls"])
                Obstacles.Add(Box((string)wall[0], Point(wall[1]), Vec(wall[2]), masonry,
                                  ((JArray)wall).Count < 4 || !(bool)wall[3])
                                  .bounds);
            foreach (var item in level["cover"])
                Obstacles.Add(Box((string)item[0], Point(item[1]), Vec(item[2]), cover, true).bounds);
            if (imported)
            {
                var model = Object.Instantiate(source.gothic, Root);
                model.transform.localPosition = Vec(level["model"]["origin"]);
                float s = (float)level["model"]["horizontalScale"];
                model.transform.localScale = new Vector3(s, 1, s);
                foreach (var piece in model.GetComponentsInChildren<Transform>(true))
                    if (piece.name.Length >= 4 && piece.name[0] == '0' && piece.name[1] == '5' &&
                        piece.name[2] >= '2' && piece.name[2] <= '9' && piece.name[3] == '-')
                        piece.gameObject.SetActive(false);
            }
            var lamp = new GameObject("Arena illumination").AddComponent<Light>();
            lamp.transform.SetParent(Root, false);
            lamp.transform.localPosition = new Vector3(0, 5, 0);
            lamp.type = LightType.Point;
            lamp.range = 24;
            lamp.intensity = 2.7f;
            lamp.color = new Color(.83f, .84f, 1);
        }
        internal void Mark(string id, Vector3 at, bool pad)
        {
            Objectives[id] = at;
            if (!pad)
                return;
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Object.Destroy(go.GetComponent<Collider>());
            go.name = id;
            go.transform.SetParent(Root, false);
            go.transform.position = at + Vector3.up * .035f;
            go.transform.localScale = new Vector3(1.65f, .025f, 1.65f);
            var mat =
                Material(id, id == "extraction" ? new Color(.18f, .82f, .59f) : new Color(.88f, .58f, .18f));
            mat.EnableKeyword("_EMISSION");
            mat.SetColor("_EmissionColor", mat.color * .55f);
            go.GetComponent<Renderer>().sharedMaterial = mat;
        }
        Material Material(string title, Color color, Texture tex = null)
        {
            var m = new Material(Shader.Find("Standard")) { name = title, color = color, mainTexture = tex };
            m.SetFloat("_Glossiness", .12f);
            owned.Add(m);
            return m;
        }
        BoxCollider Box(string id, Vector3 pos, Vector3 size, Material mat, bool visible)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = id;
            go.transform.SetParent(Root, false);
            go.transform.position = pos;
            go.transform.localScale = size;
            var render = go.GetComponent<MeshRenderer>();
            render.sharedMaterial = mat;
            render.enabled = visible;
            Physics.SyncTransforms();
            return go.GetComponent<BoxCollider>();
        }
        internal bool Inside(Vector3 p) => p.x >= floor.min.x && p.x <= floor.max.x && p.z >= floor.min.z
                                           && p.z <= floor.max.z;
        bool Clear(Vector3 a, Vector3 b, float radius)
        {
            if (!Inside(b))
                return false;
            var delta = b - a;
            if (delta.sqrMagnitude < .00001f)
                return true;
            var ray = new Ray(a, delta.normalized);
            foreach (var obstacle in Obstacles)
            {
                var expanded = obstacle;
                expanded.Expand(new Vector3(radius * 2, 0, radius * 2));
                if (expanded.IntersectRay(ray, out float t) && t < delta.magnitude)
                    return false;
            }
            return true;
        }
        // A small shared floor grid avoids agents cutting through the same authored cover that
        // stops the player. Replan only when the direct corridor is obstructed.
        internal Vector3 Next(Vector3 from, Vector3 goal, float radius)
        {
            from.y = goal.y = Root.position.y + .42f;
            if (Clear(from, goal, radius))
                return goal;
            float cell = .65f;
            Vector2Int Key(Vector3 p) => new(Mathf.RoundToInt((p.x - Root.position.x) / cell),
                                             Mathf.RoundToInt((p.z - Root.position.z) / cell));
            Vector3 At(Vector2Int k) => new(Root.position.x + k.x * cell, from.y, Root.position.z + k.y * cell);
            var start = Key(from);
            var frontier = new Queue<Vector2Int>();
            frontier.Enqueue(start);
            var first = new Dictionary<Vector2Int, Vector2Int> { { start, start } };
            var near = start;
            float best = (goal - from).sqrMagnitude;
            while (frontier.Count > 0)
            {
                var k = frontier.Dequeue();
                var p = k == start ? from : At(k);
                if (k != start && Clear(p, goal, radius))
                    return At(first[k]);
                for (int x = -1; x <= 1; x++)
                    for (int z = -1; z <= 1; z++)
                    {
                        if (x == 0 && z == 0)
                            continue;
                        var n = k + new Vector2Int(x, z);
                        if (first.ContainsKey(n) || !Clear(p, At(n), radius))
                            continue;
                        first[n] = k == start ? n : first[k];
                        float cost = (At(n) - goal).sqrMagnitude;
                        if (cost < best)
                        {
                            near = n;
                            best = cost;
                        }
                        frontier.Enqueue(n);
                    }
            }
            return near == start ? from : At(first[near]);
        }
        internal void Dispose()
        {
            Root.gameObject.SetActive(false);
            Object.Destroy(Root.gameObject);
            foreach (var m in owned)
                Object.Destroy(m);
        }
    }

}
