using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace Archive.Editor
{
    public static class ExpeditionSceneBuilder
    {
        const string Generated = "Assets/Archive/Generated/";
        static Material Finish(string key) => AssetDatabase.LoadAssetAtPath<Material>(Generated + key + ".mat");
        static Vector3 V(JToken arr) => new((float)arr[0], (float)arr[1], (float)arr[2]);
        static Transform Group(string name, Transform parent, Vector3 local)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false); t.localPosition = local; return t;
        }
        static GameObject Shape(Transform parent, string id, PrimitiveType type, Vector3 pos, Vector3 size, Material mat)
        {
            var obj = GameObject.CreatePrimitive(type);
            obj.name = id; obj.transform.SetParent(parent, false);
            obj.transform.localPosition = pos; obj.transform.localScale = size;
            obj.GetComponent<Renderer>().sharedMaterial = mat;
            return obj;
        }
        static Transform Model(Transform parent, string id, float height, float yaw)
        {
            var source = AssetDatabase.LoadAssetAtPath<GameObject>(Generated + "Source/" + id + ".glb");
            if (!source) throw new InvalidDataException("Missing expedition actor: " + id);
            var t = ((GameObject)PrefabUtility.InstantiatePrefab(source, parent)).transform;
            t.localRotation = Quaternion.Euler(0, yaw, 0);
            var renderers = t.GetComponentsInChildren<Renderer>();
            if (renderers.Length == 0) throw new InvalidDataException("No geometry in " + id);
            Bounds extent = renderers[0].bounds;
            foreach (var r in renderers) extent.Encapsulate(r.bounds);
            float factor = height / Mathf.Max(0.01f, extent.size.y);
            t.localScale *= factor;
            Vector3 feet = new Vector3(extent.center.x, extent.min.y, extent.center.z);
            t.localPosition -= parent.InverseTransformPoint(feet) * factor;
            return t;
        }
        static Transform Portal(Transform parent, string id, Vector3 pos, Material metal, Material glow)
        {
            var t = Group(id, parent, pos);
            Shape(t,"portal plinth",PrimitiveType.Cube,new Vector3(0,.1f,0),new Vector3(1.66f,.2f,.65f),metal);
            const int sides=12;
            for(int i=0;i<sides;i++) {
                float a=i*Mathf.PI*2/sides, b=(i+1)*Mathf.PI*2/sides;
                Vector3 P(float v) => new(Mathf.Cos(v)*.68f,1.1f+Mathf.Sin(v)*.94f,0);
                Vector3 first=P(a), second=P(b);
                var rib=Shape(t,"portal voussoir",PrimitiveType.Cube,(first+second)/2,
                    new Vector3(.10f,(second-first).magnitude,.16f),metal);
                rib.transform.localRotation=Quaternion.FromToRotation(Vector3.up,second-first);
            }
            Shape(t,"passage",PrimitiveType.Sphere,new Vector3(0,1.1f,0),new Vector3(1.23f,1.75f,.11f),glow);
            var light=Group("portal light",t,new Vector3(0,1.2f,-.42f)).gameObject.AddComponent<Light>();
            light.type=LightType.Point; light.range=3.6f; light.color=new Color(.36f,.81f,.85f); light.intensity=2;
            return t;
        }
        public static void Attach(ChapterPlayer player)
        {
            var e = player.gameObject.AddComponent<ExpeditionRuntime>();
            e.supply = GameObject.Find("reading-chest-west").transform;
            e.stash = GameObject.Find("reading-chest-east").transform;
            e.supplyLid = e.supply.GetComponentsInChildren<Transform>().FirstOrDefault(t => t.name == "chest lid")?.gameObject;
            var chapter = Group("Expedition outpost", null, Vector3.zero);
            e.mira = Group("guide-mira", chapter, new Vector3(-4.5f,0,-2.5f));
            Model(e.mira, "archive-scribe", 1.68f, 160);
            var contact = e.mira.gameObject.AddComponent<CapsuleCollider>();
            contact.height = 1.68f; contact.radius=.31f; contact.center=Vector3.up*.84f;
            var metal=Finish("chestHardware"); var slate=Finish("rampartStone");
            var glow = AssetDatabase.LoadAssetAtPath<Material>(Generated+"quarry-portal.mat");
            if (!glow) {
                glow=new Material(Shader.Find("Standard"));
                glow.color=new Color(.12f,.41f,.47f);
                glow.EnableKeyword("_EMISSION");
                glow.SetColor("_EmissionColor",new Color(.08f,.46f,.52f));
                AssetDatabase.CreateAsset(glow,Generated+"quarry-portal.mat");
            }
            e.entrance=Portal(chapter,"enter-quarry",new Vector3(-4.5f,0,.5f),metal,glow);
            // The quarry uses the independently playable arena's local metre coordinates.
            // Offset the root beyond the citadel so neither map can be reached on foot from the other.
            e.quarry=Group("Ink quarry",null,new Vector3(2048,0,0));
            var path=Path.GetFullPath(Path.Combine(Application.dataPath,"../../asset-sources/Art/arenas/experience-layouts.json"));
            var level=JObject.Parse(File.ReadAllText(path))["levels"]["ink-quarry"];
            var floor=level["floor"];
            Shape(e.quarry,"quarry-floor",PrimitiveType.Cube,V(floor["position"]),V(floor["size"]),Finish("chapterFloor"));
            foreach(string key in new[]{"walls","cover"}) foreach(var shape in level[key])
                Shape(e.quarry,(string)shape[0],PrimitiveType.Cube,V(shape[1]),V(shape[2]),slate);
            foreach(float x in new[]{-7.7f,7.7f}) foreach(float z in new[]{-5,1,7})
                Shape(e.quarry,"quarry buttress",PrimitiveType.Cube,new Vector3(x,1.9f,z),new Vector3(.6f,3.8f,.7f),Finish("rampartTrim"));
            e.exit = Portal(e.quarry,"leave-quarry",new Vector3(0,0,-8),metal,glow);
            var field = UnityEngine.Object.Instantiate(e.supply.gameObject, e.quarry);
            field.name="field-cache"; field.transform.localPosition = new Vector3(4.63f,0,8.8f);
            e.fieldCache=field.transform;
            e.fieldLid=field.GetComponentsInChildren<Transform>().FirstOrDefault(t=>t.name=="chest lid")?.gameObject;
            var rocks=new []{new Vector3(-3,4,1),new Vector3(4,4,8)};
            foreach(var position in rocks) {
                var light=Group("quarry glow",e.quarry,position).gameObject.AddComponent<Light>();
                light.type=LightType.Point; light.range=12; light.intensity=3.6f; light.color=new Color(.50f,.68f,.82f);
            }
            var spawns=level["enemySpawns"] as JArray;
            if (spawns == null || spawns.Count != 3) throw new InvalidDataException("Expected three ink quarry wraiths");
            e.foes=new ExpeditionFoe[spawns.Count];
            for(int i=0;i<spawns.Count;i++) {
                Vector3 spawn=V(spawns[i]);
                var t=Group("quarry-wraith-"+i,e.quarry,spawn);
                var foe=t.gameObject.AddComponent<ExpeditionFoe>(); foe.index=i; foe.spawn=spawn;
                foe.visual=Model(t,"ink-apparition",1.75f,180);
                Transform mask=foe.visual.GetComponentsInChildren<Transform>().First(x=>x.name=="InkMask");
                var mesh=mask.GetComponentsInChildren<MeshFilter>().First();
                var region=mesh.gameObject.AddComponent<SphereCollider>();
                region.center=mesh.sharedMesh.bounds.center;
                var extents=mesh.sharedMesh.bounds.extents;
                region.radius=Mathf.Max(extents.x, extents.y, extents.z);
                foe.head=region;
                region.gameObject.AddComponent<ArchiveHitZone>().head=true;
                var body=t.gameObject.AddComponent<CapsuleCollider>();
                body.height=Mathf.Clamp(region.bounds.min.y-t.position.y,.86f,1.45f);
                body.radius=.32f; body.center=Vector3.up*(body.height*.5f);
                e.foes[i]=foe;
            }
            e.quarry.gameObject.SetActive(false);
        }
    }
}
