using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace Archive
{
    // Scene references and native physics live here; the ledger is persisted independently of story checkpoints.
    [DisallowMultipleComponent]
    public sealed class ExpeditionRuntime : MonoBehaviour
    {
        public Transform supply, stash, mira, entrance, exit, fieldCache, quarry;
        public ExpeditionFoe[] foes;
        public GameObject supplyLid, fieldLid;
        ExpeditionLedger state;
        ChapterPlayer player;
        ChapterStory story;
        ExpeditionInventory inventory;
        ExpeditionMap map;
        float nextSurvey;
        bool inventoryOpen, hasSave;
        public bool HasSave { get { EnsureLoaded(); return hasSave; } }
        public bool InventoryOpen => inventoryOpen;
        public string FocusId { get; private set; }
        public bool InQuarry => State.area == "dungeon";
        public bool Dead => State.health <= 0;
        public float Health => State.health;
        public float Armor => State.armor;
        public int MaxHealth => State.MaxHealth;
        public int MaxArmor => State.MaxArmor;
        public int Selected => State.selected;
        public bool TorchLit => State.torchLit;
        public int Loaded(int slot) => slot >= 0 && slot < 2 ? State.ammo[ExpeditionLedger.Weapons[slot]].loaded : 0;
        public int Reserve(int slot) => slot >= 0 && slot < 2 ? State.ammo[ExpeditionLedger.Weapons[slot]].reserve : 0;
        public string Worn(int slot) => slot >= 0 && slot < 3 ? State.slots[slot] : null;
        ExpeditionLedger State => EnsureLoaded();
        ExpeditionLedger EnsureLoaded() => state ??= ExpeditionLedger.Decode(ExpeditionSave.Read(), out hasSave);
        void Awake() {
            player = GetComponent<ChapterPlayer>();
            story = GetComponent<ChapterStory>();
            map = new ExpeditionMap();
        }
        void OnDestroy() { map?.Dispose(); }
        internal string Text(string key) => player.Text(key);
        internal void Message(string key, params object[] args) {
            string value = string.Format(Text(key), args);
            player.Notify(value, value, 5);
        }
        public string Summary() => State.Encode();
        public void Select(int slot) {
            if (Worn(slot) == null || slot == Selected) return;
            State.selected = slot; Save();
        }
        public bool Spend(int slot) {
            if (Dead || !State.Consume(slot)) return false;
            Save(); return true;
        }
        public int Reload(int slot) { int n = State.Reload(slot); if (n > 0) Save(); return n; }
        public void SetTorch(bool value) { if (value == TorchLit) return; State.torchLit = value; Save(); }
        public float DamageFor(int slot, float draw01) => slot >= 0 && slot <= 1 ? State.DamageFor(slot, draw01) : 0;
        public void Damage(float amount) {
            if (Dead || !(amount > 0) || float.IsInfinity(amount)) return;
            State.Damage(amount); Save();
        }
        void Save() { ExpeditionSave.Write(State.Encode()); hasSave = true; }
        void SyncWorld(bool resetFoes)
        {
            if (quarry != null) quarry.gameObject.SetActive(InQuarry);
            if (supplyLid != null) supplyLid.SetActive(!State.claimed.Contains("reading-supply"));
            if (fieldLid != null) fieldLid.SetActive(!State.claimed.Contains("field-cache"));
            if (foes == null) return;
            for (int i = 0; i < foes.Length; i++) {
                bool active = InQuarry && i < State.enemies.Length && State.enemies[i].health > 0;
                if (!foes[i]) continue;
                if (resetFoes) foes[i].ResetAtSpawn();
                foes[i].gameObject.SetActive(active);
            }
        }
        public void Retry() { CloseBag(); State.Retry(); Save(); SyncWorld(true); }
        public void NewGame() { CloseBag(); map.ResetDiscovery(); state = new ExpeditionLedger(); Save(); SyncWorld(true); }
        public void ContinueVisit() {
            CloseBag(); SyncWorld(true);
            if (InQuarry) player.Teleport(quarry.TransformPoint(0, 0.035f, -6), 0);
        }
        bool NearStash => !InQuarry && stash && (transform.position - stash.position).sqrMagnitude < 3f * 3f;
        string Target(Transform hit)
        {
            if (!hit || Dead) return null;
            if (InQuarry) {
                if (fieldCache && hit.IsChildOf(fieldCache)) return "field-cache";
                if (exit && hit.IsChildOf(exit)) return "leave-quarry";
            } else {
                if (supply && hit.IsChildOf(supply)) return "reading-supply";
                if (stash && hit.IsChildOf(stash)) return "gear-storage";
                if (mira && hit.IsChildOf(mira)) return "guide-mira";
                if (entrance && hit.IsChildOf(entrance)) return "enter-quarry";
            }
            return null;
        }
        public string Focus(Transform hit)
        {
            // The caller passes the first unobstructed hit within its interaction reach.
            FocusId = Target(hit);
            if (FocusId != null) map.Note(hit);
            return FocusId == null ? null : Text("exp.action." + FocusId);
        }
        public bool Interact(Transform hit)
        {
            string id = Target(hit);
            if (id == null) return false;
            switch (id) {
                case "reading-supply":
                case "field-cache":
                    bool gained = State.Claim(id);
                    if (gained) Save();
                    Message(gained ? "exp.claim." + id : "exp.claim.empty"); SyncWorld(false); break;
                case "gear-storage":
                    if (NearStash) OpenBag(1); break;
                case "guide-mira":
                    string key = State.Talk(out bool resupplied);
                    Save();
                    string line = string.Format(Text(key), Math.Min(3, State.kills));
                    if (resupplied) line += " " + Text("exp.mira.emergency");
                    player.Notify(line, line, 7); break;
                case "enter-quarry":
                    State.Enter(); Save(); SyncWorld(true);
                    player.Teleport(quarry.TransformPoint(0, 0.035f, -6), 0); Message("exp.quarry.enter"); break;
                case "leave-quarry":
                    State.area = "chapter"; Save(); SyncWorld(false);
                    player.Teleport(new Vector3(-4.5f, 0.035f, -1.1f), 180); Message("exp.quarry.return"); break;
            }
            return true;
        }
        public bool Hit(Collider hit, int slot, float draw01)
        {
            if (!hit || !InQuarry || Dead || slot < 0 || slot > 1) return false;
            var foe = hit.GetComponentInParent<ExpeditionFoe>();
            if (!foe) return false;
            int amount = State.DamageFor(slot, draw01);
            bool head = foe.head == hit;
            if (head) amount *= 2;
            if (!State.Hit(foe.index, amount)) return true;
            Save();
            foe.Stun();
            string key = State.enemies[foe.index].health == 0 ? "exp.hit.reward" : "exp.hit.wraith";
            string text = (head ? Text("exp.hit.head") + " " : "") + string.Format(Text(key), amount);
            player.Notify(text, text, 3);
            SyncWorld(false); return true;
        }
        public void Tick(float dt)
        {
            if (inventoryOpen || Dead || dt <= 0) return;
            if (player.Bindings.Down(PlayerAction.Map)) map.Toggle();
            map.Advance(transform, InQuarry, story ? story.Phase : 0);
            nextSurvey -= dt;
            if (nextSurvey <= 0 && story && !InQuarry && story.targets != null) {
                nextSurvey = .3f;
                foreach (var target in story.targets) {
                    if (!target || !target.gameObject.activeInHierarchy || target.phase > story.Phase) continue;
                    Vector3 eye = transform.position + Vector3.up * .95f;
                    Vector3 delta = target.transform.position - eye;
                    if (delta.sqrMagnitude > 25 || Vector3.Dot(transform.forward, delta.normalized) < .5f) continue;
                    if (!Physics.Raycast(eye, delta.normalized, out var hit, delta.magnitude,
                        Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore) || hit.transform.IsChildOf(target.transform))
                        map.Note(target.transform);
                }
            }
            if (!InQuarry) return;
            bool safe = quarry.InverseTransformPoint(transform.position).z <= -5.3f;
            foreach (var foe in foes)
                if (!Dead && foe && foe.isActiveAndEnabled && foe.Advance(transform, safe, dt)) Damage(18);
        }
        void OpenBag(int tab) {
            inventoryOpen = true;
            inventory ??= new ExpeditionInventory();
            inventory.Show(tab);
            Cursor.lockState = CursorLockMode.None; Cursor.visible = true;
        }
        public void ToggleBag() { if (inventoryOpen) CloseBag(); else if (!Dead) OpenBag(0); }
        public void CloseBag() { inventoryOpen = false; }
        public void DrawInventory() {
            if (inventoryOpen) inventory.Draw(this, State, NearStash);
        }
        public void DrawMinimap() => map.Draw(this, transform);
        internal void MoveGear(string id, string from, string to) {
            if (State.Move(id, from, to, NearStash)) Save();
        }
        internal void Upgrade(string skill) { if (State.Upgrade(skill)) Save(); }
    }

    static class ExpeditionSave
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern string ArchiveExpeditionRead();
        [DllImport("__Internal")] static extern void ArchiveExpeditionWrite(string json);
#endif
        internal static string Read()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            var json = ArchiveExpeditionRead();
            if (!string.IsNullOrEmpty(json)) return json;
#endif
            return PlayerPrefs.GetString(ExpeditionLedger.Key, "");
        }
        internal static void Write(string json)
        {
            PlayerPrefs.SetString(ExpeditionLedger.Key, json);
            PlayerPrefs.Save();
#if UNITY_WEBGL && !UNITY_EDITOR
            ArchiveExpeditionWrite(json);
#endif
        }
    }
}
