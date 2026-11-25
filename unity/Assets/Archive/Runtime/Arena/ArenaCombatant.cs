using UnityEngine;
using System.Linq;

namespace Archive.Arena
{
    public sealed class ArenaCombatant : MonoBehaviour, IArchiveDamageable
    {
        public bool Hostage { get; private set; }
        public bool Alive => health > 0;
        public float Stun { get; private set; }
        internal int health;
        Vector3 spawn, waypoint, lastGoal;
        float shotClock, navigationClock;
        ArchiveArena arena;
        ArenaBoard board;
        Transform headBone, headHitbox;
        Transform grip;
        Transform[] arms;
        LineRenderer beam;
        Material beamMaterial;
        Vector3 barrelEnd, aimedAt;
        float flash;
        internal float HeadHeight => headHitbox.position.y;
        Animation animationRig;
        bool walking;
        internal static ArenaCombatant Spawn(ArenaBoard board, ArchiveArena arena, Vector3 at, GameObject model,
                                             bool captive = false)
        {
            var root = new GameObject(captive ? "Captive archivist" : "Opponent");
            root.transform.SetParent(board.Root, false);
            root.transform.position = at;
            var actor = root.AddComponent<ArenaCombatant>();
            actor.board = board;
            actor.arena = arena;
            actor.Hostage = captive;
            actor.spawn = at;
            var body = root.AddComponent<CapsuleCollider>();
            body.center = Vector3.up * .69f;
            body.radius = .29f;
            body.height = 1.36f;
            var head = new GameObject("Head");
            head.transform.SetParent(root.transform, false);
            head.transform.localPosition = Vector3.up * 1.55f;
            head.AddComponent<SphereCollider>().radius = .215f;
            head.AddComponent<ArchiveHitZone>().head = true;
            var gfx = Object.Instantiate(model, root.transform);
            gfx.transform.localPosition = Vector3.zero;
            var renderers = gfx.GetComponentsInChildren<Renderer>();
            if (model == arena.guard)
            {
                // The authored YBot is 1.7904m from sole to crown. Its enlarged skin culling
                // bounds include all prone poses and cannot be used to position the feet.
                gfx.transform.localScale = Vector3.one * (1.77f / 1.7904f);
                gfx.transform.localPosition = Vector3.zero;
            }
            else if (renderers.Length > 0)
            {
                var bounds = renderers[0].bounds;
                foreach (var r in renderers)
                    bounds.Encapsulate(r.bounds);
                float scale = 1.77f / Mathf.Max(.01f, bounds.size.y);
                var foot = new Vector3(bounds.center.x, bounds.min.y, bounds.center.z);
                var offset = gfx.transform.position - foot;
                gfx.transform.localScale *= scale;
                gfx.transform.localPosition += offset * scale;
            }
            if (model == arena.guard)
                foreach (var joint in gfx.GetComponentsInChildren<Transform>())
                    if (joint.name.EndsWith(":Head") || joint.name == "Head")
                        actor.headBone = joint;
            actor.headHitbox = head.transform;
            if (!captive && arena.Firearms)
            {
                var bones = gfx.GetComponentsInChildren<Transform>();
                actor.arms =
                    new[] { "RightArm", "RightForeArm", "RightHand", "LeftArm", "LeftForeArm", "LeftHand" }
                        .Select(id => bones.First(j => j.name == id || j.name.EndsWith(":" + id)))
                        .ToArray();
                actor.grip = new GameObject("Guard grip").transform;
                actor.grip.SetParent(root.transform, false);
                arena.AttachBlaster(actor.grip, true, out actor.barrelEnd);
                actor.beam = actor.grip.gameObject.AddComponent<LineRenderer>();
                actor.beamMaterial = new Material(Shader.Find("Sprites/Default"));
                actor.beam.sharedMaterial = actor.beamMaterial;
                actor.beam.startColor = new Color(1, .45f, .19f);
                actor.beam.endColor = new Color(1, .22f, .1f, .55f);
                actor.beam.startWidth = .025f;
                actor.beam.endWidth = .008f;
                actor.beam.positionCount = 2;
                actor.beam.enabled = false;
                actor.aimedAt = at + root.transform.forward * 10 + Vector3.up;
            }
            actor.animationRig = gfx.GetComponentInChildren<Animation>();
            if (actor.animationRig && actor.animationRig.GetClip("YBot_Idle"))
                actor.animationRig.Play("YBot_Idle");
            actor.ResetAtSpawn();
            return actor;
        }
        internal void ResetAtSpawn()
        {
            transform.position = spawn;
            health = Hostage ? 100 : 80;
            gameObject.SetActive(true);
            shotClock = 1.6f;
            navigationClock = 0;
            Stun = 0;
        }
        void LateUpdate()
        {
            if (headBone)
                headHitbox.position = headBone.position + transform.up * .095f;
            if (!grip)
                return;
            Vector3 right = transform.right, forward = transform.forward;
            Vector3 at = transform.position + Vector3.up * 1.27f + right * .20f + forward * .25f;
            grip.SetPositionAndRotation(at, Quaternion.LookRotation((aimedAt - at).normalized));
            PlayerRig.Reach(arms[0], arms[1], arms[2], at, -Vector3.up + right * .45f);
            PlayerRig.Reach(arms[3], arms[4], arms[5], at + grip.forward * .24f, -Vector3.up - right * .45f);
            if (flash > 0)
            {
                beam.SetPosition(0, grip.TransformPoint(barrelEnd));
                beam.SetPosition(1, aimedAt);
                flash -= Time.deltaTime;
            }
            beam.enabled = flash > 0;
        }
        void OnDestroy()
        {
            if (beamMaterial)
                Destroy(beamMaterial);
        }
        public void ReceiveHit(ArchiveHit hit)
        {
            if (!Alive || arena.Match == null || arena.Match.Phase != MatchPhase.Playing)
                return;
            health = Mathf.Max(0, health - hit.Damage);
            Stun = .30f;
            arena.HitFeedback(hit.Headshot, health == 0);
            if (health != 0)
                return;
            gameObject.SetActive(false);
            arena.ActorDown(this);
        }
        internal void Move(Vector3 destination, float dt, float speed)
        {
            var pos = transform.position;
            if ((lastGoal - destination).sqrMagnitude > 1 || (navigationClock -= dt) <= 0 ||
                Flat(pos, waypoint) < .12f)
            {
                waypoint = board.Next(pos, destination, .28f);
                lastGoal = destination;
                navigationClock = .4f;
            }
            var offset = waypoint - pos;
            offset.y = 0;
            bool move = offset.magnitude > .08f && Flat(pos, destination) > .62f;
            if (move)
            {
                transform.position = pos + offset.normalized * Mathf.Min(dt * speed, offset.magnitude);
                transform.rotation =
                    Quaternion.RotateTowards(transform.rotation, Quaternion.LookRotation(offset), dt * 350);
            }
            if (move != walking && animationRig)
            {
                bool human = animationRig.GetClip("YBot_Idle");
                string clip = human ? (move ? "YBot_Walk" : "YBot_Idle") : (move ? "Glide" : "Hover");
                if (animationRig.GetClip(clip))
                    animationRig.CrossFade(clip, .14f);
            }
            walking = move;
        }
        internal void Tick(Vector3 player, float targetHeight, Vector3 destination, bool contest, float dt)
        {
            if (!Alive || Hostage)
                return;
            if (Stun > 0)
            {
                Stun -= dt;
                return;
            }
            var eye = transform.position + Vector3.up * 1.43f;
            var ray = (player + Vector3.up * targetHeight) - eye;
            aimedAt = player + Vector3.up * targetHeight;
            bool sees = Physics.Raycast(eye, ray.normalized, out var hit, ray.magnitude + .4f, ~0,
                                        QueryTriggerInteraction.Ignore) &&
                        hit.collider.GetComponentInParent<ChapterPlayer>();
            if (contest || !sees || ray.magnitude > 6.5f)
                Move(destination, dt, contest ? 1.75f : 1.3f);
            else
            {
                if (walking && animationRig && animationRig.GetClip("YBot_Idle"))
                    animationRig.CrossFade("YBot_Idle", .14f);
                walking = false;
                Vector3 direction = player - transform.position;
                direction.y = 0;
                if (direction.sqrMagnitude > .01f)
                    transform.rotation = Quaternion.RotateTowards(transform.rotation,
                                                                  Quaternion.LookRotation(direction), dt * 340);
            }
            if (sees && (shotClock -= dt) <= 0)
            {
                shotClock = 1.5f + Mathf.Repeat(spawn.z, .65f);
                flash = .10f;
                arena.Incoming(arena.Firearms ? 8 : 5);
            }
        }
        internal static float Flat(Vector3 a, Vector3 b) => new Vector2(a.x - b.x, a.z - b.z).magnitude;
    }
}
