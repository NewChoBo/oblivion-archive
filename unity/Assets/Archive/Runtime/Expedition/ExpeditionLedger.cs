using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Archive
{
    // The serialized field names are shared with the Babylon expedition v1 ledger.
    [JsonObject(MemberSerialization.Fields)]
    internal sealed class ExpeditionLedger
    {
        internal const string Key = "oblivion-archive.expedition.v1";
        internal const int BagLimit = 6, StorageLimit = 12, EnemyHealth = 72;
        internal static readonly string[] Weapons = { "wand", "bow" };
        internal static readonly string[] SkillIds = { "power", "vitality", "ward" };
        [JsonObject(MemberSerialization.Fields)]
        internal sealed class Ammo { public int loaded, reserve; }
        [JsonObject(MemberSerialization.Fields)]
        internal sealed class Enemy { public int health = EnemyHealth; }
        public int version = 1, visit, kills, deaths, selected, xp, level, points;
        public string area = "chapter";
        public bool quest, torchLit = true;
        public float health = 100, armor = 40;
        public readonly List<string> claimed = new(), bag = new(), storage = new();
        public readonly string[] slots = { "wand", "bow", "torch" };
        public readonly Dictionary<string, int> skills = new() {
            { "power", 0 }, { "vitality", 0 }, { "ward", 0 }
        };
        public readonly Dictionary<string, Ammo> ammo = new() {
            { "wand", new Ammo { loaded = 6, reserve = 18 } },
            { "bow", new Ammo { loaded = 1, reserve = 16 } }
        };
        public Enemy[] enemies = Array.Empty<Enemy>();
        internal int MaxHealth => 100 + 20 * skills["vitality"];
        internal int MaxArmor => 60 + 15 * skills["ward"];
        internal int NextLevel => 60 * (level + 1);
        internal static int Capacity(int slot) => slot == 0 ? 6 : slot == 1 ? 1 : 0;
        internal static int SlotOf(string id) => id switch {
            "wand" or "survey-wand" => 0, "bow" or "hunter-bow" => 1, "torch" => 2, _ => -1
        };
        internal string Encode() => JsonConvert.SerializeObject(this, Formatting.None);

        static float Number(JToken value, float fallback, float maximum)
        {
            if (value == null || (value.Type != JTokenType.Float && value.Type != JTokenType.Integer)) return fallback;
            double n = (double)value;
            return !double.IsNaN(n) && !double.IsInfinity(n) ? (float)Math.Min(maximum, Math.Max(0, n)) : fallback;
        }

        internal static ExpeditionLedger Decode(string json) => Decode(json, out _);

        internal static ExpeditionLedger Decode(string json, out bool valid)
        {
            valid = false;
            var s = new ExpeditionLedger();
            if (string.IsNullOrWhiteSpace(json)) return s;
            JObject data;
            try { data = JObject.Parse(json); } catch (JsonException) { return s; }
            if (Number(data["version"], -1, int.MaxValue) != 1) return s;
            valid = true;
            int N(string k, int max) => (int)Number(data[k], 0, max);
            bool B(string k, bool fallback) => data[k]?.Type == JTokenType.Boolean ? (bool)data[k] : fallback;
            var ranks = data["skills"] as JObject;
            foreach (string id in SkillIds) s.skills[id] = (int)Number(ranks?[id], 0, 3);
            s.health = Number(data["health"], 100, s.MaxHealth);
            s.armor = Number(data["armor"], 40, s.MaxArmor);
            s.kills = N("kills", 999999); s.deaths = N("deaths", 999999); s.visit = N("visit", 999999);
            s.xp = N("xp", 999999); s.level = N("level", 999); s.points = N("points", 999);
            s.area = (data["area"] as JValue)?.Value as string == "dungeon" ? "dungeon" : "chapter";
            s.quest = B("quest", false); s.torchLit = B("torchLit", true);
            if (data["claimed"] is JArray claims)
                foreach (var v in claims) {
                    string id = (v as JValue)?.Value as string;
                    if ((id == "reading-supply" || id == "field-cache" || id == "hunt-contract") && !s.claimed.Contains(id)) s.claimed.Add(id);
                }
            var seen = new HashSet<string> { "torch" };
            var worn = data["slots"] as JArray;
            for (int i = 0; i < 2; i++) {
                string id = worn != null && i < worn.Count ? (worn[i] as JValue)?.Value as string : null;
                s.slots[i] = SlotOf(id) == i && seen.Add(id) ? id : null;
                var stock = (data["ammo"] as JObject)?[Weapons[i]] as JObject;
                s.ammo[Weapons[i]].loaded = (int)Number(stock?["loaded"], Capacity(i), Capacity(i));
                s.ammo[Weapons[i]].reserve = (int)Number(stock?["reserve"], i == 0 ? 18 : 16, 999);
            }
            void ReadItems(string k, List<string> target, int limit) {
                if (data[k] is not JArray items) return;
                foreach (var v in items) {
                    string id = (v as JValue)?.Value as string;
                    if (target.Count < limit && SlotOf(id) >= 0 && seen.Add(id)) target.Add(id);
                }
            }
            ReadItems("bag", s.bag, BagLimit); ReadItems("storage", s.storage, StorageLimit);
            for (int i = 0; i < 2; i++)
                if (!seen.Contains(Weapons[i])) {
                    if (s.slots[i] == null) s.slots[i] = Weapons[i]; else s.storage.Add(Weapons[i]);
                }
            int selected = N("selected", 2);
            s.selected = s.slots[selected] == null ? 2 : selected;
            var wave = data["enemies"] as JArray;
            if (s.area == "dungeon" || wave?.Count > 0) {
                s.enemies = NewWave();
                for (int i = 0; wave != null && i < Math.Min(3, wave.Count); i++)
                    s.enemies[i].health = (int)Number((wave[i] as JObject)?["health"], EnemyHealth, EnemyHealth);
            }
            return s;
        }

        static Enemy[] NewWave() => new[] { new Enemy(), new Enemy(), new Enemy() };
        internal void Enter() { area = "dungeon"; visit++; enemies = NewWave(); }
        internal void Retry() { area = "chapter"; health = MaxHealth; deaths++; }
        internal bool Move(string id, string from, string to, bool nearStash)
        {
            int slot = SlotOf(id);
            if (id == "torch" || slot < 0 || from == to || ((from == "storage" || to == "storage") && !nearStash)) return false;
            if (from == "bag" && to == "worn" && bag.Remove(id)) {
                if (slots[slot] != null) bag.Add(slots[slot]);
                slots[slot] = id; selected = slot; return true;
            }
            if (from == "worn" && to == "bag" && slots[slot] == id && bag.Count < BagLimit) {
                slots[slot] = null; bag.Add(id); if (selected == slot) selected = 2; return true;
            }
            if (from == "bag" && to == "storage" && storage.Count < StorageLimit && bag.Remove(id)) { storage.Add(id); return true; }
            if (from == "storage" && to == "bag" && bag.Count < BagLimit && storage.Remove(id)) { bag.Add(id); return true; }
            return false;
        }
        internal bool Claim(string id)
        {
            if ((id != "reading-supply" && id != "field-cache") || claimed.Contains(id)) return false;
            var destination = bag.Count < BagLimit ? bag : storage;
            if (destination == storage && storage.Count >= StorageLimit) return false;
            string gear = id == "reading-supply" ? "survey-wand" : "hunter-bow";
            if (!bag.Contains(gear) && !storage.Contains(gear) && !slots.Contains(gear)) destination.Add(gear);
            claimed.Add(id); Supplies(12, 10, 25); return true;
        }
        void Supplies(int crystals, int arrows, int protection) {
            ammo["wand"].reserve = Math.Min(999, ammo["wand"].reserve + crystals);
            ammo["bow"].reserve = Math.Min(999, ammo["bow"].reserve + arrows);
            armor = Math.Min(MaxArmor, armor + protection);
        }
        internal string Talk(out bool emergency)
        {
            health = MaxHealth;
            string result = "exp.mira.progress";
            if (!quest) { quest = true; result = "exp.mira.contract"; }
            else if (kills >= 3 && !claimed.Contains("hunt-contract")) {
                claimed.Add("hunt-contract"); points++; armor = MaxArmor; result = "exp.mira.reward";
            }
            emergency = ammo.Values.All(a => a.loaded == 0 && a.reserve == 0);
            if (emergency) Supplies(6, 6, 0);
            return result;
        }
        internal bool Upgrade(string skill)
        {
            if (!skills.TryGetValue(skill, out var rank) || rank >= 3 || points <= 0) return false;
            skills[skill]++; points--;
            if (skill == "vitality") health = Math.Min(MaxHealth, health + 20);
            if (skill == "ward") armor = Math.Min(MaxArmor, armor + 15);
            return true;
        }
        internal bool Consume(int slot) {
            if (slot < 0 || slot > 1 || slots[slot] == null || ammo[Weapons[slot]].loaded <= 0) return false;
            ammo[Weapons[slot]].loaded--; return true;
        }
        internal int Reload(int slot) {
            if (slot < 0 || slot > 1 || slots[slot] == null) return 0;
            var stock = ammo[Weapons[slot]];
            int count = Math.Min(Capacity(slot) - stock.loaded, stock.reserve);
            stock.loaded += count; stock.reserve -= count;
            return count;
        }
        internal int DamageFor(int slot, float draw) {
            float power = slot == 0 ? 26 : 24 + 32 * Mathf.Clamp01(draw);
            float bonus = slots[slot] switch { "survey-wand" => 6, "hunter-bow" => 8, _ => 0 };
            return Mathf.FloorToInt((power + bonus) * (1 + 0.25f * skills["power"]) + 0.5f);
        }
        internal bool Hit(int enemy, int amount)
        {
            if (area != "dungeon" || enemy < 0 || enemy >= enemies.Length || enemies[enemy].health <= 0 || amount <= 0) return false;
            var foe = enemies[enemy];
            foe.health = Math.Max(0, foe.health - amount);
            if (foe.health == 0) {
                kills++; xp += 30; Supplies(5, 4, 8);
                while (xp >= NextLevel) { xp -= NextLevel; level++; points++; }
            }
            return true;
        }
        internal void Damage(float amount)
        {
            if (float.IsNaN(amount) || float.IsInfinity(amount) || amount <= 0 || health <= 0) return;
            float absorbed = Math.Min(armor, amount * (0.5f + 0.1f * skills["ward"]));
            armor -= absorbed; health = Math.Max(0, health - (amount - absorbed));
        }
    }
}
