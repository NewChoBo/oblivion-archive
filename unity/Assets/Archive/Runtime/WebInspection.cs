using System.Runtime.InteropServices;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Archive
{
    internal static class WebInspection
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        static extern int ArchiveInspectionEnabled();
        [DllImport("__Internal")]
        static extern void ArchiveReportPose(float x, float y, float z, float yaw, float pitch, string phase,
                                             string target, string detail);
        static readonly bool enabled = ArchiveInspectionEnabled() != 0;
        static float nextSample;
#endif

        // Read-only samples for an explicitly opened inspection URL. Coordinates are metres,
        // and yaw/pitch are Unity degrees. Ordinary builds and editor play need no JS bridge.
        public static void Tick(Transform player, float pitch, string phase, string target)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            if (!enabled || Time.unscaledTime < nextSample)
                return;
            nextSample = Time.unscaledTime + 0.1f;
            Vector3 p = player.position;
            var actor = player.GetComponent<ChapterPlayer>();
            var story = player.GetComponent<ChapterStory>();
            var arena = player.GetComponent<Archive.Arena.ArchiveArena>();
            var weapon = actor.Weapons;
            var extra = new JObject { ["posture"] = actor.Posture,
                                      ["third"] = actor.ThirdPerson,
                                      ["clip"] = actor.AnimationClip,
                                      ["leftHand"] = actor.Bindings.LeftHand,
                                      ["shoulder"] = actor.Bindings.Shoulder,
                                      ["slot"] = weapon.Selected,
                                      ["draw"] = weapon.Draw,
                                      ["shots"] = weapon.Shots,
                                      ["headshots"] = weapon.Headshots,
                                      ["impact"] = weapon.LastImpact,
                                      ["wand"] = weapon.Loaded(0),
                                      ["bow"] = weapon.Loaded(1),
                                      ["chapter"] = story.Phase,
                                      ["intro"] = story.IntroPage,
                                      ["runes"] = new JArray(story.Runes),
                                      ["records"] = new JArray(story.Records),
                                      ["arena"] = arena.Inspect(),
                                      ["expedition"] =
                                          actor.Expedition ? JObject.Parse(actor.Expedition.Summary()) : null };
            ArchiveReportPose(p.x, p.y, p.z, player.eulerAngles.y, pitch, phase, target,
                              extra.ToString(Formatting.None));
#endif
        }
    }
}
