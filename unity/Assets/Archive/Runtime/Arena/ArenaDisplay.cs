using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Archive.Arena
{
    public sealed partial class ArchiveArena
    {
        Font face;
        GUIStyle type, button;
        readonly Color panel = new(.044f, .068f, .091f, .95f), gold = new(.91f, .72f, .43f),
                       teal = new(.39f, .79f, .76f);
        void Fill(Rect r, Color color)
        {
            var old = GUI.color;
            GUI.color = color;
            GUI.DrawTexture(r, Texture2D.whiteTexture);
            GUI.color = old;
        }
        void Label(Rect rect, string value, float size, Color color, TextAnchor align = TextAnchor.MiddleLeft)
        {
            type.fontSize = Mathf.RoundToInt(size);
            type.normal.textColor = color;
            type.alignment = align;
            GUI.Label(rect, value, type);
        }
        bool Button(Rect r, string label, bool selected = false)
        {
            Fill(r, selected ? new Color(.18f, .32f, .34f) : new Color(.12f, .16f, .19f));
            if (selected)
                Fill(new Rect(r.x, r.y, 3, r.height), gold);
            return GUI.Button(r, label, button);
        }
        void OnGUI()
        {
            if (!menu && (!active || (!player.IsPlaying && Match?.Phase == MatchPhase.Playing)))
                return;
            if (!face)
                face = Resources.Load<Font>("ArchiveHudFont");
            type ??= new GUIStyle(GUI.skin.label) { font = face, wordWrap = true,
                                                    padding = new RectOffset(4, 4, 0, 0) };
            button ??= new GUIStyle(type) { alignment = TextAnchor.MiddleCenter, fontSize = 17,
                                            normal = { textColor = Color.white } };
            float referenceWidth = Screen.width < Screen.height ? 360 : 760;
            float scale =
                Mathf.Clamp(Mathf.Min(Screen.width / referenceWidth, Screen.height / 500f), .52f, 1.65f);
            var saved = GUI.matrix;
            GUI.matrix = Matrix4x4.Scale(Vector3.one * scale);
            float w = Screen.width / scale, h = Screen.height / scale;
            if (menu)
                Menu(w, h);
            else if (Match.Phase != MatchPhase.Playing || shop)
                Panel(w, h);
            else
                Hud(w, h);
            GUI.matrix = saved;
        }
        void Menu(float w, float h)
        {
            float width = Mathf.Min(w - 24, 694), height = 422, x = (w - width) / 2, y = (h - height) / 2;
            Fill(new Rect(x, y, width, height), panel);
            Fill(new Rect(x, y, 4, height), gold);
            Label(new Rect(x + 22, y + 14, width - 44, 44), T("practice"), 29, gold);
            float col = (width - 54) / 2;
            int index = 0;
            foreach (var id in ((JObject)catalog["modes"]).Properties().Select(p => p.Name))
            {
                if (Button(new Rect(x + 22 + (index % 2) * (col + 10), y + 70 + 47 * (index / 2), col, 40),
                           T(id), selection == id))
                {
                    selection = id;
                    if (!catalog["modes"][id]["levelIds"].Values<string>().Contains(levelId))
                        levelId = (string)catalog["modes"][id]["levelIds"][0];
                }
                index++;
            }
            Label(new Rect(x + 22, y + 218, width - 44, 32), T("mapSelect"), 16, teal);
            int m = 0;
            foreach (string id in catalog["modes"][selection]["levelIds"].Values<string>())
            {
                if (Button(new Rect(x + 22 + (m++) * (col + 10), y + 255, col, 38), T(id), levelId == id))
                    levelId = id;
            }
            var rule = catalog["rules"][(string)catalog["modes"][selection]["ruleId"]];
            string setup = T("setup." + selection)
                               .Replace("{time}", (string)rule["timeLimit"])
                               .Replace("{target}", (string)(rule["target"] ?? rule["roundsToWin"]));
            Label(new Rect(x + 22, y + 298, width - 44, 52), setup, 16, Color.white);
            if (Button(new Rect(x + 22, y + 360, col, 40), T("back")))
            {
                menu = false;
                player.InputBlocked = false;
            }
            if (Button(new Rect(x + 32 + col, y + 360, col, 40), T("start"), true))
                StartMatch();
        }
        void Panel(float w, float h)
        {
            float width = Mathf.Min(w - 24, 440), x = (w - width) / 2, y = (h - 286) / 2;
            Fill(new Rect(x, y, width, 286), panel);
            string title = shop ? T("store")
                                : T((Match.Phase == MatchPhase.Complete ? "match." : "round.") +
                                    (Match.Won ? "won" : "lost"));
            Label(new Rect(x + 18, y + 12, width - 36, 45), title, 27, gold);
            if (shop)
            {
                Label(new Rect(x + 18, y + 62, width - 36, 30),
                      T("shop.balance").Replace("{credits}", armory.Credits.ToString()), 18, Color.white);
                if (Button(new Rect(x + 18, y + 105, width - 36, 35),
                           T(armory.RifleOwned ? "shop.owned" : "shop.rifle").Replace("{price}", "650")))
                    armory.Buy(true);
                if (Button(new Rect(x + 18, y + 149, width - 36, 35),
                           T("shop.ammo").Replace("{refillPrice}", "120")))
                    armory.Buy(false);
                if (Button(new Rect(x + 18, y + 220, width - 36, 40), T("close")))
                    ToggleShop();
                return;
            }
            Label(new Rect(x + 18, y + 70, width - 36, 49), T("reason." + Match.Reason), 18, Color.white);
            Label(new Rect(x + 18, y + 128, width - 36, 34),
                  T("result.rounds")
                      .Replace("{wins}", Match.Wins.ToString())
                      .Replace("{losses}", Match.Losses.ToString()),
                  17, teal);
            if (Button(new Rect(x + 18, y + 182, width - 36, 38),
                       T(Match.Phase == MatchPhase.Complete ? "result.replay" : "result.next"), true))
                AdvanceResult();
            if (Button(new Rect(x + 18, y + 233, width - 36, 34), T("leave")))
                Leave();
        }
        void Hud(float w, float h)
        {
            int seconds = Mathf.CeilToInt(Match.TimeLeft);
            string score = Match.Kind == "score"
                               ? T("kills") + " " + Match.Kills + "/" + Match.Target
                               : T("round") + " " + Match.Round + "    " + Match.Wins + " – " + Match.Losses;
            float header = Mathf.Min(w - 16, 346);
            Fill(new Rect((w - header) / 2, 8, header, 48), panel);
            Label(new Rect((w - header) / 2 + 8, 8, header * .6f, 22), T(selection), 15, gold);
            Label(new Rect((w - header) / 2 + 8, 29, header * .74f, 24), score, 16, Color.white);
            Label(new Rect(w / 2 + header * .23f, 12, header * .25f, 36), $"{seconds/60:00}:{seconds%60:00}",
                  20, Color.white, TextAnchor.MiddleRight);
            if (map)
                DrawMap(14, w < 560 ? h - 185 : 16, Mathf.Min(128, w * .24f));
            string status = Strategy();
            if (status.Length > 0)
                Label(new Rect(w * .17f, 61, w * .66f, 50), status, 16, teal, TextAnchor.UpperCenter);
            if (focus != null && Match.Objective == null)
            {
                var key = player.Bindings.Key(PlayerAction.Interact);
                string action = Match.Kind == "ward" ? T("ward.activate").Replace("{ward}", T(focus))
                                                     : T("interact." + focus);
                Label(new Rect(0, h * .62f, w, 36), "[" + key + "]   " + action, 19, gold,
                      TextAnchor.MiddleCenter);
            }
            Fill(new Rect(12, h - 54, 153, 40), panel);
            Label(new Rect(21, h - 54, 133, 40), T("hp") + "    " + hp, 19, hp < 30 ? Color.red : Color.white);
            if (Firearms)
            {
                string tool = T(armory.Id);
                Fill(new Rect(w - 228, h - 79, 216, 64), panel);
                Label(new Rect(w - 220, h - 79, 200, 28), tool, 15, gold);
                Label(new Rect(w - 220, h - 51, 200, 30),
                      armory.Reloading ? T("firearm.reloading") : $"{armory.Magazine}   /   {armory.Reserve}",
                      22, Color.white);
                if (AtShop())
                    Label(new Rect(w - 216, h - 108, 203, 27),
                          "[" + player.Bindings.Key(PlayerAction.Shop) + "]  " + T("store"), 15, teal,
                          TextAnchor.MiddleRight);
                Fill(new Rect(w / 2 - 1, h / 2 - 1, 3, 3), Color.white);
            }
            if (markerTime > 0)
                Label(new Rect(w / 2 - 56, h / 2 + 14, 112, 28), T(critical ? "head" : "hit"), 16,
                      critical ? gold : teal, TextAnchor.MiddleCenter);
        }
        string Strategy()
        {
            switch (Match.Kind)
            {
            case "ward":
                return Match.Objective == null
                           ? T("ward.choose").Replace("{seconds}", "8")
                           : T(contested ? "ward.contested" : "ward.holding")
                                 .Replace("{ward}", T(Match.Objective))
                                 .Replace("{seconds}", Mathf.CeilToInt(Match.Remaining).ToString());
            case "bomb":
                return T(Match.Objective == null ? "bomb.choose"
                         : contested             ? "bomb.defusing"
                                                 : "bomb.active")
                    .Replace("{site}", Match.Objective == "site-a" ? "A" : "B")
                    .Replace("{seconds}", Mathf.CeilToInt(Match.Remaining).ToString());
            case "rescue":
                return T(Match.Objective == null ? "rescue.choose" : "rescue.escort");
            case "elimination":
                return T("elimination.remaining")
                    .Replace("{roundKills}", Match.RoundKills.ToString())
                    .Replace("{enemyTarget}", foes.Count.ToString());
            default:
                return "";
            }
        }
        void DrawMap(float x, float y, float size)
        {
            Fill(new Rect(x, y, size, size), panel);
            var center = board.Point(board.Level["floor"]["position"]);
            var dims = ArenaBoard.Vec(board.Level["floor"]["size"]);
            float k = (size - 12) / Mathf.Max(dims.x, dims.z);
            Vector2 Project(Vector3 p) =>
                new(x + size / 2 + (p.x - center.x) * k, y + size / 2 - (p.z - center.z) * k);
            foreach (var b in board.Obstacles)
            {
                var p = Project(b.center);
                Fill(new Rect(p.x - b.size.x * k / 2, p.y - b.size.z * k / 2, b.size.x * k, b.size.z * k),
                     new Color(.35f, .41f, .45f));
            }
            void Dot(Vector3 p, float r, Color col)
            {
                var c = Project(p);
                Fill(new Rect(c.x - r, c.y - r, r * 2, r * 2), col);
            }
            foreach (var goal in board.Objectives)
                Dot(goal.Value, 2.6f, gold);
            foreach (var actor in foes)
                if (actor.Alive)
                    Dot(actor.transform.position, 2, new Color(.92f, .4f, .37f));
            if (captive && captive.Alive)
                Dot(captive.transform.position, 2.8f, Color.green);
            Dot(player.transform.position, 3, teal);
            Dot(player.transform.position + player.transform.forward * .8f, 1.6f, Color.white);
        }
    }
}
