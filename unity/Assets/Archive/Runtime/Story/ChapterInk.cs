using System.Collections.Generic;
using UnityEngine;

namespace Archive
{
    // Grid cells describe traversable floor for the apparition's radius, in chapter metres.
    public sealed class ChapterInk : MonoBehaviour, IArchiveDamageable
    {
        public Transform visual;
        public Animation legacy;
        public Animator animator;
        public bool Staggered => stun > 0;
        const float Cell = .34f, Radius = .27f;
        readonly Collider[] overlaps = new Collider[24];
        readonly List<Vector3> route = new();
        readonly Queue<int> queue = new();
        const int NoParent = -2;
        int nx, nz, next, lastGoal = -1, area;
        bool[] passable;
        int[] parent;
        Vector2 origin;
        string pose;
        float stun, windup, recovery;
        Vector3 spawn;

        public void ResetToPhase(int phase)
        {
            area = phase;
            passable = null; lastGoal = -1; route.Clear();
            stun = phase == 3 ? 2.8f : 0;
            windup = recovery = 0; pose = "";
            spawn = phase == 3 ? new Vector3(13.8f, 0, 11.8f) : new Vector3(7.3f, 0, 9.15f);
            transform.position = spawn;
            gameObject.SetActive(false);
        }

        public void ReceiveHit(ArchiveHit hit)
        {
            if (!isActiveAndEnabled || hit.Damage <= 0) return;
            stun = Mathf.Max(stun, (hit.Weapon == "bow" ? 2.4f : 1.55f) * (hit.Headshot ? 1.5f : 1));
            windup = recovery = 0;
            SetPose("Stagger");
        }

        void SetPose(string nextPose)
        {
            if (pose == nextPose) return;
            pose = nextPose;
            if (legacy && legacy[nextPose] != null) legacy.CrossFade(nextPose, .12f);
            else if (animator && animator.runtimeAnimatorController && animator.HasState(0, Animator.StringToHash(nextPose)))
                animator.CrossFadeInFixedTime(nextPose, .13f);
        }

        Vector3 At(int i) => new(origin.x + i % nx * Cell, 0, origin.y + i / nx * Cell);
        bool OwnOrPlayer(Collider item) => item.transform.IsChildOf(transform) || item.GetComponentInParent<ChapterPlayer>();

        void BuildGrid()
        {
            bool vault = area == 3;
            origin = vault ? new Vector2(12.35f, 7.6f) : new Vector2(4.3f, 8.6f);
            nx = vault ? 17 : 10; nz = vault ? 16 : 11;
            passable = new bool[nx * nz]; parent = new int[passable.Length];
            for (int i = 0; i < passable.Length; i++)
            {
                Vector3 p = At(i); passable[i] = true;
                int count = Physics.OverlapCapsuleNonAlloc(p + Vector3.up * .31f, p + Vector3.up * 1.3f,
                    Radius, overlaps, ~0, QueryTriggerInteraction.Ignore);
                for (int j = 0; j < count; j++) if (!OwnOrPlayer(overlaps[j])) { passable[i] = false; break; }
            }
            int start = Nearest(spawn);
            if (start >= 0) transform.position = At(start);
        }

        int Nearest(Vector3 point)
        {
            point.y = 0;
            float best = float.PositiveInfinity; int index = -1;
            for (int i = 0; i < passable.Length; i++)
            {
                if (!passable[i]) continue;
                float d = (At(i) - point).sqrMagnitude;
                if (d < best) { best = d; index = i; }
            }
            return index;
        }

        void Plan(int goal)
        {
            int start = Nearest(transform.position);
            route.Clear(); next = 0; lastGoal = goal;
            if (start < 0 || goal < 0) return;
            System.Array.Fill(parent, NoParent);
            parent[start] = -1; queue.Clear(); queue.Enqueue(start);
            int best = start;
            float distance = (At(start) - At(goal)).sqrMagnitude;
            void Visit(int at, int from)
            {
                if (!passable[at] || parent[at] != NoParent) return;
                parent[at] = from; queue.Enqueue(at);
                float d = (At(at) - At(goal)).sqrMagnitude;
                if (d < distance) { best = at; distance = d; }
            }
            while (queue.Count > 0 && best != goal)
            {
                int i = queue.Dequeue();
                if (i % nx > 0) Visit(i - 1, i);
                if (i % nx + 1 < nx) Visit(i + 1, i);
                if (i >= nx) Visit(i - nx, i);
                if (i + nx < parent.Length) Visit(i + nx, i);
            }
            for (int i = best; i != -1; i = parent[i]) route.Add(At(i));
            route.Reverse();
        }

        bool ClearAttack(Vector3 player)
        {
            Vector3 from = transform.position + Vector3.up * .7f, to = new Vector3(player.x, from.y, player.z);
            if (!Physics.Raycast(from, to - from, out var hit, Vector3.Distance(from, to), ~0, QueryTriggerInteraction.Ignore)) return true;
            return OwnOrPlayer(hit.collider);
        }

        public void Step(int phase, Transform player, float dt, ExpeditionRuntime expedition)
        {
            Vector3 p = player.position;
            bool visible = Mathf.Abs(p.y) < 1.6f && (phase == 1 && p.x > 4.3f && p.x < 11.3f && Mathf.Abs(p.z - 10.3f) < 2.05f ||
                phase == 3 && p.x > 12.3f && p.x < 18.4f && Mathf.Abs(p.z - 10.3f) < 3.12f);
            if (gameObject.activeSelf != visible) gameObject.SetActive(visible);
            if (!visible) { windup = recovery = 0; return; }
            if (passable == null) BuildGrid();
            Vector3 delta = p - transform.position; delta.y = 0;
            if (delta.sqrMagnitude > .001f) transform.rotation = Quaternion.LookRotation(delta);
            if (stun > 0) { stun -= dt; SetPose("Stagger"); return; }
            bool exposed = delta.sqrMagnitude < .82f * .82f && ClearAttack(p);
            if (recovery > 0) { recovery -= dt; SetPose("Recover"); return; }
            if (windup > 0)
            {
                windup -= dt;
                if (windup <= 0) { if (exposed && expedition) expedition.Damage(36); recovery = .55f; }
                return;
            }
            if (exposed) { windup = .37f; SetPose("Windup"); return; }
            int goal = Nearest(p);
            if (goal != lastGoal) Plan(goal);
            if (next >= route.Count) { SetPose("Hover"); return; }
            SetPose("Glide");
            transform.position = Vector3.MoveTowards(transform.position, route[next], .9f * dt);
            if ((transform.position - route[next]).sqrMagnitude < .00001f) next++;
        }
    }
}
