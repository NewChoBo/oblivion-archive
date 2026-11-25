using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Archive.Arena
{
    [DisallowMultipleComponent]
    public sealed partial class ArchiveArena : MonoBehaviour
    {
        public GameObject gothic, guard, specter;
        public Texture2D paving, masonry;
        public ArenaMatch Match { get; private set; }
        public bool Firearms => active && armory != null;
        ChapterPlayer player;
        JObject catalog;
        ArenaBoard board;
        ArenaArmory armory;
        ArenaCombatant captive;
        readonly List<ArenaCombatant> foes = new();
        readonly Dictionary<ArenaCombatant, float> recovering = new();
        string selection = "deathmatch", levelId = "gothic-arena", focus;
        int hp;
        bool menu, active, shop, map = true, contested;
        float markerTime;
        bool critical;
        int shots, headshots;
        public static void OpenMenu(ChapterPlayer p)
        {
            var a = p.GetComponent<ArchiveArena>();
            if (a)
                a.ShowMenu();
        }
        public static bool MenuOpen(ChapterPlayer p)
        {
            var a = p.GetComponent<ArchiveArena>();
            return a && a.menu;
        }
        public static bool UsesFirearms(ChapterPlayer p)
        {
            var a = p.GetComponent<ArchiveArena>();
            return a && a.Firearms;
        }
        public static bool Playing(ChapterPlayer p)
        {
            var a = p.GetComponent<ArchiveArena>();
            return a && a.active;
        }
        public JObject Inspect() =>
            new JObject { ["menu"] = menu,
                          ["active"] = active,
                          ["mode"] = selection,
                          ["level"] = levelId,
                          ["focus"] = focus,
                          ["health"] = hp,
                          ["round"] = Match?.Round,
                          ["kills"] = Match?.Kills,
                          ["phase"] = Match?.Phase.ToString(),
                          ["objective"] = Match?.Objective,
                          ["remaining"] = Match?.Remaining,
                          ["reason"] = Match?.Reason,
                          ["weapon"] = armory?.Id,
                          ["magazine"] = armory?.Magazine,
                          ["reserve"] = armory?.Reserve,
                          ["credits"] = armory?.Credits,
                          ["shop"] = shop,
                          ["shots"] = shots,
                          ["headshots"] = headshots,
                          ["foes"] = new JArray(foes.Select(
                              e => new JObject { ["x"] = e.transform.position.x, ["z"] = e.transform.position.z,
                                                 ["hp"] = e.health, ["headY"] = e.HeadHeight })) };
        void Awake()
        {
            player = GetComponent<ChapterPlayer>();
            catalog = JObject.Parse(Resources.Load<TextAsset>("ArchiveModes/catalog").text);
        }
        void ShowMenu()
        {
            menu = true;
            player.InputBlocked = true;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }
        string T(string id)
        {
            string lang = player.Korean ? "ko" : "en";
            return (string)catalog["text"][lang][id] ?? (string)catalog["text"]["en"][id] ??
                   player.Text("arena." + id);
        }
        void StartMatch()
        {
            var mode = catalog["modes"][selection];
            if (!mode["levelIds"].Values<string>().Contains(levelId))
                levelId = (string)mode["levelIds"][0];
            if (board != null)
                ClearWorld();
            board = new ArenaBoard((JObject)catalog["levels"][levelId], this);
            Match = new ArenaMatch((JObject)catalog["rules"][(string)mode["ruleId"]]);
            armory=(bool?)mode["firearms"]==true ? new ArenaArmory(catalog["firearms"]) : null;
            active = true;
            menu = shop = false;
            player.SetArena(true);
            player.BeginPlay();
            player.InputBlocked = false;
            var lv = board.Level;
            foreach (var p in lv["enemySpawns"])
                foes.Add(ArenaCombatant.Spawn(board, this, board.Point(p),
                                              lv["enemyKind"] != null ? guard : specter));
            if (Match.Kind == "ward")
                foreach (var w in lv["wards"])
                    board.Mark((string)w["id"], board.Point(w["position"]), true);
            if (Match.Kind == "bomb")
                foreach (var site in lv["objectives"]["bombSites"])
                    board.Mark((string)site["id"], board.Point(site["position"]), true);
            if (Match.Kind == "rescue")
            {
                var pos = board.Point(lv["objectives"]["hostage"]);
                captive = ArenaCombatant.Spawn(board, this, pos, guard, true);
                board.Mark("hostage", pos, false);
                board.Mark("extraction", board.Point(lv["objectives"]["extraction"]), true);
            }
            ResetRound();
        }
        void ResetRound()
        {
            player.Weapons.ResetArena();
            hp = 100;
            shots = headshots = 0;
            recovering.Clear();
            focus = null;
            contested = false;
            markerTime = 0;
            foreach (var actor in foes)
                actor.ResetAtSpawn();
            if (captive)
                captive.ResetAtSpawn();
            armory?.Round(Match.Round == 1);
            player.InputBlocked = false;
            player.Teleport(board.Spawn, (float)board.Level["heading"] * Mathf.Rad2Deg);
            Physics.SyncTransforms();
        }
        void ClearWorld()
        {
            ReleaseGun();
            board?.Dispose();
            board = null;
            foes.Clear();
            recovering.Clear();
            captive = null;
            armory = null;
            Match = null;
            active = false;
            shop = false;
        }
        public void Leave()
        {
            ClearWorld();
            menu = false;
            player.InputBlocked = false;
            player.ReturnToTitle();
        }
        public void ResetOnTitle()
        {
            if (active)
                ClearWorld();
            menu = false;
        }
        void LateUpdate()
        {
            if (menu)
            {
                if (Input.GetKeyDown(KeyCode.Escape))
                {
                    menu = false;
                    player.InputBlocked = false;
                }
                return;
            }
            if (!active)
                return;
            if (Match.Phase != MatchPhase.Playing)
            {
                BlockForPanel();
                if (Input.GetKeyDown(KeyCode.Return))
                    AdvanceResult();
                return;
            }
            if (shop)
            {
                if (player.Bindings.Down(PlayerAction.Shop) || Input.GetKeyDown(KeyCode.Escape))
                    ToggleShop();
                return;
            }
            if (!player.CanAct)
            {
                SetGunVisible(false);
                return;
            }
            if (player.Bindings.Down(PlayerAction.Map))
                map = !map;
            if (Firearms && player.Bindings.Down(PlayerAction.Shop) && AtShop())
            {
                ToggleShop();
                return;
            }
            float dt = Time.deltaTime;
            if (Firearms)
                GunUpdate(dt);
            var pos = player.transform.position;
            if (pos.y < board.Root.position.y - 4 || !board.Inside(pos))
            {
                Incoming(100);
                return;
            }
            foreach (var actor in foes)
            {
                if (!actor.Alive)
                {
                    if (recovering.TryGetValue(actor, out float delay))
                    {
                        if (delay <= dt)
                        {
                            actor.ResetAtSpawn();
                            recovering.Remove(actor);
                        }
                        else
                            recovering[actor] = delay - dt;
                    }
                    continue;
                }
                bool guarding = Match.Objective != null && (Match.Kind == "ward" || Match.Kind == "bomb");
                actor.Tick(pos, GetComponent<CharacterController>().height * .64f,
                           guarding ? board.Objectives[Match.Objective] : pos, guarding, dt);
            }
            focus = FocusObjective(pos);
            if (focus != null && player.InteractPressed)
                Match.ObjectiveReached(focus);
            if (Match.Kind == "rescue" && Match.Objective != null && captive && captive.Alive)
                captive.Move(pos, dt, 2.8f);
            contested = false;
            if (Match.Objective != null && (Match.Kind == "ward" || Match.Kind == "bomb"))
            {
                float radius = Match.Kind == "bomb"
                                   ? .85f
                                   : (float)board.Level["wards"].First(w => (string)w["id"] ==
                                                                            Match.Objective)["contestRadius"];
                contested = foes.Any(
                    e => e.Alive && e.Stun <= 0 &&
                         ArenaCombatant.Flat(e.transform.position, board.Objectives[Match.Objective]) < radius);
            }
            bool extracted =
                Match.Kind == "rescue" && Match.Objective != null && captive && captive.Alive &&
                ArenaCombatant.Flat(pos, board.Objectives["extraction"]) < 1.8f &&
                ArenaCombatant.Flat(captive.transform.position, board.Objectives["extraction"]) < 1.25f;
            Match.Tick(dt, contested, extracted);
            markerTime = Mathf.Max(0, markerTime - dt);
        }
        string FocusObjective(Vector3 pos)
        {
            if (Match.Objective != null)
                return null;
            var camera = player.ViewCamera.transform;
            float best = .46f;
            string candidate = null;
            foreach (var entry in board.Objectives)
            {
                if (entry.Key == "extraction" || ArenaCombatant.Flat(entry.Value, pos) > 2.15f)
                    continue;
                Vector3 target = entry.Value + Vector3.up * (entry.Key == "hostage" ? 1.25f : .24f);
                Vector3 offset = target - camera.position;
                float dot = Vector3.Dot(camera.forward, offset.normalized);
                if (dot < best)
                    continue;
                // Walls and cover block interaction; an escort's own body and the player's rig do not.
                var hits = Physics.RaycastAll(camera.position, offset.normalized, offset.magnitude - .06f, ~0,
                                              QueryTriggerInteraction.Ignore);
                if (hits.Any(h => !h.collider.transform.IsChildOf(player.transform) &&
                                  !(entry.Key == "hostage" &&
                                    h.collider.GetComponentInParent<ArenaCombatant>() == captive)))
                    continue;
                best = dot;
                candidate = entry.Key;
            }
            return candidate;
        }
        internal void ActorDown(ArenaCombatant actor)
        {
            if (actor.Hostage)
            {
                Match.LoseHostage();
                return;
            }
            Match.Kill();
            armory?.Reward();
            if (Match.Kind == "score")
                recovering[actor] = 2.2f;
        }
        internal void HitFeedback(bool head, bool killed)
        {
            critical = head;
            markerTime = killed ? .7f : .34f;
        }
        internal void Incoming(int damage)
        {
            if (Match.Phase != MatchPhase.Playing)
                return;
            hp = Mathf.Max(0, hp - damage);
            if (hp == 0 && Match.Fall())
            {
                hp = 100;
                armory?.Restock();
                if (armory == null)
                    player.Weapons.ResetArena();
                player.Teleport(board.Spawn, 0);
            }
        }
        bool AtShop() => armory != null && Match.ShopTime
                         && Mathf.Abs(player.transform.position.y - board.Spawn.y) < 1.25f &&
                         ArenaCombatant.Flat(player.transform.position, board.Spawn) < 2.1f;
        void BlockForPanel()
        {
            player.InputBlocked = true;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }
        void ToggleShop()
        {
            shop = !shop;
            if (shop)
                BlockForPanel();
            else
                player.InputBlocked = false;
        }
        void AdvanceResult()
        {
            if (Match.Phase == MatchPhase.BetweenRounds)
            {
                Match.NextRound();
                ResetRound();
            }
            else
                StartMatch();
        }
    }
}
