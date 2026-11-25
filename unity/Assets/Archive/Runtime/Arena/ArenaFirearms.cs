using System.Linq;
using UnityEngine;

namespace Archive.Arena
{
    public sealed partial class ArchiveArena
    {
        public GameObject pistol, rifle;
        GameObject holder, model;
        string equipped;
        LineRenderer tracer;
        AudioSource firearmAudio;
        Material traceMaterial;
        Material markMaterial;
        Texture2D markTexture;
        float flashTime, recoil;
        Vector3 tip;
        void GunUpdate(float dt)
        {
            if (player.Bindings.Down(PlayerAction.Wand))
                armory.Select(0);
            if (player.Bindings.Down(PlayerAction.Bow))
                armory.Select(1);
            if (player.Bindings.Down(PlayerAction.Reload))
                armory.Reload();
            bool wasReloading = armory.Reloading;
            armory.Tick(dt);
            if (wasReloading && !armory.Reloading)
                Sound("forceField_000", .35f, 1.3f);
            EnsureGun();
            SetGunVisible(true);
            flashTime -= dt;
            tracer.enabled = flashTime > 0;
            recoil = Mathf.MoveTowards(recoil, 0, dt * 4);
            holder.transform.localPosition = Vector3.back * recoil * .045f;
            holder.transform.localRotation =
                Quaternion.Euler(armory.Reloading ? 29 : -7 * recoil, 0, armory.Reloading ? -17 : 0);
            if (!(armory.Automatic ? player.FireHeld : player.FirePressed))
                return;
            int damage = armory.Shoot();
            if (damage == 0)
            {
                if (player.FirePressed && armory.Magazine == 0 && armory.Reserve == 0)
                    Sound("forceField_000", .18f, 1.8f);
                return;
            }
            var view = player.ViewCamera.transform;
            shots++;
            var muzzle = holder.transform.TransformPoint(tip);
            var aim = First(view.position, view.forward, 110);
            Vector3 end = aim.HasValue ? aim.Value.point : view.position + view.forward * 110;
            var path = end - muzzle;
            // The camera chooses the aim point; low cover between the hand and that point wins.
            var actorEye = player.transform.position +
                           Vector3.up * (player.GetComponent<CharacterController>().height * .91f);
            var toMuzzle = muzzle - actorEye;
            var hit = First(actorEye, toMuzzle.normalized, toMuzzle.magnitude) ??
                      First(muzzle, path.normalized, path.magnitude + .04f);
            if (hit.HasValue)
            {
                var h = hit.Value;
                end = h.point;
                var recipient = h.collider.GetComponentInParent<IArchiveDamageable>();
                var zone = h.collider.GetComponent<ArchiveHitZone>();
                bool head = zone && zone.head;
                if (head && recipient != null)
                    headshots++;
                recipient?.ReceiveHit(new ArchiveHit { Collider = h.collider, Weapon = armory.Id, Point = end,
                                                       Direction = path.normalized,
                                                       Damage = head ? damage * 2 : damage, Headshot = head });
                if (recipient == null)
                    Scorch(h);
            }
            tracer.SetPosition(0, muzzle);
            tracer.SetPosition(1, end);
            tracer.enabled = true;
            flashTime = .07f;
            recoil = 1;
            Sound(armory.Automatic ? "laserLarge_000" : "laserSmall_000", .42f, armory.Automatic ? .76f : .88f);
        }
        RaycastHit? First(Vector3 origin, Vector3 direction, float length)
        {
            var hits = Physics.RaycastAll(origin, direction, length, ~0, QueryTriggerInteraction.Ignore);
            foreach (var h in hits.OrderBy(h => h.distance))
                if (!h.transform.IsChildOf(player.transform))
                    return h;
            return null;
        }
        void Sound(string key, float gain, float pitch)
        {
            if (!firearmAudio)
                firearmAudio = player.gameObject.AddComponent<AudioSource>();
            var clip = Resources.Load<AudioClip>("ArchivePlayer/" + key);
            if (clip)
            {
                firearmAudio.pitch = pitch;
                firearmAudio.PlayOneShot(clip, gain);
            }
        }
        void EnsureGun()
        {
            if (!holder)
            {
                holder = new GameObject("Practice weapon");
                holder.transform.SetParent(player.FirearmMount, false);
                tracer = holder.AddComponent<LineRenderer>();
                traceMaterial = new Material(Shader.Find("Sprites/Default"));
                tracer.sharedMaterial = traceMaterial;
                tracer.positionCount = 2;
                tracer.useWorldSpace = true;
                tracer.startWidth = .022f;
                tracer.endWidth = .009f;
                tracer.startColor = new Color(1, .86f, .38f);
                tracer.endColor = new Color(1, .39f, .12f, .55f);
                tracer.enabled = false;
            }
            if (equipped == armory.Id && model)
                return;
            if (model)
            {
                model.SetActive(false);
                Destroy(model);
            }
            equipped = armory.Id;
            bool longGun = armory.Automatic;
            model = AttachBlaster(holder.transform, longGun, out tip);
        }
        internal GameObject AttachBlaster(Transform grip, bool longGun, out Vector3 muzzle)
        {
            var model = Instantiate(longGun ? rifle : pistol, grip);
            // The imported blasters' bores face local -Z. The hand and aim ray use +Z.
            model.transform.localRotation = Quaternion.Euler(0, 180, 0);
            model.transform.localPosition = Vector3.zero;
            // Kenney's grip sits behind the centre; scale the authored longitudinal extent in metres.
            var renderers = model.GetComponentsInChildren<Renderer>();
            var local = new Bounds();
            bool first = true;
            foreach (var r in renderers)
            {
                var bounds = r.localBounds;
                for (int k = 0; k < 8; k++)
                {
                    var v = bounds.center + Vector3.Scale(bounds.extents, new Vector3((k & 1) == 0 ? -1 : 1,
                                                                                      (k & 2) == 0 ? -1 : 1,
                                                                                      (k & 4) == 0 ? -1 : 1));
                    v = grip.InverseTransformPoint(r.transform.TransformPoint(v));
                    if (first)
                    {
                        local = new Bounds(v, Vector3.zero);
                        first = false;
                    }
                    else
                        local.Encapsulate(v);
                }
            }
            float scale = (longGun ? .71f : .31f) / Mathf.Max(.01f, local.size.z);
            model.transform.localScale *= scale;
            model.transform.localPosition = new Vector3(-local.center.x * scale, .075f - local.center.y * scale,
                                                        (longGun ? .21f : .09f) - local.center.z * scale);
            muzzle = new Vector3(0, .105f, model.transform.localPosition.z + local.max.z * scale);
            return model;
        }
        readonly System.Collections.Generic.Queue<GameObject> marks = new();
        void Scorch(RaycastHit hit)
        {
            if (!markMaterial)
            {
                markTexture =
                    new Texture2D(32, 32, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Clamp };
                for (int y = 0; y < 32; y++)
                    for (int x = 0; x < 32; x++)
                    {
                        var p = new Vector2((x - 15.5f) / 15.5f, (y - 15.5f) / 15.5f);
                        float edge = p.magnitude + .06f * Mathf.Sin(Mathf.Atan2(p.y, p.x) * 7);
                        float alpha = 1 - Mathf.SmoothStep(0, 1, Mathf.InverseLerp(.40f, .94f, edge));
                        markTexture.SetPixel(x, y, new Color(.105f, .083f, .07f, alpha));
                    }
                markTexture.Apply(true, true);
                markMaterial = new Material(Shader.Find("Sprites/Default")) { mainTexture = markTexture };
            }
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            go.GetComponent<Collider>().enabled = false;
            Destroy(go.GetComponent<Collider>());
            go.name = "Impact";
            go.transform.SetPositionAndRotation(hit.point + .002f * hit.normal,
                                                Quaternion.LookRotation(-hit.normal));
            go.transform.localScale = Vector3.one * .055f;
            go.transform.SetParent(hit.transform, true);
            var renderer = go.GetComponent<MeshRenderer>();
            renderer.sharedMaterial = markMaterial;
            marks.Enqueue(go);
            while (marks.Count > 40)
            {
                var old = marks.Dequeue();
                if (old)
                    Destroy(old);
            }
        }
        void SetGunVisible(bool visible)
        {
            if (holder)
                holder.SetActive(visible);
        }
        void ReleaseGun()
        {
            if (holder)
                Destroy(holder);
            if (traceMaterial)
                Destroy(traceMaterial);
            if (markMaterial)
                Destroy(markMaterial);
            if (markTexture)
                Destroy(markTexture);
            while (marks.Count > 0)
            {
                var mark = marks.Dequeue();
                if (mark)
                    Destroy(mark);
            }
            if (firearmAudio)
                firearmAudio.Stop();
            equipped = null;
        }
    }
}
