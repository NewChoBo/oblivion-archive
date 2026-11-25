using System.Collections.Generic;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Archive
{
    public sealed class ChapterWeapons
    {
        sealed class Flight
        {
            public Vector3 Position, Velocity;
            public float Draw, Age;
            public GameObject Model;
        }
        readonly ChapterPlayer player;
        readonly PlayerRig rig;
        readonly Camera eyes;
        readonly List<Flight> arrows = new List<Flight>();
        readonly Queue<GameObject> marks = new Queue<GameObject>();
        readonly AudioSource audio, rechargeAudio, drawAudio;
        readonly AudioClip wandRelease, bowRelease, recharge, emptyWand, emptyBow;
        readonly Material ink, gold;
        readonly int[] localLoaded = { 6, 1 }, localReserve = { 18, 16 };
        ExpeditionRuntime Ledger => player.InArena ? null : player.Expedition;
        int selected;
        bool torch, charging, wandPending;
        float drawTime, castAge = 1, reloadTime = -1, cooldown;
        public int Selected => Ledger != null ? Ledger.Selected : selected;
        public bool TorchLit => Ledger != null ? Ledger.TorchLit : torch;
        public float Draw => charging ? Mathf.Clamp01(drawTime / .86f) : 0;
        public float Stroke => castAge < .28f ? castAge / .28f : -1;
        public float ReloadMotion =>
            reloadTime >= 0 ? Mathf.Clamp01(reloadTime / (Selected == 0 ? .95f : .88f)) : 0;
        public int Loaded(int slot) => slot > 1? 0 : Ledger != null? Ledger.Loaded(slot) : localLoaded[slot];
        public int Reserve(int slot) => slot > 1? 0 : Ledger != null? Ledger.Reserve(slot) : localReserve[slot];
        public int Shots { get; private set; }
        public int Headshots { get; private set; }
        public bool ShowHit { get; private set; }
        public bool LastHitWasHead { get; private set; }
        float markerRemaining;
        public string LastImpact { get; private set; } = "";
        internal ChapterWeapons(ChapterPlayer owner, PlayerRig rig, Camera camera)
        {
            player = owner;
            this.rig = rig;
            eyes = camera;
            audio = Channel(owner);
            rechargeAudio = Channel(owner);
            drawAudio = Channel(owner);
            drawAudio.loop = true;
            drawAudio.clip = Tone("Rune bow tension", 220, .2f, true);
            wandRelease = Resources.Load<AudioClip>("ArchivePlayer/laserSmall_000");
            bowRelease = Resources.Load<AudioClip>("ArchivePlayer/laserLarge_000");
            recharge = Resources.Load<AudioClip>("ArchivePlayer/forceField_000");
            emptyWand = Tone("Exhausted focus", 142, .11f);
            emptyBow = Tone("Empty quiver", 420, .055f);
            ink = PlayerRig.Mat(new Color(.20f, .80f, .93f), true);
            gold = PlayerRig.Mat(new Color(.93f, .70f, .28f), true);
        }
        static AudioSource Channel(ChapterPlayer owner)
        {
            var source = owner.gameObject.AddComponent<AudioSource>();
            source.playOnAwake = false;
            source.spatialBlend = 0;
            return source;
        }
        static AudioClip Tone(string name, float hz, float seconds, bool sustain = false)
        {
            const int rate = 22050;
            float[] samples = new float[Mathf.CeilToInt(seconds * rate)];
            for (int i = 0; i < samples.Length; i++)
            {
                float t = (float)i / rate;
                float phase = 2 * Mathf.PI * hz * t;
                samples[i] = sustain ? .22f * Mathf.Sin(phase) + .09f * Mathf.Sin(phase * 2)
                                     : Mathf.Sin(phase) * .36f * Mathf.Exp(-45 * t);
            }
            var clip = AudioClip.Create(name, samples.Length, 1, rate, false);
            clip.SetData(samples, 0);
            return clip;
        }
        void Sound(AudioClip clip, float pitch = 1)
        {
            if (!clip)
                return;
            // Nocking starts on the same frame as release. Each voice owns its pitch.
            var voice = clip == recharge ? rechargeAudio : audio;
            voice.pitch = pitch;
            voice.PlayOneShot(clip, .55f);
        }
        public void Cancel()
        {
            charging = wandPending = false;
            drawTime = 0;
            reloadTime = -1;
            castAge = 1;
            cooldown = 0;
            audio.Stop();
            drawAudio.Stop();
            rechargeAudio.Stop();
        }
        public void ResetTransient()
        {
            Cancel();
            ShowHit = false;
            markerRemaining = 0;
            foreach (var a in arrows)
                if (a.Model)
                    Object.Destroy(a.Model);
            arrows.Clear();
            while (marks.Count > 0)
            {
                var mark = marks.Dequeue();
                if (mark)
                    Object.Destroy(mark);
            }
        }
        public void ResetArena()
        {
            ResetTransient();
            selected = 0;
            torch = false;
            localLoaded[0] = 6;
            localLoaded[1] = 1;
            localReserve[0] = 18;
            localReserve[1] = 16;
        }
        public void Select(int slot)
        {
            if (slot == Selected)
                return;
            Cancel();
            if (Ledger != null)
                Ledger.Select(slot);
            else
                selected = slot;
        }
        void Reload()
        {
            int slot = Selected;
            if (slot > 1 || reloadTime >= 0 || wandPending || charging)
                return;
            if (Loaded(slot) >= (slot == 0 ? 6 : 1) || Reserve(slot) <= 0)
                return;
            reloadTime = 0;
            Sound(recharge, slot == 0 ? .9f : 1.55f);
        }
        bool Spend(int slot)
        {
            if (Ledger != null)
                return Ledger.Spend(slot);
            if (localLoaded[slot] <= 0)
                return false;
            localLoaded[slot]--;
            return true;
        }
        internal void Tick(float dt, PlayerBindings keys)
        {
            markerRemaining = Mathf.Max(0, markerRemaining - dt);
            ShowHit = markerRemaining > 0;
            UpdateArrows(dt);
            if (keys.Down(PlayerAction.Wand))
                Select(0);
            if (keys.Down(PlayerAction.Bow))
                Select(1);
            if (keys.Down(PlayerAction.Torch))
                Select(2);
            int slot = Selected;
            cooldown = Mathf.Max(0, cooldown - dt);
            castAge += dt;
            if (wandPending && castAge >= .09f)
            {
                wandPending = false;
                Release(0, 1);
            }
            if (keys.Down(PlayerAction.Reload))
                Reload();
            if (reloadTime >= 0)
            {
                reloadTime += dt;
                if (reloadTime >= (slot == 0 ? .95f : .88f))
                {
                    if (Ledger != null)
                        Ledger.Reload(slot);
                    else
                    {
                        int count = Mathf.Min((slot == 0 ? 6 : 1) - localLoaded[slot], localReserve[slot]);
                        localReserve[slot] -= count;
                        localLoaded[slot] += count;
                    }
                    reloadTime = -1;
                }
                return;
            }
            if (player.FirePressed && cooldown <= 0)
            {
                if (slot == 2)
                {
                    if (Ledger != null)
                        Ledger.SetTorch(!TorchLit);
                    else
                        torch = !torch;
                }
                else if (Loaded(slot) <= 0)
                {
                    Sound(slot == 0 ? emptyWand : emptyBow);
                    if (slot == 1)
                        Reload();
                }
                else if (slot == 0)
                {
                    wandPending = true;
                    castAge = 0;
                    cooldown = .28f;
                }
                else
                {
                    charging = true;
                    drawTime = 0;
                    drawAudio.volume = .08f;
                    drawAudio.pitch = .62f;
                    drawAudio.Play();
                }
            }
            if (charging)
            {
                drawTime += dt;
                drawAudio.pitch = Mathf.Lerp(.62f, 1.44f, Draw);
                drawAudio.volume = Mathf.Lerp(.08f, .25f, Draw);
                if (player.FireReleased || !player.FireHeld)
                {
                    float power = Draw;
                    charging = false;
                    drawAudio.Stop();
                    Release(1, power);
                    cooldown = .22f;
                    Reload();
                }
            }
        }
        Vector3 Aim()
        {
            Vector3 origin = eyes.transform.position, dir = eyes.transform.forward;
            return rig.Cast(origin, dir, 100, out var hit) ? hit.point : origin + dir * 100;
        }
        void Release(int slot, float power)
        {
            if (!Spend(slot))
                return;
            Shots++;
            Sound(slot == 0 ? wandRelease : bowRelease, slot == 0 ? 1 : .75f + .3f * power);
            Vector3 origin = rig.Tip, toTip = origin - rig.Eye;
            if (rig.Cast(rig.Eye, toTip.normalized, toTip.magnitude, out var obstruction))
            {
                Impact(obstruction, slot, power, toTip.normalized);
                return;
            }
            Vector3 aim = Aim(), dir = (aim - origin).normalized;
            if (slot == 0)
            {
                Vector3 endpoint = origin + dir * 100;
                if (rig.Cast(origin, dir, 100, out var hit))
                {
                    endpoint = hit.point;
                    Impact(hit, slot, power, dir);
                }
                Beam(origin, endpoint, .016f, ink, .12f);
                return;
            }
            var visible = Beam(origin - dir * .35f, origin, .015f, gold, 0);
            arrows.Add(new Flight { Position = origin, Velocity = dir * Mathf.Lerp(16, 52, power), Draw = power,
                                    Model = visible });
        }
        void UpdateArrows(float dt)
        {
            for (int i = arrows.Count - 1; i >= 0; i--)
            {
                var a = arrows[i];
                a.Age += dt;
                float remaining = dt;
                bool hitAnything = false;
                while (remaining > 0)
                {
                    float step = Mathf.Min(remaining, 1f / 60f);
                    remaining -= step;
                    Vector3 delta = a.Velocity * step + Vector3.down * (4.9f * step * step);
                    if (rig.Cast(a.Position, delta.normalized, delta.magnitude, out var hit))
                    {
                        Impact(hit, 1, a.Draw, delta.normalized);
                        hitAnything = true;
                        break;
                    }
                    a.Position += delta;
                    a.Velocity += Vector3.down * (9.8f * step);
                }
                if (hitAnything || a.Age > 5)
                {
                    Object.Destroy(a.Model);
                    arrows.RemoveAt(i);
                    continue;
                }
                var trail = a.Model.GetComponent<LineRenderer>();
                trail.SetPosition(0, a.Position - a.Velocity.normalized * .36f);
                trail.SetPosition(1, a.Position);
            }
        }
        GameObject Beam(Vector3 start, Vector3 end, float width, Material material, float life)
        {
            var go = new GameObject("Spell trace");
            var l = go.AddComponent<LineRenderer>();
            l.sharedMaterial = material;
            l.positionCount = 2;
            l.startWidth = width;
            l.endWidth = width * .6f;
            l.SetPosition(0, start);
            l.SetPosition(1, end);
            if (life > 0)
                Object.Destroy(go, life);
            return go;
        }
        void Impact(RaycastHit hit, int slot, float power, Vector3 dir)
        {
            var collider = hit.collider;
            bool head = collider.TryGetComponent<ArchiveHitZone>(out var zone) && zone.head;
            LastImpact = collider.name;
            // Stored in the surface frame, so a struck arrow or seal travels with a moving gate.
            var trace = new GameObject(slot == 0 ? "Wand seal" : "Lodged arrow");
            trace.transform.SetPositionAndRotation(hit.point,
                                                   Quaternion.LookRotation(slot == 0 ? hit.normal : dir));
            trace.transform.SetParent(collider.transform, true);
            var line = trace.AddComponent<LineRenderer>();
            line.useWorldSpace = false;
            line.sharedMaterial = slot == 0 ? ink : gold;
            line.startWidth = slot == 0 ? .015f : .021f;
            line.endWidth = slot == 0 ? .015f : .009f;
            if (slot == 0)
            {
                line.loop = true;
                line.positionCount = 24;
                for (int i = 0; i < 24; i++)
                {
                    float a = i * Mathf.PI / 12;
                    line.SetPosition(i, new Vector3(Mathf.Cos(a) * .105f, Mathf.Sin(a) * .105f, .008f));
                }
            }
            else
            {
                line.positionCount = 2;
                line.SetPosition(0, Vector3.back * .42f);
                line.SetPosition(1, Vector3.forward * .035f);
            }
            marks.Enqueue(trace);
            while (marks.Count > 48)
            {
                var old = marks.Dequeue();
                if (old)
                    Object.Destroy(old);
            }
            Object.Destroy(trace, slot == 0 ? 6 : 18);
            int damage = Ledger != null ? Mathf.RoundToInt(Ledger.DamageFor(slot, power))
                         : slot == 0    ? 24
                                        : Mathf.RoundToInt(Mathf.Lerp(12, 48, power));
            if (Ledger == null || !Ledger.Hit(collider, slot, power))
            {
                var receiver = collider.GetComponentInParent<IArchiveDamageable>();
                if (receiver == null)
                    return;
                receiver.ReceiveHit(new ArchiveHit { Collider = collider, Weapon = slot == 0 ? "wand" : "bow",
                                                     Damage = head ? damage * 2 : damage, Headshot = head,
                                                     Point = hit.point, Direction = dir });
            }
            if (head)
                Headshots++;
            LastHitWasHead = head;
            markerRemaining = head ? .38f : .18f;
            ShowHit = true;
        }
    }
}
