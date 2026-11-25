#if UNITY_EDITOR
using System;
using System.Linq;

namespace Archive
{
    public static class ExpeditionChecks
    {
        // Safe to run at build time; these ledgers never touch the user's save backend.
        public static void Validate()
        {
            static void Expect(bool condition, string message) {
                if (!condition) throw new InvalidOperationException("Expedition regression: " + message);
            }
            var s = new ExpeditionLedger();
            ExpeditionLedger.Decode(null, out bool empty);
            ExpeditionLedger.Decode("{\"version\":99}", out bool unknown);
            ExpeditionLedger.Decode(s.Encode(), out bool saved);
            Expect(!empty && !unknown && saved,"only supported saved expeditions enable Continue before the first story checkpoint");
            Expect(s.Claim("reading-supply") && !s.Claim("reading-supply"), "reading cache is paid once");
            Expect(s.Move("survey-wand","bag","worn",false) && s.bag.Single()=="wand", "equipping swaps exactly one wand");
            Expect(!s.Move("wand","bag","storage",false), "storage requires proximity");
            Expect(s.Move("wand","bag","storage",true) && s.Move("wand","storage","bag",true), "storage round-trip");
            Expect(s.Move("survey-wand","worn","bag",false) && s.selected==2 && !s.Consume(0), "an absent weapon cannot fire");
            Expect(s.Move("survey-wand","bag","worn",false), "re-equip the wand");
            Expect(s.Consume(0) && s.Reload(0)==1 && s.ammo["wand"].reserve==29, "reload transfers exactly one reserve");
            s.Enter();
            Expect(s.visit==1 && s.enemies.Length==3 && s.DamageFor(0,0)==32, "wave and survey wand bonus");
            Expect(s.DamageFor(1,1)>s.DamageFor(1,0), "bow charge changes damage");
            int headDamage = 2*s.DamageFor(0,0);
            Expect(s.Hit(0,headDamage) && s.enemies[0].health==8 && s.Hit(0,8), "head/body damage routed to correct wraith");
            Expect(!s.Hit(0,50) && s.kills==1 && s.ammo["bow"].reserve==30, "dead enemies have one reward");
            Expect(s.Hit(1,72) && s.Hit(2,72) && s.xp==30 && s.points==1 && s.level==1, "experience thresholds");
            Expect(s.Upgrade("power") && s.DamageFor(0,0)==40 && !s.Upgrade("ward"), "spend only available points");
            s.Talk(out _); string reward=s.Talk(out _);
            Expect(reward=="exp.mira.reward" && s.points==1 && s.Talk(out _)!="exp.mira.reward", "contract paid once");
            s.Damage(9);
            Expect(s.armor==55.5f && s.health==95.5f, "fractional damage crosses armor and health");
            var restored=ExpeditionLedger.Decode(s.Encode());
            Expect(restored.Encode()==s.Encode(), "valid browser-format save round-trips without loss");
            restored.Claim("field-cache"); restored.Retry();
            Expect(restored.area=="chapter" && restored.health==100 && restored.deaths==1, "retry returns to chapter and restores health");
            Expect(restored.visit==1 && restored.kills==3 && restored.ammo["wand"].reserve==56 && !restored.Claim("field-cache"), "retry preserves used claims and finite ammunition");
            restored.Enter(); Expect(restored.enemies.All(e=>e.health==72) && restored.visit==2,"new visit renews wave");
            foreach(var stock in restored.ammo.Values) { stock.loaded=0;stock.reserve=0; }
            restored.Talk(out bool first); restored.Talk(out bool duplicate);
            Expect(first && !duplicate && restored.ammo["wand"].reserve==6, "Mira only resupplies an exhausted expedition");
            const string legacy="{\"version\":1,\"bag\":[\"wand\",\"wand\",\"bogus\"],\"storage\":[\"wand\"],\"slots\":[null],\"ammo\":{\"wand\":{\"loaded\":90,\"reserve\":-5}},\"health\":800,\"skills\":{\"ward\":30}}";
            var cleaned=ExpeditionLedger.Decode(legacy);
            Expect(cleaned.bag.SequenceEqual(new[]{"wand"}) && cleaned.storage.Count==0 && cleaned.slots[1]=="bow", "valid gear has one location and missing starter weapons are repaired");
            Expect(cleaned.ammo["wand"].loaded==6 && cleaned.ammo["wand"].reserve==0 && cleaned.health==100 && cleaned.skills["ward"]==3, "public save inputs are bounded");
        }
    }
}
#endif
