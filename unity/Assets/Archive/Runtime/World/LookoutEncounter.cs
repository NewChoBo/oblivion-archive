using UnityEngine;

namespace Archive.World
{
    public sealed class LookoutEncounter : MonoBehaviour
    {
        public Vector3 lookout;
        public GameObject creature;
        public AnimationClip swim;
        ChapterPlayer player;
        Renderer[] shell;
        MaterialPropertyBlock shade;
        float watched, elapsed;
        bool crossing, seen;
        void Awake()
        {
            player = GetComponent<ChapterPlayer>();
            shell = creature.GetComponentsInChildren<Renderer>(true);
            shade = new MaterialPropertyBlock();
        }
        void Update()
        {
            if (!player.CanAct || player.InArena)
                return;
            var p = transform.position - lookout;
            bool onTerrace = Mathf.Abs(p.x) <= 3.6f && Mathf.Abs(p.z) <= 3.6f && p.y >= -.1f && p.y < 3;
            if (!onTerrace)
            {
                seen = crossing = false;
                watched = elapsed = 0;
                if (creature.activeSelf)
                    creature.SetActive(false);
                return;
            }
            if (seen)
                return;
            if (!crossing)
            {
                watched = player.ViewCamera.transform.forward.x < -.7f ? watched + Time.deltaTime : 0;
                if (watched < .9f)
                    return;
                crossing = true;
                creature.SetActive(true);
            }
            elapsed = Mathf.Min(10, elapsed + Time.deltaTime);
            float t = elapsed / 10, yaw = -1.02f - t * .92f, elevation = .26f - t * .08f;
            var direction = new Vector3(Mathf.Sin(yaw) * Mathf.Cos(elevation), Mathf.Sin(elevation),
                                        Mathf.Cos(yaw) * Mathf.Cos(elevation));
            creature.transform.SetPositionAndRotation(
                lookout + Vector3.up * 1.6f + direction * 32,
                Quaternion.Euler(-elevation * .56f * Mathf.Rad2Deg, (yaw + .21f) * Mathf.Rad2Deg, 0));
            if (swim)
                swim.SampleAnimation(creature, Mathf.Repeat(elapsed, swim.length));
            float fade = Mathf.SmoothStep(0, 1, Mathf.Clamp01(elapsed / 1.6f)) *
                         Mathf.SmoothStep(0, 1, Mathf.Clamp01((10 - elapsed) / 2.8f));
            shade.SetFloat("_Presence", fade);
            foreach (var r in shell)
                r.SetPropertyBlock(shade);
            if (elapsed >= 10)
            {
                seen = true;
                crossing = false;
                creature.SetActive(false);
            }
        }
    }
}
