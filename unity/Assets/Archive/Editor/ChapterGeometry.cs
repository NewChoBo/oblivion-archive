using System.Collections.Generic;
using UnityEngine;

namespace Archive.Editor
{
    // All inputs are Unity world metres. UVs use metres on each face, including the reveal.
    internal sealed class ChapterGeometry
    {
        readonly List<Vector3> points = new();
        readonly List<Vector2> uv = new();
        readonly List<int> indices = new();

        void Face(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 normal)
        {
            if (Vector3.Dot(Vector3.Cross(b - a, c - a), normal) < 0) (b, d) = (d, b);
            int start = points.Count;
            foreach (Vector3 point in new[] { a, b, c, d })
            {
                points.Add(point);
                uv.Add(Mathf.Abs(normal.y) > 0.7f ? new Vector2(point.x, point.z) :
                    Mathf.Abs(normal.x) > 0.7f ? new Vector2(point.z, point.y) :
                    new Vector2(point.x, point.y));
            }
            indices.AddRange(new[] { start, start + 1, start + 2, start, start + 2, start + 3 });
        }

        Mesh Finish()
        {
            var mesh = new Mesh();
            mesh.SetVertices(points);
            mesh.SetUVs(0, uv);
            mesh.SetTriangles(indices, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        public static Mesh FramedWall(Bounds bounds, bool alongX, float center, float width,
            float spring, float rise, string shape)
        {
            var mesh = new ChapterGeometry();
            float Near(Vector3 v) => alongX ? v.z : v.x;
            float Across(Vector3 v) => alongX ? v.x : v.z;
            Vector3 P(float u, float h, float z) => alongX ? new Vector3(u, h, z) : new Vector3(z, h, u);
            float uMin = Across(bounds.min), uMax = Across(bounds.max), lo = bounds.min.y, hi = bounds.max.y;
            float near = Near(bounds.min), far = Near(bounds.max), radius = width / 2;
            float left = center - radius, right = center + radius;

            void Strip(float a, float ha, float b, float hb)
            {
                mesh.Face(P(a, ha, near), P(b, hb, near), P(b, hi, near), P(a, hi, near), P(0, 0, -1));
                mesh.Face(P(a, ha, far), P(b, hb, far), P(b, hi, far), P(a, hi, far), P(0, 0, 1));
                mesh.Face(P(a, ha, near), P(b, hb, near), P(b, hb, far), P(a, ha, far), P(hb - ha, a - b, 0).normalized);
            }
            void End(float u, float low, float high, float outward)
            {
                mesh.Face(P(u, low, near), P(u, high, near), P(u, high, far), P(u, low, far), P(outward, 0, 0));
            }
            Strip(uMin, lo, left, lo);
            Strip(right, lo, uMax, lo);
            if (shape == "flat") Strip(left, spring, right, spring);
            else
            {
                // Match doorway-wall.ts: each pointed side is a 60-degree arc about the opposite spring.
                bool pointed = shape == "pointed";
                int segments = pointed ? 30 : 8;
                float limit = pointed ? Mathf.PI / 3 : Mathf.PI / 2;
                for (int side = -1; side <= 1; side += 2)
                {
                    float a = center + side * radius, ha = spring;
                    for (int i = 1; i <= segments; i++)
                    {
                        float angle = limit * i / segments;
                        float t = pointed ? 2 * Mathf.Cos(angle) - 1 : Mathf.Cos(angle);
                        float b = i == segments ? center : center + side * radius * t;
                        float hb = spring + rise * Mathf.Sin(angle) / Mathf.Sin(limit);
                        if (side < 0) Strip(a, ha, b, hb);
                        else Strip(b, hb, a, ha);
                        a = b;
                        ha = hb;
                    }
                }
            }
            End(uMin, lo, hi, -1);
            End(uMax, lo, hi, 1);
            End(left, lo, spring, 1);
            End(right, lo, spring, -1);
            mesh.Face(P(uMin, hi, near), P(uMax, hi, near), P(uMax, hi, far), P(uMin, hi, far), Vector3.up);
            return mesh.Finish();
        }
    }
}
