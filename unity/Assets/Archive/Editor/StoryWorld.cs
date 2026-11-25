using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace Archive.Editor
{
    public sealed partial class ChapterSceneBuilder
    {
        readonly List<StoryTarget> targets = new();
        StoryTarget Target(GameObject root, string id, int phase, Vector3 approach, float range)
        {
            var t = root.AddComponent<StoryTarget>();
            t.id = id; t.phase = phase; t.approach = approach; t.range = range;
            targets.Add(t);
            return t;
        }

        static Transform Group(string name, Transform parent, Vector3 local)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false); t.localPosition = local;
            return t;
        }

        Transform Glyph(int symbol, Transform panel, float scale, Material metal)
        {
            var root = Group(new[] { "Lantern", "Quill", "Wave" }[symbol], panel, Vector3.back * .025f);
            root.localScale = Vector3.one * scale;
            void Line(float x1, float y1, float x2, float y2, float width = .078f)
            {
                Vector3 a = new(x1, y1), b = new(x2, y2), d = b - a;
                var line = Box("Engraving", root, (a + b) / 2, new Vector3(width, d.magnitude, .055f), metal, false);
                line.transform.localRotation = Quaternion.FromToRotation(Vector3.up, d);
            }
            if (symbol == 0)
            {
                Line(-.34f, .25f, .34f, .25f); Line(-.23f, -.32f, .23f, -.32f);
                Line(-.32f, .22f, -.19f, -.3f); Line(.32f, .22f, .19f, -.3f);
                Line(-.16f, .26f, 0, .48f); Line(0, .48f, .16f, .26f); Line(0, -.17f, .05f, .06f, .12f);
            }
            else if (symbol == 1)
            {
                Line(-.36f, -.44f, .28f, .42f); Line(-.2f, -.18f, -.19f, .17f);
                Line(-.19f, .17f, .28f, .42f); Line(.28f, .42f, .15f, .03f); Line(.15f, .03f, -.2f, -.18f);
                Line(-.01f, .1f, .14f, .16f, .055f);
            }
            else
            {
                for (int i = 0; i < 2; i++)
                {
                    float y = .12f - i * .24f;
                    Line(-.43f, y, -.23f, y + .12f); Line(-.23f, y + .12f, 0, y - .08f);
                    Line(0, y - .08f, .21f, y + .08f); Line(.21f, y + .08f, .42f, y);
                }
            }
            return root;
        }

        Transform Book(string name, Transform group, Vector3 position, Vector3 angles, float scale)
        {
            var root = Group(name, group, position);
            root.localRotation = Quaternion.Euler(angles);
            root.localScale = Vector3.one * scale;
            Box("Bound cover", root, Vector3.zero, new Vector3(.48f, .045f, .34f), materials["wood"], true);
            for (int side = -1; side <= 1; side += 2)
            {
                var page = Group("Leaves", root, new Vector3(side * .114f, .028f, 0));
                page.localRotation = Quaternion.Euler(0, 0, side * 4);
                Box("Paper", page, Vector3.zero, new Vector3(.212f, .024f, .31f), materials["register-paper"], true);
                for (int j = 0; j < 5; j++)
                    Box("Handwriting", page, new Vector3(.01f, .013f, .097f - .042f * j),
                        new Vector3(j % 2 == 0 ? .145f : .11f, .002f, .004f), materials["folio-ink"], false);
            }
            return root;
        }

        void BuildStory(ChapterPlayer player, GameObject frame, Renderer photograph, Material faded, GameObject gate)
        {
            var story = player.gameObject.AddComponent<ChapterStory>();
            story.photograph = photograph; story.faded = faded;
            story.nightArt = AssetDatabase.LoadAssetAtPath<Texture2D>(StoryAssets.Art + "night-watch.jpg");
            story.erasureArt = AssetDatabase.LoadAssetAtPath<Texture2D>(StoryAssets.Art + "erased-name.jpg");
            story.restoredArt = AssetDatabase.LoadAssetAtPath<Texture2D>(StoryAssets.Art + "archive-photo-restored.jpg");
            if (!story.nightArt || !story.erasureArt || !story.restoredArt) throw new InvalidDataException("Missing chapter illustrations.");
            story.restored = NewMaterial("restored-print", "#ffffff"); story.restored.mainTexture = story.restoredArt;
            var fixtures = Group("Chapter furnishings", null, Vector3.zero);
            var brass = materials["seal-bronze"];
            var gold = NewMaterial("engraved-gold", "#e7c887");
            gold.EnableKeyword("_EMISSION"); gold.SetColor("_EmissionColor", new Color(.28f, .15f, .04f));
            NewMaterial("register-paper", "#d7c7a1"); NewMaterial("folio-ink", "#3e3428");
            Target(frame, "photo", 0, new Vector3(.4f, 0, .85f), 1.55f);
            var entrance = Box("North passage door", fixtures, new Vector3(0, 1.49f, 7.42f), new Vector3(2.24f, 2.98f, .16f), materials["wood"], true);
            placed.Add("north-door", entrance); story.entrance = entrance.transform;
            story.vault = gate.transform; Target(gate, "seal", 1, new Vector3(11.9f, 0, 10.3f), 1.3f);
            var latch = placed["vault-shortcut-door"]; story.returnLatch = latch.transform;
            story.readingLatch = placed["reading-shortcut-door"].transform;
            Target(latch, "shortcut", 3, new Vector3(15.4f, 0, 8.5f), 1.25f);
            Box("Sliding latch", latch.transform, new Vector3(-.14f, -.1f, 0), new Vector3(.10f, .12f, .76f), brass, true);
            var mural = Group("Three-panel mural", fixtures, new Vector3(3.6f, 1.5f, 12.24f));
            Target(mural.gameObject, "mural", 1, new Vector3(3.6f, 0, 11.45f), 1.6f);
            for (int i = 0; i < 3; i++)
            {
                var panel = Group("Relief", mural, new Vector3((i - 1) * .6f, 0, 0));
                Box("Backing", panel, Vector3.zero, new Vector3(.55f, .95f, .08f), materials["wood"], true);
                var face = Group("Face", panel, Vector3.back * .03f);
                Glyph(i, face, .44f, gold);
                var plinth = placed["corridor-rune-" + (i + 1)];
                Vector3 approach = plinth.transform.position; approach.y = 0;
                var target = Target(plinth, "rune" + i, 1, approach, .95f);
                var plaque = Group("Turnable seal", plinth.transform, new Vector3(-.17f, .49f, 0));
                plaque.localRotation = Quaternion.Euler(0, 90, 0);
                Box("Seal plate", plaque, Vector3.zero, new Vector3(.35f, .35f, .04f), brass, true);
                target.glyphs = new GameObject[3];
                for (int g = 0; g < 3; g++) target.glyphs[g] = Glyph(g, plaque, .29f, gold).gameObject;
                target.DisplayGlyph(2);
            }
            Box("Silver ward", fixtures, new Vector3(8.1f, .008f, 10.3f), new Vector3(.045f, .012f, 3.8f), gold, false);
            Target(placed["vault-lectern"], "ledger", 2, new Vector3(15, 0, 10.3f), 1.5f);
            var register = Book("Ian's signature register", placed["vault-lectern"].transform,
                Vector3.zero, Vector3.zero, 1.4f);
            register.position = new Vector3(15.65f, 1.2f, 10.3f);
            register.rotation = Quaternion.Euler(0, 90, 0);
            LayOutLore(fixtures);
            CreateReturnPassage(fixtures);
            var shadow = Group("Ink apparition", null, new Vector3(7.3f, 0, 9.15f));
            story.ink = shadow.gameObject.AddComponent<ChapterInk>();
            StoryAssets.AddInkModel(story.ink);
            var body = shadow.gameObject.AddComponent<CapsuleCollider>();
            body.center = new Vector3(0, .91f, 0); body.radius = .26f; body.height = 1.66f;
            // The mask follows its animated node; shots to the body still interrupt its reach.
            Transform mask = null;
            foreach (var t in story.ink.visual.GetComponentsInChildren<Transform>(true))
                if (t.name == "InkMask") { mask = t; break; }
            var head = mask ? Group("Mask hit zone", mask, Vector3.zero) :
                Group("Mask hit zone", shadow, new Vector3(0, 2.05f, .24f));
            var hit = head.gameObject.AddComponent<SphereCollider>(); hit.radius = .22f;
            head.gameObject.AddComponent<ArchiveHitZone>().head = true;
            shadow.gameObject.SetActive(false);
            story.targets = targets.ToArray();
        }

        void LayOutLore(Transform furnishings)
        {
            string path = Path.Combine(Application.dataPath, "../../shared/levels/chapter-1-codex.json");
            foreach (JToken item in JArray.Parse(File.ReadAllText(path)))
            {
                string id = (string)item["id"];
                Vector3 at = V(item["position"]);
                if (id == "folio-first-catalog")
                {
                    var foot = Group("Catalog stand", furnishings, new Vector3(at.x, 0, at.z));
                    Box("Plinth", foot, new Vector3(0, .07f, 0), new Vector3(.55f, .14f, .45f), materials["wood"], true);
                    Box("Stem", foot, new Vector3(0, .47f, 0), new Vector3(.19f, .66f, .19f), materials["wood"], true);
                    Box("Board", foot, new Vector3(0, .85f, 0), new Vector3(.65f, .10f, .5f), materials["wood"], true);
                }
                // Vertical folios sit slightly proud of the wall, with their paper facing the approach.
                var approach = V(item["approach"]);
                var rotation = Quaternion.Euler(V(item["rotation"]));
                if (id == "folio-ink" || id == "folio-unreturned" || id == "folio-return-plan")
                {
                    Vector3 facing = approach - at; facing.y = 0; facing.Normalize();
                    rotation = Quaternion.LookRotation(Vector3.up, facing);
                }
                var book = Book(id, furnishings, at, rotation.eulerAngles, 1);
                Target(book.gameObject, id, (int)item["phase"], approach, (float)item["range"]);
            }
        }

        void CreateReturnPassage(Transform root)
        {
            var stone = materials["chapterFloor"];
            Box("South return wall", root, new Vector3(13.1f, 1.65f, 4.25f), new Vector3(7.2f, 3.3f, .2f), stone, true);
            Box("East return wall", root, new Vector3(16.8f, 1.65f, 5.78f), new Vector3(.2f, 3.3f, 3.06f), stone, true);
            Box("North return shoulder", root, new Vector3(10.775f, 1.65f, 7.2f), new Vector3(2.55f, 3.3f, .2f), stone, true);
            Box("West return shoulder", root, new Vector3(9.41f, 1.65f, 6.89f), new Vector3(.18f, 3.3f, .88f), stone, true);
            Box("Return passage ceiling", root, new Vector3(13.1f, 3.48f, 5.825f), new Vector3(7.2f, .16f, 2.95f), materials["wood"], true);
        }
    }
}
