using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Archive
{
    public sealed partial class ChapterStory : MonoBehaviour
    {
        public Transform entrance, vault, returnLatch, readingLatch;
        public Renderer photograph;
        public Material faded, restored;
        public Texture2D nightArt, erasureArt, restoredArt;
        public StoryTarget[] targets;
        public ChapterInk ink;
        public Func<bool> Korean;
        public event Action<Vector3> RespawnRequested;
        public event Action ReturnToTitleRequested, RetryRequested;
        public event Action<int> PhaseChanged;

        public string Mode { get; private set; } = "play";
        public int Phase { get; private set; }
        public bool HasSave => checkpoint != null;
        public bool Clue { get; private set; }
        public IReadOnlyList<int> Runes => runes;
        public IReadOnlyList<string> Records => records;
        public string Objective => Text("objective." + Objectives[Phase] + ".text");
        public string ObjectiveTitle => Text("objective." + Objectives[Phase] + ".title");
        public string Subtitle { get; private set; } = "";
        public bool ShadowActive => ink && ink.gameObject.activeSelf;
        public int IntroPage => page;

        static readonly string[] Objectives = { "photo", "corridor", "vault", "return", "restoration", "complete" };
        static readonly string[] Positions = { "left", "middle", "right" }, Symbols = { "lantern", "quill", "wave" };
        static readonly string[] Pages = { "stars", "suns", "dark", "why", "cold", "fear", "forgotten" };
        readonly List<string> records = new();
        readonly HashSet<string> discovered = new();
        readonly Queue<string> subtitles = new();
        readonly int[] runes = { 2, 2, 2 };
        readonly Vector3[] origins = new Vector3[4];
        Transform[] doors;
        JObject en, ko;
        StoryCheckpoint.Data checkpoint;
        ExpeditionRuntime expedition;
        Vector3 spawn;
        float subtitleTime, pageTime;
        int page;
        bool autoAdvance, fallen;

        void Awake()
        {
            spawn = transform.position;
            expedition = GetComponent<ExpeditionRuntime>();
            doors = new[] { entrance, vault, returnLatch, readingLatch };
            for (int i = 0; i < doors.Length; i++) origins[i] = doors[i].localPosition;
            en = Read("en"); ko = Read("ko");
            checkpoint = StoryCheckpoint.Decode(StoryCheckpoint.Read(StoryCheckpoint.Key));
            foreach (StoryTarget target in targets)
                if (IsLore(target.id) && StoryCheckpoint.Read(StoryCheckpoint.LoreKey(target.id)) == "1")
                    discovered.Add(target.id);
            Apply(true);
        }

        static JObject Read(string language) => JObject.Parse(Resources.Load<TextAsset>("ArchiveText/" + language).text);
        internal string Text(string key)
        {
            key = "story." + key;
            return (Korean?.Invoke() == true ? (string)ko[key] : null) ?? (string)en[key] ?? key;
        }
        static bool IsLore(string id) => id.StartsWith("folio-", StringComparison.Ordinal);
        public string RecordTitle(string id) => Text(IsLore(id) ? id + ".title" : "record." + id);
        public string RecordDescription(string id) => IsLore(id) ? Text(id + ".description") : Text("event." +
            (id == "mural" ? "mural-read" : id == "ledger" ? "ledger-read" : id == "restored-photo" ? "name-restored" : "photo-found"));

        void RebuildRecords()
        {
            records.Clear();
            if (Phase >= 1) records.Add(Phase == 5 ? "restored-photo" : "photo");
            if (Clue) records.Add("mural");
            if (Phase >= 3) records.Add("ledger");
            foreach (var t in targets)
                if (discovered.Contains(t.id)) records.Add(t.id);
        }

        void PoseDoors(float dt, bool instant)
        {
            for (int i = 0; i < doors.Length; i++)
            {
                bool open = Phase >= (i == 0 ? 1 : i == 1 ? 2 : 4);
                var goal = origins[i] + (open ? Vector3.up * 3.45f : Vector3.zero);
                doors[i].localPosition = instant ? goal : Vector3.MoveTowards(doors[i].localPosition, goal, dt * 2.7f);
                // Leave the gate and its embedded projectiles visible until fully retracted.
                bool visible = !open || (doors[i].localPosition - goal).sqrMagnitude > 0.000001f;
                if (doors[i].gameObject.activeSelf != visible) doors[i].gameObject.SetActive(visible);
            }
        }

        void Apply(bool instant)
        {
            foreach (var t in targets)
            {
                int i = RuneIndex(t.id);
                if (i >= 0) t.DisplayGlyph(runes[i]);
                if (IsLore(t.id)) t.gameObject.SetActive(!discovered.Contains(t.id));
            }
            photograph.sharedMaterial = Phase == 5 ? restored : faded;
            PoseDoors(0, instant);
            ink.ResetToPhase(Phase);
            RebuildRecords();
            PhaseChanged?.Invoke(Phase);
        }

        public void StartNew()
        {
            StoryCheckpoint.Write(StoryCheckpoint.Key, null);
            checkpoint = null;
            Reset(0, false, null);
            page = 0; pageTime = 0; autoAdvance = true;
            Mode = "prologue";
        }

        void Reset(int phase, bool clue, int[] saved)
        {
            Phase = phase; Clue = clue; Mode = "play";
            for (int i = 0; i < 3; i++) runes[i] = saved == null ? 2 : saved[i];
            Subtitle = ""; subtitles.Clear(); subtitleTime = 0;
            Apply(true);
            Vector3 at = Phase == 0 ? spawn : Phase == 5 ? new Vector3(0, .025f, -4.5f) :
                Phase >= 4 ? new Vector3(15.4f, .025f, 5.45f) :
                Phase >= 2 ? new Vector3(12.9f, .025f, 10.3f) : new Vector3(1.7f, .025f, 10.3f);
            RespawnRequested?.Invoke(at);
        }

        public void ContinueSaved()
        {
            Reset(checkpoint?.Phase ?? 0, checkpoint?.Clue ?? false, checkpoint?.Runes);
            if (Phase == 5) Mode = "ending";
        }
        public void Retry() => ContinueSaved();
        public void Fall() { if (Mode == "play") Die(true); }
        void Die(bool inVoid)
        {
            fallen = inVoid; Mode = "dead";
            ink.gameObject.SetActive(false);
            Cursor.lockState = CursorLockMode.None; Cursor.visible = true;
        }
        public void FinishPrologue() { if (Mode == "prologue") Mode = "play"; }
        void NextPage()
        {
            pageTime = 0;
            if (page + 1 < Pages.Length) page++;
            else FinishPrologue();
        }

        public void Tick(float dt)
        {
            if (Mode == "prologue")
            {
                if (Input.GetKeyDown(KeyCode.Escape)) { FinishPrologue(); return; }
                if (Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.Return)) { NextPage(); return; }
                // Hold the final question until the player chooses to enter the reading room.
                if (page + 1 == Pages.Length) return;
                pageTime += autoAdvance && Application.isFocused ? dt : 0;
                if (pageTime >= (page == 3 ? 3.2f : 5.7f)) NextPage();
                return;
            }
            if (Mode != "play") return;
            PoseDoors(dt, false);
            subtitleTime -= dt;
            if (subtitleTime <= 0)
            {
                Subtitle = subtitles.Count > 0 ? subtitles.Dequeue() : "";
                subtitleTime = Subtitle.Length > 0 ? Mathf.Clamp(1.7f + Subtitle.Length * .042f, 3.4f, 6.6f) : 0;
            }
            if (expedition && expedition.InQuarry) { ink.gameObject.SetActive(false); return; }
            if (transform.position.y < -14) { Fall(); return; }
            ink.Step(Phase, transform, dt, expedition);
            if (expedition && expedition.Dead) Die(false);
        }

        void Say(string value)
        {
            subtitles.Clear();
            foreach (string s in value.Split('\n')) subtitles.Enqueue(s);
            Subtitle = subtitles.Dequeue(); subtitleTime = Mathf.Clamp(1.7f + Subtitle.Length * .042f, 3.4f, 6.6f);
        }

        static int RuneIndex(string id) => id is "rune0" or "rune1" or "rune2" ? id[4] - '0' : -1;
        StoryTarget InReach(Collider hit)
        {
            if (!hit || Mode != "play" || (expedition && expedition.InQuarry)) return null;
            var t = hit.GetComponentInParent<StoryTarget>();
            if (!t) return null;
            bool allowed = IsLore(t.id) ? Phase >= t.phase && !discovered.Contains(t.id) :
                t.id == "photo" ? Phase == 0 || Phase == 4 : Phase == t.phase;
            var p = transform.position;
            if (!allowed || Mathf.Abs(p.y - t.approach.y) > 1.65f) return null;
            Vector3 delta = p - t.approach; delta.y = 0;
            return delta.sqrMagnitude <= t.range * t.range ? t : null;
        }

        public string FocusId(Collider hit) => InReach(hit)?.id;
        public string Prompt(Collider hit)
        {
            var t = InReach(hit);
            if (!t) return "";
            int i = RuneIndex(t.id);
            if (i >= 0) return Text("action.rune").Replace("{position}", Text("rune." + Positions[i])) + " · " + Text("rune." + Symbols[runes[i]]);
            if (IsLore(t.id)) return Text("action.lore").Replace("{title}", RecordTitle(t.id));
            return Text("action." + (t.id == "photo" ? Phase == 4 ? "restore" : "inspect" : t.id));
        }
        public bool Use(Collider hit)
        {
            var t = InReach(hit);
            if (!t) return false;
            string id = t.id;
            if (IsLore(id))
            {
                discovered.Add(id); StoryCheckpoint.Write(StoryCheckpoint.LoreKey(id), "1");
                Say(RecordTitle(id) + "\n" + Text(id + ".inscription"));
                RebuildRecords(); t.gameObject.SetActive(false); return true;
            }
            if (id == "mural")
            {
                Clue = true;
                if (checkpoint != null) { checkpoint.Clue = true; StoryCheckpoint.Save(checkpoint); }
                RebuildRecords(); Say(Text("event.mural-read")); return true;
            }
            int i = RuneIndex(id);
            if (i >= 0)
            {
                runes[i] = (runes[i] + 1) % 3;
                t.DisplayGlyph(runes[i]);
                Say(Text("event.rune-turned").Replace("{position}", Text("rune." + Positions[i])).Replace("{symbol}", Text("rune." + Symbols[runes[i]])));
                return true;
            }
            if (id == "seal" && (runes[0] != 0 || runes[1] != 1 || runes[2] != 2))
            {
                Say(Text("event.seal-closed")); return true;
            }
            string eventId = id == "photo" ? Phase == 4 ? "name-restored" : "photo-found" :
                id == "ledger" ? "ledger-read" : id == "shortcut" ? "shortcut-opened" : "seal-opened";
            Phase++;
            checkpoint = new StoryCheckpoint.Data { Phase = Phase, Runes = (int[])runes.Clone(), Clue = Clue };
            StoryCheckpoint.Save(checkpoint);
            Apply(false); Say(Text("event." + eventId));
            if (Phase == 5)
            {
                Mode = "ending";
                Cursor.lockState = CursorLockMode.None; Cursor.visible = true;
            }
            return true;
        }
    }
}
