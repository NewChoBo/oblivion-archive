using System;
using System.Linq;
using System.Runtime.InteropServices;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Archive
{
    // Web builds share the existing chapter/codex localStorage keys on the same origin.
    internal static class StoryCheckpoint
    {
        internal const string Key = "oblivion-archive.chapter1.v1";
        internal static string LoreKey(string id) => "oblivion-archive.codex.v1." + id;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern string ArchiveStoryRead(string key);
        [DllImport("__Internal")] static extern void ArchiveStoryWrite(string key, string value);
#endif
        internal static string Read(string key)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            return ArchiveStoryRead(key);
#else
            return PlayerPrefs.GetString(key, "");
#endif
        }

        internal static void Write(string key, string value)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            ArchiveStoryWrite(key, value);
#else
            if (value == null) PlayerPrefs.DeleteKey(key);
            else PlayerPrefs.SetString(key, value);
            PlayerPrefs.Save();
#endif
        }

        internal sealed class Data
        {
            public int Phase;
            public bool Clue;
            public int[] Runes;
        }

        internal static Data Decode(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            try
            {
                JObject value = JObject.Parse(json);
                bool Within(JToken t, int lo, int hi) => t?.Type == JTokenType.Integer && (long)t >= lo && (long)t <= hi;
                if (!Within(value["phase"], 1, 5) || value["clue"]?.Type != JTokenType.Boolean ||
                    value["runes"] is not JArray runes || runes.Count != 3 || !runes.All(r => Within(r, 0, 2))) return null;
                return new Data { Phase = (int)value["phase"], Clue = (bool)value["clue"], Runes = runes.Values<int>().ToArray() };
            }
            catch (Newtonsoft.Json.JsonException) { return null; }
            catch (OverflowException) { return null; }
            catch (InvalidCastException) { return null; }
        }

        internal static void Save(Data data) => Write(Key, new JObject {
            ["phase"] = data.Phase, ["runes"] = new JArray(data.Runes), ["clue"] = data.Clue
        }.ToString(Newtonsoft.Json.Formatting.None));
    }
}
