using System;
using System.IO;
using Newtonsoft.Json.Linq;
using Archive.Arena;
using UnityEngine;

namespace Archive.Editor
{
    internal static class ArenaValidation
    {
        internal static void Check()
        {
            var data =
                JObject.Parse(File.ReadAllText("Assets/Archive/Generated/Resources/ArchiveModes/catalog.json"));
            ArenaMatch New(string id) => new((JObject)data["rules"][id]);
            void Assert(bool ok, string message)
            {
                if (!ok)
                    throw new InvalidDataException("Practice regression: " + message);
            }
            foreach (string id in new[] { "deathmatch", "ink-hunt" })
            {
                var m = New(id);
                Assert(m.Fall(), "score respawn");
                for (int i = 0; i < m.Target; i++)
                    m.Kill();
                Assert(m.Won && m.Phase == MatchPhase.Complete && m.Deaths == 1, id);
            }
            var ward = New("ward-defense");
            ward.ObjectiveReached("east-ward");
            ward.Tick(9, true, false);
            Assert(ward.Remaining == 8, "contested ward");
            ward.Tick(8, false, false);
            ward.NextRound();
            Assert(ward.Round == 2 && ward.Objective == null, "ward retry");
            ward.ObjectiveReached("west-ward");
            ward.Tick(8, false, false);
            Assert(ward.Won && ward.Phase == MatchPhase.Complete, "ward series");
            var bomb = New("bomb");
            bomb.ObjectiveReached("site-a");
            bomb.Tick(4, true, false);
            Assert(bomb.Reason == "defused", "defuse");
            bomb.NextRound();
            bomb.ObjectiveReached("site-b");
            bomb.Tick(15, false, false);
            Assert(bomb.Reason == "detonated", "detonation");
            var rescue = New("rescue");
            rescue.ObjectiveReached("hostage");
            rescue.Tick(.1f, false, true);
            Assert(rescue.Reason == "rescued", "escort");
            rescue.NextRound();
            rescue.LoseHostage();
            Assert(!rescue.Won, "captive loss");
            var clear = New("elimination");
            for (int i = 0; i < 3; i++)
                clear.Kill();
            Assert(clear.Reason == "eliminated", "last opponent");
            ExpeditionChecks.Validate();
            Debug.Log("Archive: six match rule sets and expedition save/gear checks passed.");
        }
    }
}
